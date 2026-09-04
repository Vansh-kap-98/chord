import { useEffect } from 'react';
import { Rail, StatusBar, TitleBar } from './components/Shell';
import { Editor } from './components/Editor';
import { Toasts } from './components/Bits';
import { ShortcutsPage } from './pages/Shortcuts';
import { MonitorPage } from './pages/Monitor';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { applyTheme } from './theme';
import { connect, useApp } from './state';

const PAGES = {
  shortcuts: ShortcutsPage,
  monitor: MonitorPage,
  activity: ActivityPage,
  settings: SettingsPage,
} as const;

export default function App() {
  const page = useApp((s) => s.page);
  const accent = useApp((s) => s.settings.accent);
  const running = useApp((s) => s.status.running);
  const editorOpen = useApp((s) => s.editor !== null);

  useEffect(() => connect(), []);
  // The accent tracks the engine: the user's colour while listening, amber
  // while paused. Every brand-tinted surface in the app follows from here.
  useEffect(() => applyTheme(accent, running), [accent, running]);

  // The shortcuts page renders its own loading skeleton, so there is no
  // full-screen spinner: the shell is up immediately and fills in.
  const Page = PAGES[page];

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Rail />
        {/* Scroll area and status bar are stacked so the bar is part of the
            layout rather than a box floating inside the navigation. */}
        <div className="content">
          <main className="main">
            <Page />
          </main>
          <StatusBar />
        </div>
      </div>
      {editorOpen && <Editor />}
      <Toasts />
    </div>
  );
}
