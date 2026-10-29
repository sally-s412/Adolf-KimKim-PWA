// Public CDN configuration only; AI credentials and models stay on the backend.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const original = readFileSync('frontend/config.js', 'utf8');
const apiBaseUrl = 'https://adolf-kimkim-beta.onrender.com';
try {
  writeFileSync('frontend/config.js', 'window.AKK_CONFIG = Object.freeze(' + JSON.stringify({
    apiBaseUrl,
    sttUrl: apiBaseUrl.replace(/^http/, 'ws') + '/v1/ws/realtime-speech'
  }) + ');\n');
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit'});
  if (result.status !== 0) throw new Error('Static PWA build failed');
} finally {
  writeFileSync('frontend/config.js', original);
}
