'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { assertBuildEnvironment, assertSafeTree } = require('../desktop-app/package-security.cjs');

function stageReturn(source, dest) {
  assertBuildEnvironment();
  const skip = (rel) => rel.split('/').some((part) =>
    ['.git', 'node_modules', '.sites-runtime', 'out', 'qa-screenshots'].includes(part) || /\.zip$/i.test(part));
  assertSafeTree(source, { skip });
  fs.cpSync(source, dest, { recursive: true, filter: (file) =>
    !skip(path.relative(source, file).split(path.sep).join('/')) });
  assertSafeTree(dest);
}

module.exports = { stageReturn };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('A staging destination is required');
  stageReturn(path.join(__dirname, '..'), path.resolve(process.argv[2]));
}
