# Windows desktop app

An Electron wrapper that runs both games in one window with nothing else to install.

- `main.cjs` serves `dist/` at the fixed address `snowday://game/`, so the pixel game and the
  3D game share one browser storage (their saves) and keep it between runs. Saves live in
  `%APPDATA%\Darren's Snowday Search`.
- `home/` is the start screen that picks a game (keys 1/2, mouse or controller).
- Menu: Game (Ctrl+H start screen, Ctrl+1 pixel, Ctrl+2 3D), View (F11 full screen, reload,
  zoom), Test (developer tools, open save folder).

## Updates (no new download for game changes)

The app updates its game by itself. Every start it reads `latest.json` from the
`game-updates` branch of the GitHub repo, and when that game is newer it downloads only the
files whose SHA-256 changed (unchanged files are copied from the game it already has),
checks every file, and switches over the next time the start screen shows. The start screen
says "The game was updated!" once, with the newest changelog title. Offline or on any
error it keeps the game it has. Saves are untouched (they belong to `snowday://game`, not to
the files).

- `updater.cjs`: checking, downloading and switching. Downloads live in
  `%APPDATA%\Darren's Snowday Search\game-updates\`; the bundled game in `resources/game`
  is never changed, so Test > "Go back to the game that came with the app" always works.
- `game-manifest.cjs`: the file list with sizes and SHA-256 and a build number (the git
  commit time).
- Publishing: `.github/workflows/publish-game-update.yml` runs
  `tools/publish-game-update.cjs` on every push to main that touches `dist/` and replaces
  the `game-updates` branch. Nothing else is needed: merge to main and every app picks it
  up on its next start.
- Access: the repo is private, so the build bakes a read-only GitHub key into
  `resources/update-config.json`, taken from `SNOWDAY_UPDATE_TOKEN` or
  `desktop-app/update-token.txt` (git-ignored, never committed). Without a key the app reads
  `raw.githubusercontent.com`, which only works for a public repo.
- A new app download is needed only when the app shell itself changes. Then raise `version`
  in package.json and `MIN_APP` in tools/publish-game-update.cjs; older apps will say
  a new copy of the app is needed instead of installing a game they can't run.
- `SNOWDAY_UPDATE_URL` (a plain web folder with `latest.json` and `game/`) and
  `SNOWDAY_NO_UPDATES=1` are for testing.

## Build

```
cd desktop-app
npm install
npm run build:win
```

This writes `out/Darren-Snowday-Windows/` and `out/Darren-Snowday-Windows.zip` (about
180 MB; most of it is Electron's Chromium). It works from Linux, Mac or Windows and needs no
Wine. The games are copied in from `../dist` at build time, so rebuild after changing them.
`npm start` runs the app straight from the checkout.

The .exe is not code-signed, so Windows SmartScreen shows "Windows protected your PC" the
first time; More info, then Run anyway.

## Test

`node tests/desktop-update.cjs` (part of `npm test`) checks the updater against a local web
server: only changed files download, checksums and unsafe file names are refused, no
downgrades, offline and damaged downloads fall back safely.

`node tests/desktop-app.cjs` (from the repo root, with Playwright installed) launches the app
and checks the start screen, both games, shared and persistent saves, and that it stays on
its own files. Pass the executable of a Linux build
(`DESKTOP_PLATFORM=linux npm run build:win`) to check the packaged layout. It cannot run
the Windows .exe.
