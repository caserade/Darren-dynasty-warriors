'use strict';
// Game updates for the desktop app (Claude update 14). The game (the dist/ folder) is what
// changes between versions; the app around it rarely does. So the app reads a small manifest,
// latest.json, from the public game-updates branch on GitHub (rebuilt by
// .github/workflows/publish-game-update.yml on every push to main). When it lists a newer game
// the player is told, and the Update button downloads only the files whose SHA-256 changed
// (unchanged files are copied from the game the app already has), checks every byte, and only
// then switches over. The game that came with the app (resources/game) is never touched, so a
// missing or damaged update falls back to it. Saves live in browser storage tied to
// snowday://game, not in these files, so they carry over unchanged.
//
// latest.json can also name the newest app download ("app": { version, url }); when it is newer
// than this app the player is told a new launcher is out and where to get it.
//
// Layout in the save folder: updates/b<build>/ (a full game folder plus manifest.json),
// updates/current.json (which one to use) and updates/seen.json (the last game the player was
// told about). The old, never-released updater's game-updates/ folder is ignored. Plain Node,
// no Electron, so tests drive it directly.
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
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++)
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
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

// Where updates come from: the public repo's game-updates branch, or any web folder holding
// latest.json and game/ (tests use a local one).
function makeSource({ repo, branch = 'game-updates', baseUrl } = {}) {
  const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');
  let base;
  if (baseUrl) base = String(baseUrl).replace(/\/+$/, '');
  else if (repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    base = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}`;
  else return null;
  return {
    url: (rel, tag) => base + '/' + enc(rel) + (tag ? '?v=' + encodeURIComponent(tag) : ''),
  };
}

// A download link must be an https page on GitHub: it is opened in the player's browser.
function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)github\.com$/.test(u.hostname) ? u.href : '';
  } catch {
    return '';
  }
}

function createUpdater(opts) {
  const {
    bundledRoot,
    bundledManifest,
    dataDir,
    source = null,
    appVersion = '0',
    fetch: fetchFn = globalThis.fetch,
    log = () => {},
    onChange = () => {},
  } = opts;
  const dir = path.join(dataDir, 'updates');
  const bundled = { root: bundledRoot, manifest: bundledManifest, build: bundledManifest.build };
  let active = bundled;
  let pending = null; // downloaded, used from the next page load (see apply)
  let offer = null; // a newer game seen in latest.json, not downloaded yet
  let checking = null;
  let installing = null;
  const status = {
    state: source ? 'idle' : 'off',
    message: source ? '' : 'Updates are switched off for this copy.',
    progress: 0,
    justUpdated: false,
    checkedAt: 0,
    app: null,
  };
  const changed = () => {
    try {
      onChange(api.status());
    } catch (e) {
      log('status listener failed: ' + e.message);
    }
  };

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
    if (before === active.build) return;
    // Tell the player once, the first time a newer game is in use (not on a first run).
    if (before != null && active.build > before) status.justUpdated = true;
    try {
      fs.mkdirSync(dir, { recursive: true });
      writeJsonAtomic(path.join(dir, 'seen.json'), { build: active.build });
    } catch (e) {
      log('could not record the game version: ' + e.message);
    }
  }

  // Startup: use the newest complete game, the bundled one if nothing newer is installed.
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

  async function get(rel, timeout, tag) {
    const res = await fetchFn(source.url(rel, tag), {
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!res.ok)
      throw Object.assign(new Error('HTTP ' + res.status + ' for ' + rel), { http: res.status });
    return Buffer.from(await res.arrayBuffer());
  }

  // Bytes still to download for a manifest: files whose content a game (the active one) lacks.
  function missingBytes(manifest, from = active.manifest) {
    const have = new Set(Object.values(from.files || {}).map((f) => f.sha256));
    let bytes = 0,
      files = 0;
    for (const f of Object.values(manifest.files))
      if (!have.has(f.sha256)) {
        bytes += f.size;
        files++;
      }
    return { bytes, files };
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
    const total = missingBytes(manifest).bytes;
    let done = 0,
      downloaded = 0,
      lastShown = 0;
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
      // The file's own checksum as the cache key, so a stale copy is never served.
      const data = await get('game/' + rel, FILE_TIMEOUT, f.sha256.slice(0, 16));
      const sha = crypto.createHash('sha256').update(data).digest('hex');
      if (data.length !== f.size || sha !== f.sha256)
        throw new Error(rel + ' did not match its checksum (the update may still be publishing)');
      fs.writeFileSync(dest, data);
      downloaded++;
      done += f.size;
      status.progress = total ? Math.min(1, done / total) : 1;
      if (status.progress - lastShown >= 0.02 || status.progress === 1) {
        lastShown = status.progress;
        changed();
      }
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

  function noteApp(manifest) {
    const a = manifest && manifest.app;
    const url = a && safeLink(a.url);
    status.app =
      a && url && typeof a.version === 'string' && newerVersion(a.version, appVersion)
        ? { version: a.version.slice(0, 20), url }
        : null;
  }

  async function runCheck() {
    offer = null;
    status.state = 'checking';
    status.message = 'Checking for a newer game...';
    status.progress = 0;
    changed();
    let manifest;
    try {
      manifest = JSON.parse(
        (await get('latest.json', MANIFEST_TIMEOUT, String(Date.now()))).toString('utf8')
      );
    } catch (e) {
      status.state = e.http && e.http !== 404 ? 'error' : 'offline';
      status.message =
        e.http === 404
          ? 'No game updates have been published yet.'
          : e.http
            ? 'Could not check for updates (' + e.message + ').'
            : 'Could not reach GitHub. Check the internet connection and try again.';
      log('update check: ' + e.message);
      changed();
      return api.status();
    }
    status.checkedAt = Date.now();
    const bad = checkManifest(manifest);
    if (bad) {
      status.state = 'error';
      status.message = 'The published update looks wrong (' + bad + '), so it was skipped.';
      changed();
      return api.status();
    }
    noteApp(manifest);
    const newest = pending || active;
    // A newer build with exactly the same files (the same game published again, as after a
    // merge) is not worth a notice.
    const same =
      missingBytes(manifest, newest.manifest).files === 0 &&
      Object.keys(manifest.files).length === Object.keys(newest.manifest.files || {}).length;
    if (manifest.build <= newest.build || same) {
      offer = null;
      status.state = pending ? 'ready' : 'current';
      status.message = pending
        ? 'The new game is downloaded and starts the next time a menu loads.'
        : 'Your game is up to date.';
    } else if (manifest.minApp && newerVersion(manifest.minApp, appVersion)) {
      offer = null;
      status.state = 'needs-app';
      status.message =
        'A newer game is out, but it needs the new app (version ' + manifest.minApp + ').';
    } else {
      offer = manifest;
      status.state = 'available';
      status.message = 'A new version of the game is ready to download.';
    }
    changed();
    return api.status();
  }

  async function runInstall() {
    // Always ask again first, so the newest published game is the one downloaded.
    if (checking) await checking;
    await runCheck();
    const manifest = status.state === 'available' ? offer : null;
    if (!manifest) return api.status();
    status.state = 'downloading';
    status.message = 'Downloading the new game...';
    status.progress = 0;
    changed();
    try {
      fs.mkdirSync(dir, { recursive: true });
      const got = await download(manifest);
      writeJsonAtomic(path.join(dir, 'current.json'), { build: manifest.build });
      pending = { root: path.join(dir, 'b' + manifest.build), manifest, build: manifest.build };
      offer = null;
      cleanup(['b' + manifest.build, active === bundled ? '' : 'b' + active.build]);
      status.state = 'ready';
      status.progress = 1;
      status.message = 'Update downloaded.';
      log(
        'downloaded game b' +
          manifest.build +
          ': ' +
          got.downloaded +
          ' files, ' +
          got.bytes +
          ' bytes'
      );
    } catch (e) {
      fs.rmSync(path.join(dir, 'b' + manifest.build + '.partial'), {
        recursive: true,
        force: true,
      });
      status.state = 'error';
      status.message =
        'The update did not finish, so your current game was kept. Try again in a few minutes.';
      log('update download failed: ' + e.message);
    }
    changed();
    return api.status();
  }

  const describe = (m) => ({
    build: m.build,
    commit: String(m.commit || '').slice(0, 12),
    notes: String(m.notes || '').slice(0, 300),
  });

  const api = {
    root: () => active.root,
    build: () => active.build,
    // Switch to a downloaded game. Call only right before reloading the page, so one page never
    // mixes old and new files.
    apply() {
      if (!pending) return false;
      active = pending;
      pending = null;
      noteSeen();
      status.state = 'current';
      status.message = 'Your game is up to date.';
      status.progress = 0;
      changed();
      return true;
    },
    check() {
      if (!source) return Promise.resolve(api.status());
      if (installing) return installing;
      if (!checking) checking = runCheck().finally(() => (checking = null));
      return checking;
    },
    install() {
      if (!source) return Promise.resolve(api.status());
      if (pending) return Promise.resolve(api.status());
      if (!installing) installing = runInstall().finally(() => (installing = null));
      return installing;
    },
    // The "you have been updated" note is shown once.
    seenUpdate() {
      status.justUpdated = false;
    },
    // Back to the game that came with the app (menu: Test > Use the game that came with the app).
    reset() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
      active = bundled;
      pending = null;
      offer = null;
      status.justUpdated = false;
      noteSeen();
      if (source) {
        status.state = 'idle';
        status.message = '';
      }
      changed();
    },
    status: () => ({
      state: status.state,
      message: status.message,
      progress: status.progress,
      justUpdated: status.justUpdated,
      checkedAt: status.checkedAt,
      appVersion,
      app: status.app,
      bundled: active === bundled,
      game: describe(active.manifest),
      offer: offer
        ? {
            ...describe(offer),
            downloadBytes: missingBytes(offer).bytes,
            files: missingBytes(offer).files,
          }
        : null,
      pending: pending ? describe(pending.manifest) : null,
    }),
  };
  return api;
}

module.exports = { createUpdater, makeSource, newerVersion, safeLink };
