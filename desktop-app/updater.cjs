'use strict';
// Game updates for the desktop app. Only the game (dist/) changes between updates; the app
// shell around it rarely does. So instead of a new 180 MB download, the app reads a small
// manifest (latest.json) from the game-updates branch on GitHub, downloads just the files
// whose SHA-256 changed (unchanged ones are copied from the game it already has), checks
// every byte, and only then switches over. The bundled game in resources/game is never
// touched, so a missing or damaged update simply falls back to it. Saves are browser
// storage tied to snowday://game, not to these files, so they carry over unchanged.
//
// Layout in the save folder: game-updates/b<build>/ (a full game folder plus manifest.json),
// game-updates/current.json (which one to use) and game-updates/seen.json (the last game
// the player was told about). Plain Node, no Electron, so tests can drive it directly.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkManifest } = require('./game-manifest.cjs');

const PARALLEL = 4;
const MANIFEST_TIMEOUT = 15000;
const FILE_TIMEOUT = 120000;

function newerVersion(a, b) {
  // true when version string a is newer than b ("1.2.0" vs "1.10.0").
  const pa = String(a || '0')
    .split('.')
    .map(Number);
  const pb = String(b || '0')
    .split('.')
    .map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

// Where to download from. A token means the private repo through the GitHub API; no token
// means a public repo through raw.githubusercontent.com; baseUrl is a plain web folder
// (used by tests, or any other host).
function makeSource(config) {
  const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');
  if (config.baseUrl) {
    const base = config.baseUrl.replace(/\/+$/, '');
    return { url: (rel) => base + '/' + enc(rel), headers: {} };
  }
  if (!config.repo) return null;
  const branch = encodeURIComponent(config.branch || 'game-updates');
  if (config.token)
    return {
      url: (rel) =>
        `https://api.github.com/repos/${config.repo}/contents/${enc(rel)}?ref=${branch}`,
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: 'Bearer ' + config.token,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
  return {
    url: (rel) => `https://raw.githubusercontent.com/${config.repo}/${branch}/${enc(rel)}`,
    headers: {},
  };
}

function createUpdater(opts) {
  const {
    bundledRoot,
    bundledManifest,
    dataDir,
    config = {},
    appVersion = '0',
    fetch: fetchFn = globalThis.fetch,
    log = () => {},
  } = opts;
  const dir = path.join(dataDir, 'game-updates');
  const source = makeSource(config);
  const bundled = { root: bundledRoot, manifest: bundledManifest, build: bundledManifest.build };
  let active = bundled;
  let pending = null;
  let checking = null;
  const status = { state: source ? 'idle' : 'off', message: '', progress: 0, justUpdated: false };

  // An installed update counts only if every file it lists is there at the right size.
  function loadInstalled(build) {
    const root = path.join(dir, 'b' + build);
    const manifest = readJson(path.join(root, 'manifest.json'));
    if (!manifest || manifest.build !== build || checkManifest(manifest)) return null;
    for (const [rel, f] of Object.entries(manifest.files)) {
      try {
        if (fs.statSync(path.join(root, ...rel.split('/'))).size !== f.size) return null;
      } catch {
        return null;
      }
    }
    return { root, manifest, build };
  }

  function cleanup(keep) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!/^b\d+(\.partial)?$/.test(name) || keep.includes(name)) continue;
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }

  function noteSeen() {
    const seen = readJson(path.join(dir, 'seen.json'));
    const before = seen && seen.build;
    if (before !== active.build) {
      // Tell the player once, the first time a newer game is in use (not on a first run).
      status.justUpdated = before != null && active.build > before;
      try {
        fs.mkdirSync(dir, { recursive: true });
        writeJsonAtomic(path.join(dir, 'seen.json'), { build: active.build });
      } catch (e) {
        log('could not record the game version: ' + e.message);
      }
    }
  }

  // Startup: use the newest valid game, the bundled one if nothing better is installed.
  (function start() {
    const current = readJson(path.join(dir, 'current.json'));
    if (current && current.build > bundled.build) {
      const inst = loadInstalled(current.build);
      if (inst) active = inst;
      else log('installed update b' + current.build + ' is incomplete; using the bundled game');
    }
    cleanup(active === bundled ? [] : ['b' + active.build]);
    noteSeen();
  })();

  async function get(rel, timeout) {
    const res = await fetchFn(source.url(rel), {
      headers: source.headers,
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!res.ok)
      throw Object.assign(new Error('HTTP ' + res.status + ' for ' + rel), { http: res.status });
    return Buffer.from(await res.arrayBuffer());
  }

  async function download(manifest) {
    const name = 'b' + manifest.build;
    const stage = path.join(dir, name + '.partial');
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    const have = new Map(); // sha256 -> a file we already have with that content
    for (const [rel, f] of Object.entries(active.manifest.files || {}))
      have.set(f.sha256, path.join(active.root, ...rel.split('/')));
    const jobs = Object.entries(manifest.files);
    const total = jobs.reduce((n, [, f]) => n + (have.has(f.sha256) ? 0 : f.size), 0);
    let done = 0;
    let downloaded = 0;
    const one = async ([rel, f]) => {
      const dest = path.join(stage, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const local = have.get(f.sha256);
      if (local) {
        try {
          const data = fs.readFileSync(local);
          if (
            data.length === f.size &&
            crypto.createHash('sha256').update(data).digest('hex') === f.sha256
          ) {
            fs.writeFileSync(dest, data);
            return;
          }
        } catch {
          // fall through and download it instead
        }
      }
      const data = await get('game/' + rel, FILE_TIMEOUT);
      const sha = crypto.createHash('sha256').update(data).digest('hex');
      if (data.length !== f.size || sha !== f.sha256)
        throw new Error(rel + ' did not match its checksum (the update may still be publishing)');
      fs.writeFileSync(dest, data);
      downloaded++;
      done += f.size;
      status.progress = total ? done / total : 1;
    };
    // Every worker stops at the first failure and all finish before the caller cleans up,
    // so nothing is still writing into the staging folder after it is removed.
    const queue = jobs.slice();
    let failure = null;
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        while (queue.length && !failure)
          await one(queue.shift()).catch((e) => (failure = failure || e));
      })
    );
    if (failure) throw failure;
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    const final = path.join(dir, name);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(stage, final);
    return { downloaded, bytes: total };
  }

  async function runCheck() {
    status.state = 'checking';
    status.message = 'Checking for a newer game...';
    status.progress = 0;
    let manifest;
    try {
      manifest = JSON.parse((await get('latest.json', MANIFEST_TIMEOUT)).toString('utf8'));
    } catch (e) {
      status.state = e.http ? 'error' : 'offline';
      status.message =
        e.http === 404
          ? 'No game updates have been published yet.'
          : e.http
            ? 'Could not check for updates (' + e.message + ').'
            : 'Offline, so the game was not checked for updates.';
      log('update check: ' + e.message);
      return status;
    }
    const bad = checkManifest(manifest);
    if (bad) {
      status.state = 'error';
      status.message = 'The published update looks wrong (' + bad + '), so it was skipped.';
      return status;
    }
    const newest = pending || active;
    if (manifest.build <= newest.build) {
      status.state = pending ? 'ready' : 'current';
      status.message = pending ? status.message : 'The game is up to date.';
      return status;
    }
    if (manifest.minApp && newerVersion(manifest.minApp, appVersion)) {
      status.state = 'needs-app';
      status.message =
        'A newer game is out, but it needs a new copy of the app (version ' +
        manifest.minApp +
        ').';
      return status;
    }
    status.state = 'downloading';
    status.message = 'Downloading the new game files...';
    try {
      fs.mkdirSync(dir, { recursive: true });
      const got = await download(manifest);
      writeJsonAtomic(path.join(dir, 'current.json'), { build: manifest.build });
      pending = { root: path.join(dir, 'b' + manifest.build), manifest, build: manifest.build };
      cleanup(['b' + manifest.build, active === bundled ? '' : 'b' + active.build]);
      status.state = 'ready';
      status.message =
        'Update downloaded (' +
        got.downloaded +
        ' files, ' +
        (got.bytes / 1048576).toFixed(1) +
        ' MB).';
      log('downloaded game b' + manifest.build + ': ' + got.downloaded + ' files');
    } catch (e) {
      fs.rmSync(path.join(dir, 'b' + manifest.build + '.partial'), {
        recursive: true,
        force: true,
      });
      status.state = 'error';
      status.message =
        'The update did not finish, so the current game was kept. It will try again next time.';
      log('update download failed: ' + e.message);
    }
    return status;
  }

  return {
    root: () => active.root,
    build: () => active.build,
    manifest: () => active.manifest,
    // Switch to a downloaded game. Call only when no game page is open, so one page never
    // mixes old and new files.
    apply() {
      if (!pending) return false;
      active = pending;
      pending = null;
      noteSeen();
      status.message = '';
      status.state = 'current';
      return true;
    },
    check() {
      if (!source) return Promise.resolve(status);
      if (!checking) checking = runCheck().finally(() => (checking = null));
      return checking;
    },
    // Back to the game that came with the app (menu: Test > Use the bundled game).
    reset() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
      active = bundled;
      pending = null;
      noteSeen();
    },
    status: () => ({
      ...status,
      build: active.build,
      bundled: active === bundled,
      notes: active.manifest.notes || '',
      pendingBuild: pending ? pending.build : 0,
    }),
  };
}

module.exports = { createUpdater, makeSource, newerVersion };
