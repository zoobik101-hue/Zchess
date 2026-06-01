/**
 * Sync deploy build id across version.json, sw.js, js/config.js
 * Called from push-github.bat on every push.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const build = String(process.argv[2] || Date.now());
const verLabel = process.argv[3] || new Date().toLocaleString('ru-RU');
const cacheKey = 'zchess-' + build;

const versionJson = {
  version: verLabel,
  build,
  cache: cacheKey
};

fs.writeFileSync(
  path.join(root, 'version.json'),
  JSON.stringify(versionJson, null, 2) + '\n',
  'utf8'
);

let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${cacheKey}';`);
fs.writeFileSync(path.join(root, 'sw.js'), sw, 'utf8');

let cfg = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
if (/window\.ZChess\.BUILD\s*=/.test(cfg)) {
  cfg = cfg.replace(/window\.ZChess\.BUILD\s*=\s*'[^']*';/, `window.ZChess.BUILD = '${build}';`);
} else {
  cfg = cfg.replace(
    /window\.ZChess\.VERSION\s*=/,
    `window.ZChess.BUILD = '${build}';\nwindow.ZChess.VERSION =`
  );
}
fs.writeFileSync(path.join(root, 'js', 'config.js'), cfg, 'utf8');

console.log('[sync-build] build=' + build + ' cache=' + cacheKey);
