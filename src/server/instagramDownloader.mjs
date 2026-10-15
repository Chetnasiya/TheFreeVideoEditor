import ffmpeg from '@ffmpeg-installer/ffmpeg';
import youtubedl from 'youtube-dl-exec';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const INSTAGRAM_REGEX =
	/(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:[^\/]+\/)?(?:p|reel|reels|tv|share\/reel|share\/p)\/([A-Za-z0-9_-]+)/i;

export function isInstagramUrl(url) {
	if (!url || typeof url !== 'string') return false;
	return INSTAGRAM_REGEX.test(url.trim());
}

export function extractShortcode(url) {
	if (!url || typeof url !== 'string') return null;
	const match = url.trim().match(INSTAGRAM_REGEX);
	return match ? match[1] : null;
}

function sanitizeFilename(name) {
	if (!name || typeof name !== 'string') return 'instagram_media';
	const singleLine = name.replace(/[\r\n\t]+/g, ' ').trim();
	const safe = singleLine
		.replace(/[/\\?%*:|"<>]/g, '_')
		.replace(/\s+/g, ' ')
		.trim();
	return safe.slice(0, 60) || 'instagram_media';
}

async function parseBody(req) {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (chunk) => {
			data += chunk;
		});
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				resolve({});
			}
		});
		req.on('error', () => resolve({}));
	});
}

// In-memory cache for Instagram media details to eliminate redundant Instagram queries
// Key: shortcode, Value: { details, timestamp }
const mediaDetailsCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function getCachedInstagramDetails(shortcode) {
	if (!shortcode) return null;
	const entry = mediaDetailsCache.get(shortcode);
	if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
		return entry.details;
	}
	if (entry) mediaDetailsCache.delete(shortcode);
	return null;
}

export function setCachedInstagramDetails(shortcode, details) {
	if (!shortcode || !details) return;
	if (mediaDetailsCache.size >= 100) {
		const firstKey = mediaDetailsCache.keys().next().value;
		if (firstKey) mediaDetailsCache.delete(firstKey);
	}
	mediaDetailsCache.set(shortcode, { details, timestamp: Date.now() });
}

export function clearInstagramCache() {
	mediaDetailsCache.clear();
}

