# Chord

A Windows app that listens to your whole keyboard and mouse, lets you record a
trigger Windows has no idea about — a triple-click, a side-button gesture, a
two-key sequence — and runs whatever you want when it happens.

Lives in the tray. Ships as a real `.exe`. No account, no server, nothing leaves
your PC.

## Download

**[⬇ Download the latest release](https://github.com/Vansh-kap-98/chord/releases/latest)**

Grab **`Chord-Setup-<version>.exe`** from that page and run it. It installs for
your user only, so it never asks for admin rights, and it updates itself
whenever a new version ships. There is also a portable `.exe` on the same page
if you would rather not install anything — that one does not self-update.

Windows 10 or 11, 64-bit. The download is around 96 MB.

> **Windows will warn you the first time.** The app isn't code-signed yet, so
> SmartScreen shows *"Windows protected your PC"*. Click
> **More info → Run anyway**. Your
> antivirus may also flag it: Chord watches every key you press, which is
> genuinely what a keylogger does too. The difference is that it does nothing
> with them but match your own shortcuts, and it never talks to the network
> except to check this repo for updates. The source is all here if you'd rather
> read it or [build it yourself](DEVELOPING.md).

## ⭐ Star the repo

If Chord is useful to you, **star it**.

## What counts as a trigger

| Kind | What it is | Example |
| --- | --- | --- |
| **Combo** | Keys and buttons held together | `Ctrl + Middle Click` |
| **Sequence** | Keys pressed one after another | `Right Ctrl` then `M` |
| **Multi-click** | N clicks of one button in a window | Triple left-click |
| **Gesture** | Hold a button and stroke a shape | Right-drag ↓ then → |

Every trigger is recorded by demonstration — you press it, the app works out
what you meant, and it settles on its own without a confirm button.

## What a trigger can do

Press a hotkey · type text (Unicode, so emoji work) · launch a program · open a
file, folder or website · run a hidden PowerShell/CMD command · media and volume
keys · minimize/maximize/restore/close the active window · lock the PC, show
desktop, Task View, screenshot region.

## The colour is the state

The whole app — buttons, active section, keycaps, tray icon, taskbar icon — is
**green while the engine is listening** and **amber the moment it is paused**.
You never have to read a label to know whether it is armed.

The listening colour is yours to pick in Settings: green, pastel pink, white,
black, coral red or tan. Paused is always amber.

## The one important limitation

Chord **observes** input; it cannot swallow it. Windows does not let a normal
user-space app consume a keystroke before the focused application sees it.

So a trigger never *replaces* what the keys already do — your action runs *in
addition*. Bind `Ctrl+C` and you get a copy **and** your action.

This is why the app steers you toward triggers nothing else is listening for:

- mouse side buttons (Back / Forward)
- triple and quadruple clicks
- mouse gestures
- leader sequences (`Right Ctrl` then a letter)

The editor flags risky triggers as you record them, and warns when two of your
own shortcuts would both fire.

## Your shortcuts

Stored as plain JSON in `%APPDATA%\Chord`, with Export and Import buttons in
Settings — easy to back up or move to another PC.

---

Building from source, running the tests and cutting releases are covered in
**[DEVELOPING.md](DEVELOPING.md)**. MIT licensed.
