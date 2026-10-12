'use strict';
// Builds the Windows desktop app: out/Darren-Snowday-Windows/ (and a .zip of it when the
// zip command or PowerShell is available). Run from desktop-app/: npm install, then
// npm run build:win. Works on Linux, Mac or Windows; no Wine needed (packager writes the
// icon and file details into the .exe itself).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packager } = require('@electron/packager');

const here = __dirname;
const pkg = require('./package.json');
const out = path.join(here, 'out');
// DESKTOP_PLATFORM=linux builds the same app for Linux; only used to test the packaged
// layout where no Windows PC is available.
const platform = process.env.DESKTOP_PLATFORM || 'win32';
const folderName = platform === 'win32' ? 'Darren-Snowday-Windows' : 'Darren-Snowday-' + platform;
const exeName = 'Darren Snowday';

(async () => {
  const dest = path.join(out, folderName);
  const zip = path.join(out, folderName + '.zip');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  const [built] = await packager({
    dir: here,
    out,
    name: exeName,
    executableName: exeName,
    platform,
    arch: 'x64',
    electronVersion: require('electron/package.json').version,
    asar: true,
    prune: false,
    overwrite: true,
    ignore: [
      /^\/out($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/build-windows\.cjs$/,
      /^\/icon\.ico$/,
      /^\/README/,
    ],
    icon: path.join(here, 'icon.ico'),
    appVersion: pkg.version,
    appCopyright: 'Private game for Michael',
    win32metadata: {
      CompanyName: 'Michael (private)',
      FileDescription: pkg.productName,
      ProductName: pkg.productName,
      InternalName: exeName,
    },
  });
  fs.renameSync(built, dest);

  // The games themselves: ../dist copied beside the app as resources/game.
  fs.cpSync(path.join(here, '..', 'dist'), path.join(dest, 'resources', 'game'), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(dest, 'HOW-TO-PLAY.txt'),
    [
      "Darren's Snowday Search for Windows",
      '',
      'Double-click "Darren Snowday.exe" to play. Keep this whole folder together;',
      'the .exe needs the files beside it. You can right-click the .exe and choose',
      'Send to > Desktop (create shortcut) to start it from the desktop.',
      '',
      'Windows may say "Windows protected your PC" the first time, because the app is',
      'not signed by a paid publisher certificate. Click "More info", then "Run anyway".',
      '',
      'The start screen lets you pick the pixel or the 3D adventure. Ctrl+H comes back',
      'to it, Ctrl+1 / Ctrl+2 jump straight to a game, F11 is full screen. Controllers,',
      'keyboard and mouse work as in the browser versions.',
      '',
      "Saves live in %APPDATA%\\Darren's Snowday Search (Test > Open save folder).",
      'They are separate from saves made in a web browser.',
      '',
    ].join('\r\n')
  );

  try {
    if (process.platform === 'win32')
      execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${dest}' -DestinationPath '${zip}' -Force`,
      ]);
    else execFileSync('zip', ['-qry', zip, folderName], { cwd: out });
    console.log('Built ' + zip);
  } catch {
    console.log('Built ' + dest + ' (no zip tool found; zip that folder to share it).');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
