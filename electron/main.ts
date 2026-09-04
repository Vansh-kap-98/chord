import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Action,
  CaptureMode,
  EngineStatus,
  FireLogEntry,
  Settings,
  Shortcut,
} from '@shared/types';
import { CH, type AppSnapshot, type ShortcutDraft } from '@shared/ipc';
import { describeAction, describeTrigger } from '@shared/tokens';
import { HookService } from './engine/hook';
import { Recorder } from './engine/recorder';
import { Store } from './store';
import { Synth } from './actions/synth';
import { executeAction } from './actions/executor';

/** dist-electron/ sits next to dist/ and build/ inside the app root. */
const DIR = __dirname;
const ROOT = path.join(DIR, '..');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/** Packaged builds put synth.ps1 in resources/; dev reads it from the repo. */
function resourcePath(...parts: string[]): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(ROOT, 'resources', ...parts);
}

/** Icons live beside synth.ps1 once packaged; in dev they sit in build/. */
function assetPath(...parts: string[]): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(ROOT, 'build', ...parts);
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let nextLogId = 1;
/** Accent hex (without '#') the tray and window icons currently show. */
let paintedIconState: string | null = null;

const store = new Store();
const synth = new Synth(resourcePath('synth.ps1'));
const hook = new HookService(onShortcutFired);
let recorder: Recorder | null = null;

// --------------------------------------------------------------- broadcast

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function engineStatus(): EngineStatus {
  const s = hook.status;
  return {
    running: s.running,
    synthReady: synth.ready,
    synthError: synth.lastError,
    eventsSeen: s.eventsSeen,
    startedAt: s.startedAt,
  };
}

function pushStatus(): void {
  send(CH.pushStatus, engineStatus());
  updateTrayMenu();
  applyStateIcons();
}

/**
 * The event counter changes constantly, but rebuilding the tray menu that
 * often would be wasteful -- so the ticker pushes to the window only, and only
 * while there is a visible window to receive it.
 */
function startStatusTicker(): void {
  setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.webContents.send(CH.pushStatus, engineStatus());
    }
  }, 1000);
}

function pushShortcuts(): void {
  send(CH.pushShortcuts, store.shortcuts);
  hook.matcher.setShortcuts(store.shortcuts);
  updateTrayMenu();
}

// ------------------------------------------------------------------ firing

async function onShortcutFired(shortcut: Shortcut): Promise<void> {
  const startedAt = Date.now();
  // Deafen the matcher first: the keys we are about to synthesize come straight
  // back through the same global hook and would otherwise retrigger us.
  hook.matcher.guard(store.settings.echoGuardMs);

  let ok = true;
  let error: string | undefined;
  try {
    await executeAction(shortcut.action, synth);
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }

  store.recordFire(shortcut.id);

  const entry: FireLogEntry = {
    id: nextLogId++,
    at: startedAt,
    shortcutId: shortcut.id,
    shortcutName: shortcut.name,
    triggerLabel: describeTrigger(shortcut.trigger),
    actionLabel: describeAction(shortcut.action),
    ok,
    error,
    latencyMs: Date.now() - startedAt,
  };
  send(CH.pushFire, entry);
  send(CH.pushShortcuts, store.shortcuts);

  if (!ok && store.settings.showNotifications && Notification.isSupported()) {
    new Notification({
      title: `"${shortcut.name}" failed`,
      body: error ?? 'Unknown error',
      icon: assetPath('icon.png'),
    }).show();
  }
}

// ------------------------------------------------------------------ engine

/**
 * Paints the tray and window icons green while the hook is live and amber
 * while it is paused, matching the status badge in the title bar. Driven by
 * the hook's real state rather than the setting, so a failed start shows as
 * paused instead of lying.
 */
/** Yellow-orange, matching PAUSED_ACCENT in src/theme.ts. */
const PAUSED_HEX = 'e8892b';
const DEFAULT_HEX = '3fb950';

