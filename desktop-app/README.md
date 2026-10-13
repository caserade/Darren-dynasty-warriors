# Standalone Windows desktop app

Version 1.4.0 (studio pass for Darren and Tormund) runs both bundled games in one window with nothing else to install.
There is no updater: no startup check, background download, update prompt, credentials,
or switch to a previously downloaded game. It always serves `resources/game` (or
`../dist` when running from a checkout).

## Play and replace manually

Extract the ZIP into a new folder, then double-click `Darren Snowday.exe`. Keep the
whole folder together. For a future version, close the old app, extract the new ZIP
into another folder, and launch its EXE. Update your shortcut to point to the new EXE.
An old ZIP or installation will not update automatically.

Both games still use `snowday://game/` and the same application name, so existing saves,
sound and controller settings remain in `%APPDATA%\Darren's Snowday Search`. Do not
delete that save folder when replacing the app. Old downloaded game files in its
`game-updates` subfolder are ignored and left untouched. No credential setup is needed.

The start screen selects Pixel or 3D (1/2, mouse or controller). Ctrl+H returns to it,
Ctrl+1/Ctrl+2 switch games, and F11 toggles full screen. Test > Open save folder remains.
The EXE is unsigned, so Windows SmartScreen may show a warning on a new computer.

## Build

```
cd desktop-app
npm install
npm run build:win
```

This writes `out/Darren-Snowday-Windows/` and its ZIP. Most of its roughly 180 MB is
Electron's Chromium. Linux/Mac can build Windows packages without Wine;
`DESKTOP_PLATFORM=linux` builds a Linux test package. `npm start` runs from the checkout.

The build retains credential safeguards: an exact runtime file allowlist, temporary
staging, checks for credential-like files and recognizable tokens/private keys, and
rejection of environment files, links and obsolete updater config/code. Remove any
old `SNOWDAY_UPDATE_TOKEN` from the build shell; it has no runtime use. Never put
private files in game assets: known-pattern guards cannot identify every possible
secret or encoding. The project return-ZIP tool retains these guards and omits nested
dependencies and previous build outputs. No update-publishing workflow remains.

## Test

`npm test` includes gameplay regressions, packaging guard tests and standalone runtime
tests proving bundled-only serving, no updater network calls, absent updater UI and
unchanged save/cached-game files. `node tests/desktop-app.cjs [packaged-executable]`
uses Playwright for interactive desktop checks with a temporary save profile.
