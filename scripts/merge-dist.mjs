import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const LANDING_DIST = join(ROOT, 'landing', 'dist');
const UI_DIST = join(ROOT, 'ui', 'dist');

// Clean
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}

// 1. Copy Astro landing pages -> dist/
cpSync(LANDING_DIST, DIST, { recursive: true });

// 2. Create dist/app/ and copy SPA
mkdirSync(join(DIST, 'app'), { recursive: true });
cpSync(join(UI_DIST, 'index.html'), join(DIST, 'app', 'index.html'));
if (existsSync(join(UI_DIST, 'assets'))) {
  cpSync(join(UI_DIST, 'assets'), join(DIST, 'app', 'assets'), { recursive: true });
}

// 3. Copy shared public assets from ui/dist/ to dist/ root
const sharedAssets = [
  'icon.svg', 'icon-192.png', 'icon-512.png',
  'manifest.json', 'sw.js', 'favicon.svg',
];
for (const file of sharedAssets) {
  const src = join(UI_DIST, file);
  if (existsSync(src)) {
    cpSync(src, join(DIST, file));
  }
}

// Copy screenshots directory
const screenshotsDir = join(UI_DIST, 'screenshots');
if (existsSync(screenshotsDir)) {
  cpSync(screenshotsDir, join(DIST, 'screenshots'), { recursive: true });
}

console.log('Build merge complete. dist/ structure:');
// List key files
const expected = [
  'index.html', 'pricing/index.html', 'login/index.html',
  'app/index.html', 'manifest.json', 'sw.js', 'icon.svg',
];
for (const f of expected) {
  const exists = existsSync(join(DIST, f));
  console.log(`  ${exists ? 'OK' : 'MISSING'} dist/${f}`);
}