export async function fetchInstagramDetails(shortcode, targetUrl) {
	// 0. Return cached details if available
	const cached = getCachedInstagramDetails(shortcode);
	if (cached) {
		return cached;
	}

	// 1. Try Polaris GraphQL query (fast, direct, anonymous for public reels and posts)
	try {
		const variables = JSON.stringify({ shortcode });
		const encoded_variables = encodeURIComponent(variables);
		const payload = `av=0&__d=www&__user=0&__a=1&__req=u&__hs=20371.HYP%3Ainstagram_web_pkg.2.1...0&dpr=1&__ccg=GOOD&__rev=1028249517&__s=ywybjm%3Aq4co81%3Adplvd8&__hsi=7559456450740095677&__dyn=7xeUjG1mxu1syUbFp41twpUnwgU7SbzEdF8aUco2qwJw5ux609vCwjE1EE2Cw8G11wBz81s8hwGxu786a3a1YwBgao6C0Mo2swtUd8-U2zxe2GewGw9a361qw8Xxm16wa-0raazo7u3C2u2J0bS1LwTwKG0WE8oC1Iwqo5p0OwUQp1yU426V89F8uwm8jwhUaE4e1tyVrx60gm5oswFwtF85i5E&__csr=geIAaiFliZllsBav4trBuTJ-KJ5WhnQyAnxeEWpBCC-hJADG9AgG4qpQ8zat5BypWy9eaRgBaJ2Xx2p6WgymmGDzQjJo8JJ4iKi8xObCjx50FzLF4-8DiwxDyGqoydV-ESQ9DLAB_GdDzFEsyUSeG8xmF9oymWyqyVFF84q5ooHohwuE5a0CU01kUUb81CE12E5V08m0WFA0ei80n2bLwjp42TOw2J-0rq04tUKp06PwEhy1u1ig4Dgy9wdW0D8n80rl0UxGtw53hEx2E1yPUy7U1J9Q0JFvc0cXwpyG4B6B2US01IAw2Bo0K215w0YEwj8&__hsdp=gaQbh9gple4i4WuA2XCG7RVt5m8DxGU4K32awCF0GBcq1AyH40uWxe3AwboK5-0FE8UbkkU4-4o11XwQCyE9UswZweC4U6iq6UOewJyEhwBwjQ2259o1oE1E85u0km5Unw7Pwaau1CwMwkEeU1v82ew2rA0LoW0W8aO0Ewc6&__hblp=0nE20wpGx6vxy2i1ryE9Gg6q1hwkE9WwkocUso4O2vDyof98K7o4-48hDwyLBx61HwkGg8VoGqawDxCGBwQxG6S0I8jwywXBCxKczEqxaax62m1FDxim1nw4axq0oC362m0iu7ohBxu11wEwfm0AE421xDwhEvwxzEvG2-3K0nO0zE1MUK0DA1DwgEizEW0Qp-2Awa8nxyi1fwRBwFwau68bE&__comet_req=7&lsd=AdGtgRvhyjc&jazoest=21085&__spin_r=1028249517&__spin_b=trunk&__spin_t=1760073111&__crn=comet.igweb.PolarisLoggedOutDesktopPostRouteNext&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=PolarisPostRootQuery&server_timestamps=true&variables=${encoded_variables}&doc_id=24368985919464652`;

		const headers = {
			accept: '*/*',
			'content-type': 'application/x-www-form-urlencoded',
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
			'x-csrftoken': 'YuvV-QRvpR2Ggzgk0cTg1T',
			'x-ig-app-id': '936619743392459',
			Cookie: 'csrftoken=YuvV-QRvpR2Ggzgk0cTg1T; mid=aOia4gALAAHSq3em2E34YEIFkMCC'
		};

		const res = await fetch('https://www.instagram.com/graphql/query', {
			method: 'POST',
			headers,
			body: payload
		});

		if (res.ok) {
			const json = await res.json();
			const items = json?.data?.xdt_api__v1__media__shortcode__web_info?.items;
			if (items && items.length > 0) {
				const item = items[0];
				const caption = item.caption?.text?.trim() || '';
				const uploader = item.user?.username || item.user?.full_name || '';
				const duration = item.video_duration || 0;
				const videoVersions = item.video_versions || [];
				const imageCandidates = item.image_versions2?.candidates || [];
				const isVideo = videoVersions.length > 0;

				const thumbnail =
					(imageCandidates.length > 0 ? imageCandidates[0].url : '') ||
					(videoVersions.length > 0 ? videoVersions[0].url : '');

				const title = caption.slice(0, 80) || (isVideo ? 'Instagram Reel' : 'Instagram Photo');

				const availableHeights = Array.from(
					new Set(videoVersions.map((v) => v.height).filter((h) => typeof h === 'number' && h > 0))
				).sort((a, b) => b - a);

				const details = {
					id: shortcode,
					title,
					uploader,
					duration,
					thumbnail,
					mediaType: isVideo ? 'video' : 'image',
					videoVersions,
					imageCandidates,
					availableQualities: availableHeights
				};

				setCachedInstagramDetails(shortcode, details);
				return details;
			}
		}
	} catch {
		// proceed to yt-dlp fallback
	}

	// 2. Fallback to yt-dlp
	try {
		const info = await youtubedl(targetUrl, {
			dumpSingleJson: true,
			noWarnings: true,
			ffmpegLocation: ffmpeg.path
		});

		const availableHeights = Array.from(
			new Set(
				(info.formats || []).map((f) => f.height).filter((h) => typeof h === 'number' && h > 0)
			)
		).sort((a, b) => b - a);

		const details = {
			id: info.id || shortcode,
			title: info.title || 'Instagram Media',
			uploader: info.uploader || '',
			duration: info.duration || 0,
			thumbnail: info.thumbnail || '',
			mediaType: 'video',
			availableQualities: availableHeights,
			videoVersions: (info.formats || []).map((f) => ({
				url: f.url,
				width: f.width,
				height: f.height
			})),
			imageCandidates: []
		};

		setCachedInstagramDetails(shortcode, details);
		return details;
	} catch {
		throw new Error(
			'Failed to fetch Instagram media details. Please make sure the post or reel is public and the URL is valid.'
		);
	}
}

