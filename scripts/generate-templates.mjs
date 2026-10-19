// Regenerates public/templates/*.tfvetemplate from the legacy graphic-template converter.
//
// The shipped files are the source of truth at runtime; this script is the authoring path for the
// templates that are still defined in src/editor/core/text/graphicsTemplates.ts. Run it with
// `npm run templates:generate` after changing the converter, then commit the result.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'public', 'templates');
const work = await mkdtemp(join(tmpdir(), 'tfve-templates-'));

try {
	const bundle = join(work, 'generate.mjs');
	await build({
		stdin: {
			contents: `
				export { convertAllGraphicTemplates } from './src/editor/core/templates/templateConverter';
				export { serializeTemplate } from './src/editor/core/templates/templateService';
			`,
			resolveDir: root,
			loader: 'ts'
		},
		bundle: true,
		platform: 'node',
		format: 'esm',
		outfile: bundle,
		logLevel: 'error'
	});
	const { convertAllGraphicTemplates, serializeTemplate } = await import(pathToFileURL(bundle).href);

	mkdirSync(outDir, { recursive: true });
	let written = 0;
	for (const template of convertAllGraphicTemplates()) {
		const file = join(outDir, `${template.id}.tfvetemplate`);
		// Keep the original creation time so regenerating does not churn every file.
		if (existsSync(file)) {
			try {
				const { createdAt } = JSON.parse(readFileSync(file, 'utf8'));
				if (createdAt) template.createdAt = createdAt;
			} catch {
				// An unreadable file is simply overwritten.
			}
		}
		const json = serializeTemplate(template);
		if (!existsSync(file) || readFileSync(file, 'utf8') !== json) {
			writeFileSync(file, json, 'utf8');
			written += 1;
			console.log(`wrote ${template.id}.tfvetemplate`);
		}
	}
	console.log(written === 0 ? 'Templates are up to date.' : `Updated ${written} template file(s).`);
} finally {
	await rm(work, { recursive: true, force: true });
}
