import { cpus } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

const GPU_SPECS =
	/(render-parity|render-gl|export-gl|gate-i-evidence|effects|effects-pipeline-functional|gate-j-evidence|transitions|masks|mid-session-switch|codecs-matrix)\.spec\.ts$/;

// Heavy multi-minute export benchmarks and CPU-intensive ML inference specs that require
// dedicated CPU/GPU resources and must run serially (workers: 1) to eliminate resource starvation.
const BENCHMARK_SPECS =
	/(gate-j-evidence|gate-i-evidence|captions-real|export|export-gl|codecs-matrix|proxies)\.spec\.ts$/;

declare const process: { env: Record<string, string | undefined> };

/** The GPU project only exists for `npm run test:gpu`, which first checks that Chrome is installed. */
const includeGpuProject = process.env.TFVE_GPU === '1';

// Allocate ~1/3 of host CPU cores (minimum 2) for parallel workers to prevent CPU starvation
// and hardware decoder contention across concurrent browser instances.
const parallelWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(cpus().length / 3));

// Note on webServer / astro preview vs astro dev:
// E2E test oracles and benchmarks evaluate internal modules directly in browser context
// via dynamic imports like `await import('/src/editor/services/export/exporter.ts')` and `/src/editor/core/index.ts`.
// In a static production build (`astro preview`), raw TypeScript source files in `/src/`
// are not served, breaking dynamic in-browser imports. Running against `astro dev`
// (with core dependencies pre-bundled in `astro.config.mjs` optimizeDeps.include)
// is required for internal test harnesses and oracles.

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: parallelWorkers,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4321',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: BENCHMARK_SPECS,
			use: { ...devices['Desktop Chrome'] },
			...(includeGpuProject ? { testIgnore: /.*/ } : {})
		},
		{
			name: 'serial-benchmarks',
			testMatch: BENCHMARK_SPECS,
			dependencies: ['chromium'],
			workers: 1,
			use: { ...devices['Desktop Chrome'] },
			...(includeGpuProject ? { testIgnore: /.*/ } : {})
		},
		...(includeGpuProject
			? [
					{
						name: 'chrome-gpu',
						testMatch: GPU_SPECS,
						use: {
							...devices['Desktop Chrome'],
							channel: 'chrome',
							headless: false,
							launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] }
						}
					}
				]
			: [])
	]
});
