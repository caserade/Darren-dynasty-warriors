'use strict';
// Builds the Windows desktop app: out/Darren-Snowday-Windows/ (and a .zip of it when the
// zip command or PowerShell is available). Run from desktop-app/: npm install, then
// npm run build:win. Works on Linux, Mac or Windows; no Wine needed (packager writes the
// icon and file details into the .exe itself).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { assertBuildEnvironment, assertSafeTree, stageApp } = require('./package-security.cjs');

const here = __dirname;
const pkg = require('./package.json');
const out = path.join(here, 'out');
// DESKTOP_PLATFORM=linux builds the same app for Linux; only used to test the packaged
// layout where no Windows PC is available.
const platform = process.env.DESKTOP_PLATFORM || 'win32';
const folderName = platform === 'win32' ? 'Darren-Snowday-Windows' : 'Darren-Snowday-' + platform;
const exeName = 'Darren Snowday';

// rename fails across drives (a checkout on D: with %TEMP% on C:), so copy instead there.
function move(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

(async () => {
  assertBuildEnvironment();
  // Validate before creating any distributable; never read update-token.txt.
  assertSafeTree(here, { skip: (rel) => /^(?:node_modules|out)(?:\/|$)/.test(rel) });
  assertSafeTree(path.join(here, '..', 'dist'));
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'snowday-package-'));
  try {
    const appSource = path.join(staging, 'app');
    stageApp(here, appSource);
    const dest = path.join(staging, folderName);
    const zip = path.join(staging, folderName + '.zip');
    const { packager } = require('@electron/packager');
    const [built] = await packager({
      dir: appSource,
      out: path.join(staging, 'build'),
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
        /^\/update-config\.json$/,
        /^\/update-token\.txt$/,
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
        'The app opens on the title screen. Its menu has Story Mode, Free Mode, Heroes,',
        'Options and the Pixel Adventure. Ctrl+H comes back to the title screen, Ctrl+1',
        'opens the pixel game, Ctrl+2 the game chooser, F11 is full screen. Controllers,',
        'keyboard and mouse work as in the browser versions.',
        '',
        'This standalone app always plays the game included in this folder.',
        'It never checks for or downloads updates, and no GitHub key is needed.',
        'For a future version, close this app, extract the new ZIP to a new folder,',
        'and launch the new EXE. Do not delete your save folder.',
        '',
        "Saves live in %APPDATA%\\Darren's Snowday Search (Test > Open save folder).",
        'They are separate from saves made in a web browser.',
        '',
      ].join('\r\n')
    );

    assertSafeTree(dest);
    try {
      if (process.platform === 'win32')
        execFileSync('powershell', [
          '-NoProfile',
          '-Command',
          "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
            `[System.IO.Compression.ZipFile]::CreateFromDirectory('${dest.replace(/'/g, "''")}', '${zip.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $true)`,
        ]);
      else execFileSync('zip', ['-qry', zip, folderName], { cwd: staging });
    } catch {
      fs.rmSync(zip, { force: true });
      console.log('No zip tool available; the checked app folder can be zipped manually.');
    }
    // Only expose checked outputs. A failed guard leaves no new distributable behind.
    fs.mkdirSync(out, { recursive: true });
    fs.rmSync(path.join(out, folderName), { recursive: true, force: true });
    fs.rmSync(path.join(out, folderName + '.zip'), { force: true });
    move(dest, path.join(out, folderName));
    if (fs.existsSync(zip)) move(zip, path.join(out, folderName + '.zip'));
    console.log('Built ' + path.join(out, folderName));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
