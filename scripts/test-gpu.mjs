// Runs the renderer suites on the locally installed Google Chrome with the real GPU stack.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const chromePaths = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
if (!chromePaths.some((path) => existsSync(path))) {
	console.log('test:gpu skipped: Google Chrome is not installed.');
	process.exit(0);
}
const result = spawnSync(
	'npx',
	['playwright', 'test', '--project=chrome-gpu', '--workers=1', ...process.argv.slice(2)],
	{ stdio: 'inherit', env: { ...process.env, TFVE_GPU: '1' }, shell: process.platform === 'win32' }
);
process.exit(result.status ?? 1);
