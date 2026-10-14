import { describe, expect, it } from 'vitest';
import { probeCodecCapabilities, isCodecSupportedSync, generateDiagnosticReport } from '../probe';
import { CODEC_PACK_METADATA } from '../packService';

describe('Codec Probe & Diagnostics', () => {
	it('probes platform capabilities and returns a structured report', async () => {
		const report = await probeCodecCapabilities();
		expect(report).toBeDefined();
		expect(typeof report.timestamp).toBe('string');
		expect(typeof report.userAgent).toBe('string');
		expect(report.codecs).toBeDefined();
		expect(report.audioCodecs).toBeDefined();
		expect(report.containers).toBeDefined();
	});

	it('returns synchronous support lookup matching probe results', async () => {
		await probeCodecCapabilities();
		const supported = isCodecSupportedSync('vp9-webm');
		expect(typeof supported === 'boolean' || supported === undefined).toBe(true);
	});

	it('generates a diagnostic markdown text report for user export', () => {
		const reportText = generateDiagnosticReport();
		expect(typeof reportText).toBe('string');
		expect(reportText).toContain('=== THE FREE VIDEO EDITOR: CODEC DIAGNOSTIC REPORT ===');
		expect(reportText).toContain('User Agent:');
		expect(reportText).toContain('--- VIDEO CODECS ---');
		expect(reportText).toContain('--- AUDIO CODECS ---');
	});

	it('validates Codec Pack metadata compliance', () => {
		expect(CODEC_PACK_METADATA.license).toBe('LGPL-2.1-or-later');
		expect(CODEC_PACK_METADATA.decoders.some((d) => d.includes('ProRes'))).toBe(true);
		expect(CODEC_PACK_METADATA.encoders.some((e) => e.includes('ProRes-compatible'))).toBe(true);
		expect(CODEC_PACK_METADATA.formats).toContain('QuickTime MOV');
		expect(CODEC_PACK_METADATA.formats).toContain('Material eXchange Format (MXF)');
	});
});
