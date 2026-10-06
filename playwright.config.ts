import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4321',
		trace: 'retain-on-failure',
		...devices['Desktop Chrome']
	}
});
