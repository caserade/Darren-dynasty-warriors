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
  the `game-updates` branch. Apps with access pick it up on their next start.
- Access: every distributed app folder, ZIP and update config is credential-free.
  Private updates use `SNOWDAY_UPDATE_TOKEN` supplied only in the local user's app-launch
  environment. The app never writes it to disk. Use a fine-grained, expiring GitHub token
  limited to read-only Contents access to this repository, and keep it only on your PC.
  Do not put it in the app folder, source tree, JSON, launcher scripts or a shared ZIP.
  `update-token.txt` is no longer supported. A packaged config containing credentials is
  rejected, including older configs with a `token` field.
  Without local access the bundled game remains playable; updates to a private repo fail
  safely. Public repositories still update through `raw.githubusercontent.com` without a key.
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

Build from a shell without `SNOWDAY_UPDATE_TOKEN`. The build refuses that variable,
credential-like files (including nested `.env` files), credential fields in update settings,
recognizable GitHub tokens/private keys and symbolic links. It stages an explicit list of
runtime files into `app.asar` and checks copied game files and the final app folder before
zipping. Only `repo`, `branch` and a credential-free HTTPS `baseUrl` are allowed in the
distributed update settings. Never place arbitrary secrets in game assets: these guards
are not a general detector for every possible secret or encoding.

For personal private updates on Windows, start the app from a separate PowerShell session.
This prompts without putting a literal key in shell history, keeps it process-local and
removes the launching shell's copy after the app exits (do not use `setx`):

```powershell
$localKey = Read-Host 'Your own read-only update token' -AsSecureString
try {
  $env:SNOWDAY_UPDATE_TOKEN = [System.Net.NetworkCredential]::new('', $localKey).Password
  Start-Process -FilePath '.\Darren Snowday.exe' -Wait
} finally {
  Remove-Item Env:SNOWDAY_UPDATE_TOKEN -ErrorAction SilentlyContinue
  $localKey.Dispose()
}
```

Close any already-running copy first, so the new process receives the environment.
This is local runtime access, not encrypted storage; other processes running as you may
inspect your environment. Do not run packaging from this launch session. A normal
double-click without the environment still plays the bundled game.

The .exe is not code-signed, so Windows SmartScreen shows "Windows protected your PC" the
first time; More info, then Run anyway.

## Test

`node tests/desktop-update.cjs` (part of `npm test`) checks the updater against a local web
server: only changed files download, checksums and unsafe file names are refused, no
downgrades, offline and damaged downloads fall back safely.

`node --test tests/desktop-packaging.cjs` (also part of `npm test`) uses synthetic values to
check packaging rejection, runtime-only authentication, staging and fallback behavior.
The project return-ZIP tool also requires Node.js, rejects credential inputs and omits
nested dependencies, previous desktop outputs and existing ZIPs.

`node tests/desktop-app.cjs` (from the repo root, with Playwright installed) launches the app
and checks the start screen, both games, shared and persistent saves, and that it stays on
its own files. Pass the executable of a Linux build
(`DESKTOP_PLATFORM=linux npm run build:win`) to check the packaged layout. It cannot run
the Windows .exe.
