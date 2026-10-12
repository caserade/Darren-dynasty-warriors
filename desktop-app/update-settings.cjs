'use strict';

// Distributed settings describe a source only. Credentials belong to the launching
// user's process environment, never to a JSON file shipped with the application.
function publicSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Update settings must be an object');
  if (Object.keys(input).some((key) => !['repo', 'branch', 'baseUrl'].includes(key)))
    throw new Error('Update settings contain unsupported fields; credentials cannot be packaged');
  const result = {};
  if (input.repo !== undefined) {
    if (typeof input.repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo))
      throw new Error('Invalid update repository');
    result.repo = input.repo;
  }
  if (input.branch !== undefined) {
    if (typeof input.branch !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(input.branch))
      throw new Error('Invalid update branch');
    result.branch = input.branch;
  }
  if (input.baseUrl !== undefined) {
    let url;
    try { url = new URL(input.baseUrl); } catch { throw new Error('Invalid update URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Packaged update URLs must be HTTPS without credentials, query or fragment');
    result.baseUrl = url.href;
  }
  return result;
}

function runtimeSettings(input, env = process.env) {
  if (env.SNOWDAY_NO_UPDATES === '1') return {};
  let cfg;
  try { cfg = publicSettings(input); } catch { cfg = {}; }
  // A test/custom host never receives the GitHub credential (makeSource enforces this).
  if (env.SNOWDAY_UPDATE_URL) cfg.baseUrl = env.SNOWDAY_UPDATE_URL;
  if (env.SNOWDAY_UPDATE_TOKEN) cfg.token = env.SNOWDAY_UPDATE_TOKEN;
  return cfg;
}

module.exports = { publicSettings, runtimeSettings };
