'use strict';
// Prepares a game update for the desktop app: node tools/publish-game-update.cjs <out-folder>
// writes <out>/latest.json (the manifest: build number, notes, every file's size and
// SHA-256) and <out>/game/ (a copy of dist/). The GitHub workflow
// .github/workflows/publish-game-update.yml runs this on every push to main and puts the
// result on the game-updates branch, where the app looks for it.
//
// Build number: SNOWDAY_BUILD, else the last commit's time (seconds), so later games are
// always bigger. Notes: the title of the newest "CLAUDE UPDATE" in CHANGELOG-CLAUDE.txt.
// minApp: set when a game needs a newer app shell (see desktop-app/package.json).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildManifest, checkManifest } = require('../desktop-app/game-manifest.cjs');
const { assertBuildEnvironment, assertSafeTree } = require('../desktop-app/package-security.cjs');

const repo = path.join(__dirname, '..');
const MIN_APP = '1.1.1';

function gitBuild() {
  if (process.env.SNOWDAY_BUILD) return Number(process.env.SNOWDAY_BUILD);
  try {
    return Number(
      execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: repo }).toString().trim()
    );
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }).toString().trim();
  } catch {
    return '';
  }
}

function latestNotes() {
  try {
    const log = fs.readFileSync(path.join(repo, 'CHANGELOG-CLAUDE.txt'), 'utf8');
    const titles = [...log.matchAll(/^CLAUDE UPDATE \d+ · (.+?)(?: · \d{4}-\d\d-\d\d)?$/gm)];
    const t = titles.length ? titles[titles.length - 1][1].trim() : '';
    const names = ['AI', '3D', 'Darren', 'Tormund', 'Bucky', 'Ruffy', 'Windows', 'Mac', 'GitHub'];
    let s = t.charAt(0) + t.slice(1).toLowerCase();
    for (const n of names) s = s.replace(new RegExp('\\b' + n + '\\b', 'gi'), n);
    return s;
  } catch {
    return '';
  }
}

function gameManifest(distDir = path.join(repo, 'dist')) {
  return buildManifest(distDir, {
    build: gitBuild(),
    commit: gitCommit(),
    notes: latestNotes(),
    minApp: MIN_APP,
  });
}

module.exports = { gameManifest, gitBuild, latestNotes };

if (require.main === module) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node tools/publish-game-update.cjs <out-folder>');
    process.exit(2);
  }
  assertBuildEnvironment();
  assertSafeTree(path.join(repo, 'dist'));
  const manifest = gameManifest();
  const bad = checkManifest(manifest);
  if (bad) {
    console.error('manifest problem: ' + bad);
    process.exit(1);
  }
  fs.rmSync(path.join(out, 'game'), { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(repo, 'dist'), path.join(out, 'game'), { recursive: true });
  assertSafeTree(path.join(out, 'game'));
  fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(manifest, null, 1) + '\n');
  fs.writeFileSync(
    path.join(out, 'README.md'),
    "# Darren's Snowday Search game updates\n\nWritten automatically by " +
      '.github/workflows/publish-game-update.yml from main. The desktop app reads latest.json and ' +
      'downloads changed files from game/. Do not edit by hand.\n'
  );
  const files = Object.keys(manifest.files).length;
  console.log(
    `game build ${manifest.build} (${manifest.commit}) · ${files} files · "${manifest.notes}"`
  );
}
