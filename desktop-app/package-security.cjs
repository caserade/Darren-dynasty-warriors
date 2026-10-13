'use strict';
const fs = require('node:fs');
const path = require('node:path');

function assertBuildEnvironment(env = process.env) {
  if (env.SNOWDAY_UPDATE_TOKEN)
    throw new Error('Packaging refused: remove SNOWDAY_UPDATE_TOKEN from the build environment. The updater reads a public repo and uses no credentials.');
}

function assertSafeTree(root, { skip = () => false } = {}) {
  function visit(dir, rel = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = item.name;
      const file = path.join(dir, name);
      const relative = rel ? rel + '/' + name : name;
      if (skip(relative, item)) continue;
      // Refuse links before following them: a linked directory could import local secrets.
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Packaging refused: symbolic link');
      if (/^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|\.git|\.ssh|\.aws|.*(?:token|credentials?|secrets?)(?:[._-].*)?|.*\.(?:pem|key|pfx|p12))$/i.test(name))
        throw new Error('Packaging refused: credential-like file or directory; remove it from the input tree');
      if (item.isDirectory()) { visit(file, relative); continue; }
      if (!item.isFile()) throw new Error('Packaging refused: unsupported file type');
      // The updater reads a public repo and needs no settings file or key, so a settings file
      // (where a key could hide) is never shipped.
      if (/^(?:update-config\.json|update-settings\.cjs)$/i.test(name))
        throw new Error('Packaging refused: obsolete update settings must not be distributed');
      const bytes = fs.readFileSync(file);
      const content = bytes.toString('utf8');
      if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content))
        throw new Error('Packaging refused: credential-like content; inspect the input locally');
    }
  }
  visit(root);
}

// Exact runtime inputs: stray files (including editor backups) never enter app.asar.
const APP_FILES = [
  'package.json',
  'main.cjs',
  'preload.cjs',
  'updater.cjs',
  'game-manifest.cjs',
  'home/index.html',
  'home/icon.png',
  'home/darren.jpg',
];
function stageApp(source, dest) {
  assertSafeTree(source, { skip: (rel) => /^(?:node_modules|out)(?:\/|$)/.test(rel) });
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of APP_FILES) {
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, rel), target);
  }
  assertSafeTree(dest);
}

module.exports = { assertBuildEnvironment, assertSafeTree, stageApp, APP_FILES };
