# Windows desktop app

Version 1.9.0 runs both bundled games in one window with nothing else to install, and keeps
the game up to date from GitHub.

## Play

Extract the ZIP into a new folder, then double-click `Darren Snowday.exe`. Keep the whole
folder together. The app opens on the 3D game's title screen; its main menu has Story Mode,
Free Mode, Heroes, Options, Update and the Pixel Adventure. Ctrl+H returns to the title
screen, Ctrl+1 opens the pixel game, Ctrl+2 the old two-game chooser, F11 toggles full screen.
The EXE is unsigned, so Windows SmartScreen may show a warning on a new computer.

Saves, sound and controller settings live in `%APPDATA%\Darren's Snowday Search` (Test >
Open save folder). Both games use `snowday://game/`, so saves carry over between app
versions and through updates. Do not delete that folder when replacing the app.

## Updates

Every push to `main` runs `.github/workflows/publish-game-update.yml`:

1. If `desktop-app/package.json` has a version with no release yet, it builds the Windows
   app and publishes it as the GitHub release `app-v<version>`.
2. `tools/publish-game-update.cjs` writes `latest.json` (build number = commit time, the
   newest CHANGELOG title as notes, every file's size and SHA-256, the newest app release)
   and a copy of `dist/` as `game/`, and the workflow force-pushes them as the one-commit
   `game-updates` branch.

The app (`updater.cjs`) reads `latest.json` from
`raw.githubusercontent.com/caserade/darren-dynasty-warriors/game-updates/` a few seconds
after it starts and every hour. This needs the repository to be **public**; no key is used
or stored anywhere. When a newer game is listed:

- the title screen and main menu show a notice, the Update menu item is marked NEW, and the
  window title says "update available";
- Update > Update now (or Game > Check for updates in the menu bar) downloads only files
  whose checksum the current game lacks, checks every byte, writes the new game to
  `updates/b<build>/` in the save folder, and restarts the page on the title screen. The
  title screen then says the game was updated;
- a failed or interrupted download leaves the current game in use; a damaged install falls
  back to the bundled game at the next start. The bundled `resources/game` is never changed.
  Test > Use the game that came with the app removes downloaded games.

A game that needs a newer app shell sets `minApp` (`MIN_APP` in the publish tool); older
apps then say a new app is needed instead of installing it. When `latest.json` names a
newer app release, the Update page offers Get the new app, which opens its GitHub release
page in the browser. The app itself is replaced by hand: extract the new ZIP into a new
folder and run it.

The game pages reach the updater only through `preload.cjs` (`window.snowdayDesktop.updates`:
status, check, install, seen, getApp, onStatus); the main process refuses those calls from
any page outside `snowday://game/`. The browser versions of the game have no Update item.

For tests, `SNOWDAY_UPDATE_URL` points the app at any web folder holding `latest.json` and
`game/`; `SNOWDAY_NO_UPDATES=1` switches updates off.

## Build

```
cd desktop-app
npm install
npm run build:win
```

This writes `out/Darren-Snowday-Windows/` and its ZIP, with `resources/game-manifest.json`
for the updater. Most of its roughly 180 MB is Electron's Chromium. Linux/Mac can build
Windows packages without Wine; `DESKTOP_PLATFORM=linux` builds a Linux test package.
`npm start` runs from the checkout. After `npm install`, run `node node_modules/electron/install.js`
if Electron's own download was interrupted.

The build keeps its safeguards: an exact runtime file list, temporary staging, and refusal
of credential-like files, recognizable tokens or private keys, environment files, links and
update settings files. Never put private files in game assets.

## Test

`npm test` includes `tests/desktop-update.cjs` (the updater against a local stand-in for
GitHub: offers, partial downloads, checksums, unsafe names, offline, needs-app, new app
notice, fallback) and `tests/desktop-standalone.cjs` (main.cjs with a stand-in Electron:
public source with no key, IPC refused outside the game). `node tests/desktop-app.cjs
[packaged-executable]` drives the real app with Playwright, including a full update through
the in-game Update page against a local web folder.
