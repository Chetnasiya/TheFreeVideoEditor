// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	vite: {
		plugins: [tailwindcss()],
		optimizeDeps: {
			include: ['@huggingface/transformers']
		},
		build: {
			rolldownOptions: {
				output: {
					codeSplitting: {
						groups: [
							{
								name: 'mediabunny',
								test: /(?:^|[\\/])mediabunny[\\/]/,
								maxSize: 420 * 1024
							}
						]
					}
				}
			}
		}
	}
});