export async function handleInstagramInfo(req, res) {
	try {
		const parsedUrl = new URL(req.url, 'http://localhost');
		let targetUrl = parsedUrl.searchParams.get('url');

		if (!targetUrl && req.method === 'POST') {
			const body = await parseBody(req);
			targetUrl = body.url;
		}

		if (!targetUrl || !isInstagramUrl(targetUrl)) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Please enter a valid Instagram Reel or Post link.' }));
			return;
		}

		const shortcode = extractShortcode(targetUrl);
		if (!shortcode) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Could not extract shortcode from Instagram link.' }));
			return;
		}

		const details = await fetchInstagramDetails(shortcode, targetUrl);

		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		res.end(
			JSON.stringify({
				id: details.id,
				title: details.title,
				duration: details.duration,
				thumbnail: details.thumbnail,
				uploader: details.uploader,
				mediaType: details.mediaType,
				availableQualities: details.availableQualities
			})
		);
	} catch (err) {
		const message = (err && err.message) || 'Failed to fetch Instagram details.';
		res.statusCode = 400;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ error: message }));
	}
}

export async function handleInstagramDownload(req, res) {
	const tempFilesToClean = [];

	const cleanup = () => {
		for (const file of tempFilesToClean) {
			try {
				if (fs.existsSync(file)) fs.unlinkSync(file);
			} catch {
				// ignore cleanup error
			}
		}
	};

	try {
		const parsedUrl = new URL(req.url, 'http://localhost');
		let targetUrl = parsedUrl.searchParams.get('url');
		let formatType = parsedUrl.searchParams.get('formatType') || 'video';
		let quality = parsedUrl.searchParams.get('quality') || 'best';

		if (req.method === 'POST') {
			const body = await parseBody(req);
			if (body.url) targetUrl = body.url;
			if (body.formatType) formatType = body.formatType;
			if (body.quality) quality = body.quality;
		}

		if (!targetUrl || !isInstagramUrl(targetUrl)) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Please enter a valid Instagram Reel or Post link.' }));
			return;
		}

		const shortcode = extractShortcode(targetUrl);
		if (!shortcode) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Could not extract shortcode from Instagram link.' }));
			return;
		}

		const details = await fetchInstagramDetails(shortcode, targetUrl);
		const safeTitle = sanitizeFilename(details.title);

		const asciiFilename =
			safeTitle
				.replace(/[^a-zA-Z0-9_.\- ]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim() || 'instagram_media';

		if (details.mediaType === 'image') {
			// Photo post download
			const candidates = details.imageCandidates || [];
			if (!candidates.length) {
				throw new Error('No image streams found for this Instagram post.');
			}
			const imgUrl = candidates[0].url;
			const imgFetch = await fetch(imgUrl);
			if (!imgFetch.ok) {
				throw new Error(`Failed to download photo from Instagram CDN: ${imgFetch.statusText}`);
			}
			const arrayBuffer = await imgFetch.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			const encodedTitle = encodeURIComponent(`${safeTitle}.jpg`);

			res.statusCode = 200;
			res.setHeader('Content-Type', 'image/jpeg');
			res.setHeader('Content-Length', buffer.length);
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${asciiFilename}.jpg"; filename*=UTF-8''${encodedTitle}`
			);
			res.setHeader('X-Video-Title', encodeURIComponent(safeTitle));
			res.setHeader('X-File-Type', 'jpg');
			res.end(buffer);
			return;
		}

		// Video / Reel download
		const versions = details.videoVersions || [];
		if (!versions.length) {
			throw new Error('No video stream found for this Instagram reel/post.');
		}

		// Select best matching video stream
		let selectedVersion = versions[0];
		if (quality && quality !== 'best') {
			const targetHeight = parseInt(quality, 10);
			const matched = versions.find((v) => v.height && v.height <= targetHeight);
			if (matched) selectedVersion = matched;
		}
		const videoStreamUrl = selectedVersion.url;

		const tempId = `ig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		if (formatType === 'audio') {
			// Transcode to MP3 using ffmpeg
			const tempMp3 = path.join(os.tmpdir(), `${tempId}.mp3`);
			tempFilesToClean.push(tempMp3);

			await new Promise((resolve, reject) => {
				const proc = spawn(ffmpeg.path, [
					'-i',
					videoStreamUrl,
					'-vn',
					'-acodec',
					'libmp3lame',
					'-b:a',
					'192k',
					'-y',
					tempMp3
				]);
				proc.on('close', (code) => {
					if (code === 0) resolve();
					else reject(new Error(`FFmpeg audio extraction failed with code ${code}`));
				});
				proc.on('error', reject);
			});

			const mp3Buffer = fs.readFileSync(tempMp3);
			cleanup();

			const encodedTitle = encodeURIComponent(`${safeTitle}.mp3`);

			res.statusCode = 200;
			res.setHeader('Content-Type', 'audio/mpeg');
			res.setHeader('Content-Length', mp3Buffer.length);
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${asciiFilename}.mp3"; filename*=UTF-8''${encodedTitle}`
			);
			res.setHeader('X-Video-Title', encodeURIComponent(safeTitle));
			res.setHeader('X-File-Type', 'mp3');
			res.end(mp3Buffer);
			return;
		}

		if (formatType === 'video_only') {
			// Strip audio using ffmpeg
			const tempMp4 = path.join(os.tmpdir(), `${tempId}_video.mp4`);
			tempFilesToClean.push(tempMp4);

			await new Promise((resolve, reject) => {
				const proc = spawn(ffmpeg.path, [
					'-i',
					videoStreamUrl,
					'-c:v',
					'copy',
					'-an',
					'-y',
					tempMp4
				]);
				proc.on('close', (code) => {
					if (code === 0) resolve();
					else reject(new Error(`FFmpeg video copy failed with code ${code}`));
				});
				proc.on('error', reject);
			});

			const videoBuffer = fs.readFileSync(tempMp4);
			cleanup();

			const encodedTitle = encodeURIComponent(`${safeTitle}.mp4`);

			res.statusCode = 200;
			res.setHeader('Content-Type', 'video/mp4');
			res.setHeader('Content-Length', videoBuffer.length);
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${asciiFilename}.mp4"; filename*=UTF-8''${encodedTitle}`
			);
			res.setHeader('X-Video-Title', encodeURIComponent(safeTitle));
			res.setHeader('X-File-Type', 'mp4');
			res.end(videoBuffer);
			return;
		}

		// Standard Video + Audio: Direct in-memory buffer transfer from CDN stream
		const vidFetch = await fetch(videoStreamUrl);
		if (!vidFetch.ok) {
			throw new Error(`Failed to fetch video stream from CDN: ${vidFetch.statusText}`);
		}
		const arrayBuf = await vidFetch.arrayBuffer();
		const buffer = Buffer.from(arrayBuf);

		const encodedTitle = encodeURIComponent(`${safeTitle}.mp4`);

		res.statusCode = 200;
		res.setHeader('Content-Type', 'video/mp4');
		res.setHeader('Content-Length', buffer.length);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${asciiFilename}.mp4"; filename*=UTF-8''${encodedTitle}`
		);
		res.setHeader('X-Video-Title', encodeURIComponent(safeTitle));
		res.setHeader('X-File-Type', 'mp4');
		res.end(buffer);
	} catch (err) {
		cleanup();
		const message = (err && err.message) || 'Instagram download failed.';
		if (!res.headersSent) {
			try {
				res.removeHeader('Content-Length');
				res.removeHeader('Content-Disposition');
				res.removeHeader('X-Video-Title');
				res.removeHeader('X-File-Type');
			} catch {
				// ignore header removal issues
			}
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: message }));
		}
	}
}

export function instagramDownloadPlugin() {
	const middleware = (req, res, next) => {
		const parsedUrl = new URL(req.url || '/', 'http://localhost');
		if (parsedUrl.pathname === '/api/instagram-info') {
			void handleInstagramInfo(req, res);
		} else if (parsedUrl.pathname === '/api/download-instagram') {
			void handleInstagramDownload(req, res);
		} else {
			next();
		}
	};

	return {
		name: 'vite-plugin-instagram-downloader',
		configureServer(server) {
			server.middlewares.use(middleware);
		},
		configurePreviewServer(server) {
			server.middlewares.use(middleware);
		}
	};
}
