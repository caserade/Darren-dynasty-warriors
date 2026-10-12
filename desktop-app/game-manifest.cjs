'use strict';
// A game manifest lists every file of dist/ with its size and SHA-256, plus a build number
// (the git commit time, so newer games always have bigger numbers). The desktop app ships
// one for its bundled game, and tools/publish-game-update.cjs publishes one for each new
// game so the app can tell what changed and download only those files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 1;

function listFiles(root, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(root, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function buildManifest(root, { build, commit = '', notes = '', minApp = '' } = {}) {
  const files = {};
  for (const rel of listFiles(root)) {
    const file = path.join(root, rel);
    files[rel] = { size: fs.statSync(file).size, sha256: hashFile(file) };
  }
  return { format: FORMAT, build: Number(build) || 0, commit, notes, minApp, files };
}

// Paths come from the internet, so only plain relative names inside the game folder pass.
function safePath(rel) {
  return (
    typeof rel === 'string' &&
    rel.length > 0 &&
    rel.length < 300 &&
    /^[A-Za-z0-9._\-/]+$/.test(rel) &&
    !rel.startsWith('/') &&
    rel.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

function checkManifest(m) {
  if (!m || m.format !== FORMAT) return 'unknown manifest format';
  if (!Number.isFinite(m.build) || m.build <= 0) return 'missing build number';
  if (!m.files || typeof m.files !== 'object') return 'missing file list';
  const names = Object.keys(m.files);
  if (!names.includes('index.html')) return 'no index.html';
  for (const rel of names) {
    const f = m.files[rel];
    if (!safePath(rel)) return 'unsafe file name ' + JSON.stringify(rel).slice(0, 80);
    if (!f || !Number.isInteger(f.size) || f.size < 0 || !/^[0-9a-f]{64}$/.test(f.sha256))
      return 'bad entry for ' + rel;
  }
  return '';
}

module.exports = { FORMAT, listFiles, hashFile, buildManifest, safePath, checkManifest };
