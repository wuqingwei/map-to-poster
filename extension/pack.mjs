// Copies the static extension files (manifest, content script, background worker)
// next to the Vite-built poster page in extension/dist, then zips the result.
import { copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extDir = dirname(fileURLToPath(import.meta.url));
const dist = join(extDir, 'dist');

for (const f of ['manifest.json', 'content.js', 'background.js']) {
	copyFileSync(join(extDir, f), join(dist, f));
	console.log('copied', f);
}

execSync(`cd "${dist}" && zip -qr ../strava-poster-extension.zip .`, { stdio: 'inherit' });
console.log('zipped extension/strava-poster-extension.zip');
