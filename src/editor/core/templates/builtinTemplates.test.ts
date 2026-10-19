import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	BUILTIN_MOTION_TEMPLATES,
	getBuiltinMotionTemplate,
	resolveMotionTemplate
} from './builtinTemplates';
import { deserializeTemplate } from './templateService';

const DIR = 'public/templates';
const read = (name: string) => readFileSync(`${DIR}/${name}`, 'utf8');
const libraryFiles = () =>
	readdirSync(DIR)
		.filter((name) => name.endsWith('.tfvetemplate') && name !== 'example.tfvetemplate')
		.sort();

describe('built-in templates are data', () => {
	it('is exactly the shipped files, byte for byte as data', () => {
		const files = libraryFiles();
		expect(files.length).toBeGreaterThan(0);
		expect(BUILTIN_MOTION_TEMPLATES).toHaveLength(files.length);
		for (const name of files) {
			const fromFile = deserializeTemplate(read(name));
			expect(getBuiltinMotionTemplate(fromFile.id), name).toEqual(fromFile);
		}
	});

	it('has unique ids and lists templates in file-name order', () => {
		const ids = BUILTIN_MOTION_TEMPLATES.map((template) => template.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(libraryFiles().map((name) => name.replace(/\.tfvetemplate$/, '')));
	});

	it('resolves a built-in id and returns undefined for an unknown one', () => {
		expect(resolveMotionTemplate('cinematic-blockbuster')?.name).toBe('Cinematic Blockbuster');
		expect(resolveMotionTemplate('no-such-template')).toBeUndefined();
	});
});