function applyStateIcons(): void {
  // Icon files are named by accent hex, so the key comes straight from the
  // setting. Paused always wins, whatever colour the user picked for live.
  const key = hook.status.running
    ? (store.settings.accent || '').replace('#', '').toLowerCase() || DEFAULT_HEX
    : PAUSED_HEX;

  // Repainting on every status push would rebuild two images a second.
  if (key === paintedIconState) return;
  // Only record the state once something was actually painted, so an early
  // status event that arrives before the tray exists does not skip the paint.
  if (!tray) return;

  // Resolve with at most one fallback and never by recursing: `key` is fixed
  // for the paused state, so retrying after a miss would loop forever. A
  // missing icon file must also never rewrite the user's chosen accent.
  let trayImage = nativeImage.createFromPath(assetPath(`tray-${key}.png`));
  let windowImage = nativeImage.createFromPath(assetPath(`icon-${key}.png`));
  if (trayImage.isEmpty() && key !== DEFAULT_HEX) {
    trayImage = nativeImage.createFromPath(assetPath(`tray-${DEFAULT_HEX}.png`));
    windowImage = nativeImage.createFromPath(assetPath(`icon-${DEFAULT_HEX}.png`));
  }
  // Nothing usable on disk: keep whatever is showing rather than clearing it.
  if (trayImage.isEmpty()) return;

  // Record the requested key, not the one that resolved, so a miss does not
  // retry on every status tick.
  paintedIconState = key;
  tray.setImage(trayImage);
  if (win && !win.isDestroyed() && !windowImage.isEmpty()) win.setIcon(windowImage);
}

function applyEngineState(): void {
  if (store.settings.engineEnabled) hook.start();
  else hook.stop();
  hook.matcher.setShortcuts(store.shortcuts);
  pushStatus(); // Repaints the state icons as part of the broadcast.
}

function applyAutoStart(settings: Settings): void {
  // Only a packaged build has a stable exe path worth registering; in dev this
  // would point Windows at electron.exe and litter the Run key.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    path: process.execPath,
    args: settings.startMinimized ? ['--hidden'] : [],
  });
}

// ------------------------------------------------------------------ window

