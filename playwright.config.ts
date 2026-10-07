import { defineConfig, devices } from '@playwright/test';

const GPU_SPECS =
	/(render-parity|render-gl|export-gl|gate-i-evidence|effects|effects-pipeline-functional|gate-j-evidence|transitions)\.spec\.ts$/;
declare const process: { env: Record<string, string | undefined> };

/** The GPU project only exists for `npm run test:gpu`, which first checks that Chrome is installed. */
const includeGpuProject = process.env.TFVE_GPU === '1';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4321',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
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
