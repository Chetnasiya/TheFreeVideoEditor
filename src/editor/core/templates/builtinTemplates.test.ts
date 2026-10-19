import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	BUILTIN_MOTION_TEMPLATES,
	getBuiltinMotionTemplate,
	resolveMotionTemplate
} from './builtinTemplates';
import { createEmptyProject } from '../factory';
import { resolveFrame } from '../playback';
import type { SequenceId } from '../types';
import {
	deserializeTemplate,
	instantiateTemplateIntoProject,
	serializeTemplate
} from './templateService';

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

describe('example template', () => {
	it('ships a valid sample for authors but keeps it out of the library', () => {
		const example = deserializeTemplate(read('example.tfvetemplate'));
		expect(example.tracks.length).toBeGreaterThan(0);
		expect(getBuiltinMotionTemplate(example.id)).toBeUndefined();
		expect(deserializeTemplate(serializeTemplate(example))).toEqual(example);
	});

	it('instantiates and renders its own text, with every published field pointing at a clip', () => {
		const example = deserializeTemplate(read('example.tfvetemplate'));
		const clipIds = new Set(example.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
		for (const param of example.publishedParams) expect(clipIds.has(param.targetClipId)).toBe(true);

		const { project } = instantiateTemplateIntoProject(
			createEmptyProject({ name: 'Example' }),
			'root' as SequenceId,
			example,
			0
		);
		const [layer] = resolveFrame(project, 1_500_000).videoLayers;
		const text = layer!.nested!.layers.find((nested) => nested.kind === 'text');
		expect(text!.textData!.text).toBe('YOUR NAME HERE');
	});
});