function createWindow(showImmediately: boolean): void {
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 940,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#0b0d14',
    icon: assetPath('icon.png'),
    webPreferences: {
      preload: path.join(DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => {
    if (showImmediately) win?.show();
  });

  win.on('close', (event) => {
    if (!isQuitting && store.settings.minimizeToTray) {
      event.preventDefault();
      win?.hide();
    }
  });

  win.on('maximize', () => send('push:maximized', true));
  win.on('unmaximize', () => send('push:maximized', false));

  // External links open in the real browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(ROOT, 'dist', 'index.html'));
}

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow(true);
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// -------------------------------------------------------------------- tray

function updateTrayMenu(): void {
  if (!tray) return;
  const enabled = store.settings.engineEnabled;
  const active = store.shortcuts.filter((s) => s.enabled).length;

  // Pinned shortcuts are switchable straight from the tray: each is a checkbox
  // bound to its own `enabled` flag, so the menu is a control surface rather
  // than a read-only list.
  const pinned = store.shortcuts.filter((s) => s.pinned);
  const pinnedItems: Electron.MenuItemConstructorOptions[] = pinned.length
    ? [
        { label: 'Pinned', enabled: false },
        ...pinned.map((s) => ({
          label: `${s.name}  —  ${describeTrigger(s.trigger)}`,
          type: 'checkbox' as const,
          checked: s.enabled,
          click: () => {
            store.updateShortcut(s.id, { enabled: !s.enabled });
            pushShortcuts(); // Re-renders the menu and re-arms the matcher.
          },
        })),
        { type: 'separator' as const },
      ]
    : [];

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Chord — ${active} active`, enabled: false },
      { type: 'separator' },
      {
        label: enabled ? 'Pause listening' : 'Resume listening',
        click: () => {
          store.setSettings({ engineEnabled: !enabled });
          applyEngineState();
          send(CH.pushSettings, store.settings);
        },
      },
      { label: 'Open Chord', click: showWindow },
      { type: 'separator' },
      ...pinnedItems,
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.setToolTip(enabled ? `Chord — listening (${active} active)` : 'Chord — paused');
}

function createTray(): void {
  // Starts paused-coloured; applyEngineState paints the real state moments later.
  const image = nativeImage.createFromPath(assetPath(`tray-${PAUSED_HEX}.png`));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  updateTrayMenu();
}

// ------------------------------------------------------------ capture zones

interface DomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureZones {
  /** The recorder's drop target, in physical screen pixels. */
  stage: DomRect | null;
  /** The whole app window, in physical screen pixels. */
  window: DomRect | null;
}

function contains(rect: DomRect | null, x: number, y: number): boolean {
  return (
    !!rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  );
}

/**
 * Converts the renderer's capture-stage rectangle into screen pixels so the
 * recorder can tell "the user clicked into the capture box" apart from "the
 * user clicked Cancel". libuiohook reports physical pixels; Electron reports
 * DIPs, hence the conversion.
 */
function captureZones(stage?: DomRect): CaptureZones {
  if (!win || win.isDestroyed()) return { stage: null, window: null };
  const content = win.getContentBounds();
  const windowRect = screen.dipToScreenRect(win, win.getBounds());
  if (!stage) return { stage: null, window: windowRect };
  const stageRect = screen.dipToScreenRect(win, {
    x: content.x + Math.round(stage.x),
    y: content.y + Math.round(stage.y),
    width: Math.round(stage.width),
    height: Math.round(stage.height),
  });
  return { stage: stageRect, window: windowRect };
}

/** True for mouse input aimed at our own chrome rather than at the recorder. */
function isOwnUiMouseEvent(
  event: { type: string; token?: string; x?: number; y?: number },
  zone: CaptureZones,
): boolean {
  const isMouse = event.type === 'move' || (event.token?.startsWith('Mouse.') ?? false);
  if (!isMouse) return false;
  const x = event.x ?? 0;
  const y = event.y ?? 0;
  if (contains(zone.stage, x, y)) return false; // Inside the drop target: record it.
  return contains(zone.window, x, y);
}

// --------------------------------------------------------------------- IPC

function registerIpc(): void {
  ipcMain.handle(CH.getSnapshot, (): AppSnapshot => ({
    settings: store.settings,
    shortcuts: store.shortcuts,
    status: engineStatus(),
    storePath: store.filePath,
    version: app.getVersion(),
  }));

  ipcMain.handle(CH.addShortcut, (_e, draft: ShortcutDraft) => {
    const created = store.addShortcut(draft);
    pushShortcuts();
    return created;
  });

  ipcMain.handle(CH.updateShortcut, (_e, id: string, patch: Partial<Shortcut>) => {
    const updated = store.updateShortcut(id, patch);
    pushShortcuts();
    return updated;
  });

  ipcMain.handle(CH.deleteShortcut, (_e, id: string) => {
    const removed = store.deleteShortcut(id);
    pushShortcuts();
    return removed;
  });

  ipcMain.handle(CH.setSettings, (_e, patch: Partial<Settings>) => {
    const settings = store.setSettings(patch);
    if ('autoStart' in patch || 'startMinimized' in patch) applyAutoStart(settings);
    if ('engineEnabled' in patch) applyEngineState();
    // Broadcast so the window repaints immediately. Without this the renderer
    // kept its stale copy until some other event pushed settings, which is why
    // a new accent only appeared after pausing and resuming.
    send(CH.pushSettings, settings);
    if ('accent' in patch) applyStateIcons();
    updateTrayMenu();
    return settings;
  });

  ipcMain.handle(CH.setEngineEnabled, (_e, enabled: boolean) => {
    store.setSettings({ engineEnabled: enabled });
    applyEngineState();
    send(CH.pushSettings, store.settings);
    return engineStatus();
  });

  ipcMain.handle(CH.testAction, async (_e, action: Action) => {
    hook.matcher.guard(store.settings.echoGuardMs);
    try {
      await executeAction(action, synth);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(CH.startCapture, (_e, mode: CaptureMode, stage?: DomRect) => {
    recorder?.cancel();
    // Capture needs the hook alive even when the user has listening paused.
    hook.start();
    const zone = captureZones(stage);
    recorder = new Recorder({
      mode,
      sequenceGapMs: store.settings.defaultSequenceGapMs,
      multiClickWindowMs: store.settings.defaultMultiClickWindowMs,
      gestureDistance: 45,
      onProgress: (progress) =>
        send(CH.pushCaptureProgress, {
          mode: progress.mode,
          held: progress.held,
          label: progress.label,
          clicks: progress.clicks,
          path: progress.path,
        }),
      onResult: (result) => {
        send(CH.pushCaptureResult, result);
        stopCapture();
      },
    });
    hook.setCapturing((event) => {
      if (!recorder) return;
      if (isOwnUiMouseEvent(event, zone)) return;
      recorder.handle(event);
    });
  });

  ipcMain.handle(CH.commitCapture, () => {
    recorder?.commit();
  });

  ipcMain.handle(CH.cancelCapture, () => {
    recorder?.cancel();
    stopCapture();
  });

  ipcMain.handle(CH.pickExecutable, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a program',
      properties: ['openFile'],
      filters: [
        { name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(CH.pickPath, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a file or folder',
      properties: ['openFile', 'openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(CH.exportShortcuts, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export shortcuts',
      defaultPath: 'shortcuts.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' };
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(store.shortcuts, null, 2), 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(CH.importShortcuts, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import shortcuts',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled) return { ok: false, error: 'cancelled' };
    try {
      const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('file does not contain a shortcut list');
      store.replaceAll(parsed);
      pushShortcuts();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(CH.revealStore, () => {
    store.flush();
    shell.showItemInFolder(store.filePath);
  });

  ipcMain.handle(CH.minimizeWindow, () => win?.minimize());
  ipcMain.handle(CH.toggleMaximize, () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle(CH.hideWindow, () => win?.hide());
  ipcMain.handle(CH.quitApp, () => {
    isQuitting = true;
    app.quit();
  });
}

function stopCapture(): void {
  recorder = null;
  hook.setCapturing(null);
  // Restore whatever listening state the user actually asked for.
  applyEngineState();
}

// ------------------------------------------------------------------ updates

/**
 * How often an already-running copy re-checks the feed. Chord is a tray app
 * that starts at sign-in and is meant to be left alone for weeks, so a check
 * that only ran at startup would mean most users never saw an update at all.
 */
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** One restart prompt at a time, however many checks have completed. */
let restartPromptOpen = false;
/**
 * Version the user has already answered "Later" to. A periodic check that
 * finds the staged build still on disk re-emits 'update-downloaded', so
 * without this the same declined update would reopen its dialog every six
 * hours. Session-scoped on purpose: declining is "not now", not "never", and
 * autoInstallOnAppQuit still applies it whenever the app is next closed.
 */
let deferredVersion: string | null = null;

/**
 * Checks the GitHub Release feed configured in electron-builder.yml, downloads
 * a newer build in the background and offers a restart once it is on disk.
 *
 * The comparison is package.json's `version` against the version named in the
 * Release's latest.yml -- nothing else. A release that forgets to bump that
 * field never reaches installed clients.
 */
function initAutoUpdate(): void {
  // A dev run has no packaged version to compare and no feed to read, so
  // electron-updater would only throw "dev-app-update.yml not found" on every
  // start.
  if (!app.isPackaged) return;

  // The portable exe unpacks itself into a temp directory and runs from there,
  // so there is no install for the updater to write over -- it would download
  // the whole installer and then either fail or replace a copy about to be
  // deleted. electron-builder sets this variable only for portable builds, and
  // latest.yml points at the NSIS installer alone for the same reason.
  if (process.env.PORTABLE_EXECUTABLE_FILE) return;

  // Routes electron-updater's own internal logging to stderr. Without it a
  // failed feed fetch is swallowed whole and the app just never updates.
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.info('[update] checking the release feed');
  });

  autoUpdater.on('update-not-available', (info) => {
    console.info(`[update] already current at ${info.version}`);
  });

  autoUpdater.on('update-available', (info) => {
    console.info(`[update] ${info.version} available, downloading in background`);
  });

  // Logged at whole percents only: the raw event fires per chunk and would
  // otherwise bury every other line in the log.
  let lastPercent = -1;
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.floor(progress.percent);
    if (percent === lastPercent) return;
    lastPercent = percent;
    console.info(`[update] downloading ${percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.info(`[update] ${info.version} staged, awaiting restart`);
    void promptRestart(info.version);
  });

  // A missing network, a rate-limited API or an unparseable feed all land
  // here. None of them are worth interrupting the user over -- the app keeps
  // working perfectly well un-updated -- but none of them should vanish either.
  autoUpdater.on('error', (err) => {
    console.error('[update] check failed:', err?.message ?? err);
  });

  // A failed check both emits 'error' and rejects this promise, so the handler
  // above has already reported it. The catch exists purely so the rejection is
  // not unhandled -- logging here too would print the same failure twice.
  //
  // checkForUpdates rather than checkForUpdatesAndNotify: the latter raises a
  // Windows toast of its own on top of the restart dialog below, which is the
  // same news delivered twice.
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});

  // Launched at sign-in, this runs while Windows is still bringing the network
  // up, and a check with no route out just burns the startup attempt. The
  // interval retries anyway, but not for six hours.
  setTimeout(check, 10_000);
  setInterval(check, UPDATE_INTERVAL_MS);
}

