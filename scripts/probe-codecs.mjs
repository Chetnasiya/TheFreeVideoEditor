// scripts/probe-codecs.mjs
// Runs comprehensive codec support probing across browsers on this machine.
import { chromium, webkit } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';

const VIDEO_CONFIGS = [
	// AVC / H.264
	{ name: 'H.264 Baseline L3.1', codec: 'avc1.42E01F', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'H.264 Main L3.1', codec: 'avc1.4D401F', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'H.264 High L4.0', codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
	{ name: 'H.264 High L5.1', codec: 'avc1.640033', width: 1920, height: 1080, bitrate: 20_000_000, framerate: 60 },
	{ name: 'H.264 High 10 L5.1 (10-bit)', codec: 'avc1.6E0033', width: 1920, height: 1080, bitrate: 20_000_000, framerate: 60 },
	{ name: 'H.264 High 4:2:2 L5.1', codec: 'avc1.7A0033', width: 1920, height: 1080, bitrate: 20_000_000, framerate: 60 },
	{ name: 'H.264 High 4:4:4 L5.1', codec: 'avc1.F40033', width: 1920, height: 1080, bitrate: 20_000_000, framerate: 60 },

	// HEVC / H.265
	{ name: 'HEVC Main (hvc1)', codec: 'hvc1.1.6.L93.B0', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'HEVC Main (hev1)', codec: 'hev1.1.6.L93.B0', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'HEVC Main L120 4K', codec: 'hvc1.1.6.L120.B0', width: 3840, height: 2160, bitrate: 25_000_000, framerate: 30 },
	{ name: 'HEVC Main 10 (hvc1 10-bit)', codec: 'hvc1.2.4.L93.B0', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
	{ name: 'HEVC Main 10 (hev1 10-bit)', codec: 'hev1.2.4.L93.B0', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
	{ name: 'HEVC Main 10 L150 4K60', codec: 'hvc1.2.4.L150.B0', width: 3840, height: 2160, bitrate: 40_000_000, framerate: 60 },
	{ name: 'HEVC RExt 4:2:2 10-bit', codec: 'hvc1.4.10.L120.B0', width: 1920, height: 1080, bitrate: 15_000_000, framerate: 30 },

	// VP9
	{ name: 'VP9 Profile 0 (8-bit 4:2:0)', codec: 'vp09.00.10.08', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'VP9 Profile 0 Level 4.1', codec: 'vp09.00.41.08', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 60 },
	{ name: 'VP9 Profile 2 (10-bit 4:2:0)', codec: 'vp09.02.10.10', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 },
	{ name: 'VP9 Profile 2 Level 4.1 (10-bit)', codec: 'vp09.02.41.10', width: 1920, height: 1080, bitrate: 12_000_000, framerate: 60 },
	{ name: 'VP9 Profile 1 (8-bit 4:2:2/4:4:4)', codec: 'vp09.01.10.08', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30 },
	{ name: 'VP9 Profile 3 (10-bit 4:2:2/4:4:4)', codec: 'vp09.03.10.10', width: 1920, height: 1080, bitrate: 15_000_000, framerate: 30 },
	{ name: 'VP9 Alpha keep', codec: 'vp09.00.10.08', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30, alpha: 'keep' },

	// AV1
	{ name: 'AV1 Main 8-bit L2.0', codec: 'av01.0.04M.08', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 },
	{ name: 'AV1 Main 8-bit L4.0', codec: 'av01.0.08M.08', width: 1920, height: 1080, bitrate: 6_000_000, framerate: 60 },
	{ name: 'AV1 Main 10-bit L2.0', codec: 'av01.0.04M.10', width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
	{ name: 'AV1 Main 10-bit L4.0', codec: 'av01.0.08M.10', width: 1920, height: 1080, bitrate: 8_000_000, framerate: 60 },
	{ name: 'AV1 Main 10-bit L5.0 4K60', codec: 'av01.0.12M.10', width: 3840, height: 2160, bitrate: 25_000_000, framerate: 60 },
	{ name: 'AV1 High (4:4:4 10-bit)', codec: 'av01.1.08M.10', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30 },
	{ name: 'AV1 Pro (4:2:2 10-bit)', codec: 'av01.2.08M.10', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30 },
	{ name: 'AV1 Alpha keep', codec: 'av01.0.04M.08', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30, alpha: 'keep' },

	// ProRes (Platform WebCodecs test)
	{ name: 'ProRes 422 HQ (apch)', codec: 'apch', width: 1920, height: 1080, bitrate: 220_000_000, framerate: 30 },
	{ name: 'ProRes 4444 (ap4h)', codec: 'ap4h', width: 1920, height: 1080, bitrate: 330_000_000, framerate: 30 }
];

const AUDIO_CONFIGS = [
	{ name: 'AAC-LC 48kHz Stereo 192k', codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 },
	{ name: 'AAC-LC 44.1kHz Stereo 128k', codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
	{ name: 'AAC-LC 48kHz 5.1 384k', codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 6, bitrate: 384_000 },
	{ name: 'Opus 48kHz Stereo 128k', codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
	{ name: 'Opus 48kHz Stereo 256k', codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 256_000 },
	{ name: 'Opus 48kHz 5.1 384k', codec: 'opus', sampleRate: 48000, numberOfChannels: 6, bitrate: 384_000 },
	{ name: 'FLAC 48kHz Stereo', codec: 'flac', sampleRate: 48000, numberOfChannels: 2 },
	{ name: 'FLAC 96kHz 24-bit Stereo', codec: 'flac', sampleRate: 96000, numberOfChannels: 2 },
	{ name: 'PCM 16-bit (pcm-s16)', codec: 'pcm-s16', sampleRate: 48000, numberOfChannels: 2 },
	{ name: 'PCM 24-bit (pcm-s24)', codec: 'pcm-s24', sampleRate: 48000, numberOfChannels: 2 },
	{ name: 'PCM 32-bit float (pcm-f32)', codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 2 }
];

async function probeBrowser(browserType, launchOptions, label) {
	let browser;
	try {
		browser = await browserType.launch(launchOptions);
	} catch (err) {
		console.warn(`Could not launch ${label}:`, err.message);
		return null;
	}
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto('http://localhost:4321/editor');

	const info = await page.evaluate(async ({ videoConfigs, audioConfigs }) => {
		const ua = navigator.userAgent;
		const results = {
			ua,
			hasVideoEncoder: typeof VideoEncoder !== 'undefined',
			hasVideoDecoder: typeof VideoDecoder !== 'undefined',
			hasAudioEncoder: typeof AudioEncoder !== 'undefined',
			hasAudioDecoder: typeof AudioDecoder !== 'undefined',
			videoEncoder: [],
			videoDecoder: [],
			audioEncoder: [],
			audioDecoder: [],
			pixelFormats: []
		};

		// VideoEncoder probing
		if (results.hasVideoEncoder) {
			for (const cfg of videoConfigs) {
				const query = {
					codec: cfg.codec,
					width: cfg.width,
					height: cfg.height,
					bitrate: cfg.bitrate,
					framerate: cfg.framerate,
					...(cfg.alpha ? { alpha: cfg.alpha } : {})
				};
				try {
					const res = await VideoEncoder.isConfigSupported(query);
					results.videoEncoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: res.supported,
						hardwareAcceleration: res.config?.hardwareAcceleration,
						alpha: cfg.alpha
					});
				} catch (e) {
					results.videoEncoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: false,
						error: e.message
					});
				}
			}
		}

		// VideoDecoder probing
		if (results.hasVideoDecoder) {
			for (const cfg of videoConfigs) {
				const query = {
					codec: cfg.codec,
					codedWidth: cfg.width,
					codedHeight: cfg.height
				};
				try {
					const res = await VideoDecoder.isConfigSupported(query);
					results.videoDecoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: res.supported,
						hardwareAcceleration: res.config?.hardwareAcceleration
					});
				} catch (e) {
					results.videoDecoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: false,
						error: e.message
					});
				}
			}
		}

		// AudioEncoder probing
		if (results.hasAudioEncoder) {
			for (const cfg of audioConfigs) {
				const query = {
					codec: cfg.codec,
					sampleRate: cfg.sampleRate,
					numberOfChannels: cfg.numberOfChannels,
					...(cfg.bitrate ? { bitrate: cfg.bitrate } : {})
				};
				try {
					const res = await AudioEncoder.isConfigSupported(query);
					results.audioEncoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: res.supported
					});
				} catch (e) {
					results.audioEncoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: false,
						error: e.message
					});
				}
			}
		}

		// AudioDecoder probing
		if (results.hasAudioDecoder) {
			for (const cfg of audioConfigs) {
				const query = {
					codec: cfg.codec,
					sampleRate: cfg.sampleRate,
					numberOfChannels: cfg.numberOfChannels
				};
				try {
					const res = await AudioDecoder.isConfigSupported(query);
					results.audioDecoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: res.supported
					});
				} catch (e) {
					results.audioDecoder.push({
						name: cfg.name,
						codec: cfg.codec,
						supported: false,
						error: e.message
					});
				}
			}
		}

		// Check VideoFrame constructor formats
		const testFormats = ['RGBA', 'BGRA', 'I420', 'I420A', 'I422', 'I444', 'NV12', 'I420P10', 'I422P10', 'I444P10'];
		for (const fmt of testFormats) {
			try {
				const dummy = new Uint8Array(64 * 64 * 8);
				const vf = new VideoFrame(dummy, {
					format: fmt,
					codedWidth: 64,
					codedHeight: 64,
					timestamp: 0
				});
				results.pixelFormats.push({ format: fmt, supported: true });
				vf.close();
			} catch (e) {
				results.pixelFormats.push({ format: fmt, supported: false, error: e.message });
			}
		}

		return results;
	}, { videoConfigs: VIDEO_CONFIGS, audioConfigs: AUDIO_CONFIGS });

	await browser.close();
	return { label, ...info };
}

async function main() {
	const reports = [];

	// 1. Google Chrome (stable on macOS)
	const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	if (existsSync(chromePath)) {
		console.log('Probing Google Chrome (real GPU / system codecs)...');
		const res = await probeBrowser(chromium, {
			executablePath: chromePath,
			args: ['--enable-gpu', '--ignore-gpu-blocklist']
		}, 'Google Chrome (Real GPU)');
		if (res) reports.push(res);
	}

	// 2. Playwright bundled Chromium
	console.log('Probing Playwright Chromium...');
	const resChromium = await probeBrowser(chromium, {}, 'Playwright Chromium');
	if (resChromium) reports.push(resChromium);

	// 3. WebKit (Safari engine)
	console.log('Probing WebKit (Safari engine)...');
	try {
		const resWebKit = await probeBrowser(webkit, {}, 'WebKit');
		if (resWebKit) reports.push(resWebKit);
	} catch (e) {
		console.log('WebKit probe skipped:', e.message);
	}

	writeFileSync('docs/probe_results.json', JSON.stringify(reports, null, 2));
	console.log('Saved docs/probe_results.json');
}

main().catch(err => {
	console.error('Probe failed:', err);
	process.exit(1);
});
