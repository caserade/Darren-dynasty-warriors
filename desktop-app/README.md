# Windows desktop app

An Electron wrapper that runs both games in one window with nothing else to install.

- `main.cjs` serves `dist/` at the fixed address `snowday://game/`, so the pixel game and the
  3D game share one browser storage (their saves) and keep it between runs. Saves live in
  `%APPDATA%\Darren's Snowday Search`.
- `home/` is the start screen that picks a game (keys 1/2, mouse or controller).
- Menu: Game (Ctrl+H start screen, Ctrl+1 pixel, Ctrl+2 3D), View (F11 full screen, reload,
  zoom), Test (developer tools, open save folder).

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

`node tests/desktop-app.cjs` (from the repo root, with Playwright installed) launches the app
and checks the start screen, both games, shared and persistent saves, and that it stays on
its own files. Pass the executable of a Linux build
(`DESKTOP_PLATFORM=linux npm run build:win`) to check the packaged layout. It cannot run
the Windows .exe.