async function promptRestart(version: string): Promise<void> {
  // 'update-downloaded' can arrive more than once across a long-running
  // session -- a second release landing while the first is still sitting
  // undecided -- and each one would otherwise stack another modal.
  if (restartPromptOpen || deferredVersion === version) return;
  restartPromptOpen = true;

  let response: number;
  try {
    ({ response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 1, // Never steal a keystroke: this can surface mid-task.
      cancelId: 1,
      title: 'Update ready',
      message: `Chord ${version} is ready to install.`,
      detail:
        'The app will close, update and reopen. It installs on its own the next time you quit if you would rather wait.',
    }));
  } finally {
    restartPromptOpen = false;
  }
  if (response !== 0) {
    deferredVersion = version;
    return;
  }

  // The window's close handler swallows a close into the tray whenever
  // minimizeToTray is on, which would leave quitAndInstall waiting forever.
  // Same flag the tray's own Quit item sets.
  isQuitting = true;
  autoUpdater.quitAndInstall();
}

// ------------------------------------------------------------------ startup

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.setAppUserModelId('com.greni.chord');

  app.whenReady().then(() => {
    registerIpc();

    synth.on('status', pushStatus);
    synth.start();

    hook.on('status', pushStatus);
    hook.on('input-batch', (batch) => send(CH.pushInput, batch));

    createTray();
    startStatusTicker();

    const launchedHidden =
      process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
    createWindow(!(launchedHidden && store.settings.startMinimized));

    applyAutoStart(store.settings);
    applyEngineState();

    initAutoUpdate();
  });

  app.on('window-all-closed', () => {
    // Tray app: closing the window is not quitting.
  });

  app.on('before-quit', () => {
    isQuitting = true;
    hook.stop();
    synth.dispose();
    store.flush();
  });
}
