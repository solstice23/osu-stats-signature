// Cloudflare Workers entry point
// Configures the platform abstraction for the Workers runtime, then handles requests.
//
// Assets (fonts, flags, SVG templates, etc.) are served from the static assets binding.
// The worker handles /card and /skills API routes; all other paths fall through to static assets.
//
import { platform } from './platform.js';
import { handleCard, handleSkills } from './handler.js';
import opentype from 'opentype.js';
import { PhotonImage, resize, gaussian_blur, fliph, SamplingFilter } from '@cf-wasm/photon';

// ---------------------------------------------------------------------------
// text-to-svg shim — provides getPath / getMetrics / getSVG from an opentype Font
// ---------------------------------------------------------------------------
// Reproduces the essential API surface of the `text-to-svg` npm package without
// pulling in Node-only `fs.readFileSync`.  Works in any JS runtime that supports
// opentype.js (CF Workers, Deno, Bun, browsers …).

function createTextToSVG(font) {
	const unitsPerEm = font.unitsPerEm;

	function getScale(fontSize) {
		return (1 / unitsPerEm) * fontSize;
	}

	function parseAnchor(anchor) {
		const parts = anchor.split(' ');
		return { horizontal: parts[0] || 'left', vertical: parts[1] || 'baseline' };
	}

	function getWidth(text, fontSize) {
		const glyphs = font.stringToGlyphs(text);
		let width = 0;
		for (let i = 0; i < glyphs.length; i++) {
			const glyph = glyphs[i];
			if (glyph.advanceWidth) {
				width += glyph.advanceWidth;
			}
			if (i < glyphs.length - 1) {
				width += font.getKerningValue(glyphs[i], glyphs[i + 1]);
			}
		}
		return width * getScale(fontSize);
	}

	function getMetrics(text, options = {}) {
		const fontSize = options.fontSize || 72;
		const anchor = parseAnchor(options.anchor || 'left baseline');
		const scale = getScale(fontSize);

		const width = getWidth(text, fontSize);
		const ascender = font.ascender * scale;
		const descender = font.descender * scale;
		const height = ascender - descender;

		let x = options.x || 0;
		let y = options.y || 0;

		// Horizontal anchor
		if (anchor.horizontal === 'center') x -= width / 2;
		else if (anchor.horizontal === 'right') x -= width;

		// Vertical anchor
		if (anchor.vertical === 'top') y += ascender;
		else if (anchor.vertical === 'middle') y += ascender - height / 2;
		else if (anchor.vertical === 'bottom') y += descender;
		// 'baseline' → y stays the same

		return { x, y, baseline: y, width, height, ascender, descender };
	}

	function getD(text, options = {}) {
		const fontSize = options.fontSize || 72;
		const metrics = getMetrics(text, options);
		const path = font.getPath(text, metrics.x, metrics.y, fontSize);
		return path.toPathData();
	}

	function getPath(text, options = {}) {
		const d = getD(text, options);
		const fill = (options.attributes && options.attributes.fill) || 'black';
		return `<path d="${d}" fill="${fill}"/>`;
	}

	function getSVG(text, options = {}) {
		const fontSize = options.fontSize || 72;
		const metrics = getMetrics(text, options);
		const path = font.getPath(text, metrics.x, metrics.y, fontSize);
		const d = path.toPathData();
		const fill = (options.attributes && options.attributes.fill) || 'black';
		const svgWidth = Math.ceil(metrics.width);
		const svgHeight = Math.ceil(metrics.height);
		return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgWidth}" height="${svgHeight}"><path d="${d}" fill="${fill}"/></svg>`;
	}

	return { getPath, getMetrics, getD, getSVG };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert ArrayBuffer / Uint8Array to base64 string */
function bufferToBase64(buffer) {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// ---------------------------------------------------------------------------
// Simple in-memory cache (per-isolate, best-effort, no inter-request guarantees)
// ---------------------------------------------------------------------------

const MEM_CACHE = new Map();
const CACHE_TTL = 600_000; // 10 min in ms

function makeCache() {
	return {
		has(key) {
			if (!MEM_CACHE.has(key)) return false;
			const entry = MEM_CACHE.get(key);
			if (Date.now() - entry.ts > CACHE_TTL) {
				MEM_CACHE.delete(key);
				return false;
			}
			return true;
		},
		get(key) {
			const entry = MEM_CACHE.get(key);
			return entry ? entry.value : undefined;
		},
		set(key, value) {
			MEM_CACHE.set(key, { value, ts: Date.now() });
		},
	};
}

// ---------------------------------------------------------------------------
// Asset reading helpers (using ASSETS binding)
// ---------------------------------------------------------------------------

/** @type {null | { fetch: (req: Request | string) => Promise<Response> }} */
let ASSETS_BINDING = null;

async function fetchAsset(assetPath) {
	// assetPath is like "/assets/flags/xxx.svg"
	const url = new URL(assetPath, 'http://assets.local');
	const resp = await ASSETS_BINDING.fetch(new Request(url.toString()));
	if (!resp.ok) throw new Error(`Asset not found: ${assetPath} (${resp.status})`);
	return resp;
}

// ---------------------------------------------------------------------------
// Platform configuration (Cloudflare Workers)
// ---------------------------------------------------------------------------

function configurePlatform(env) {
	ASSETS_BINDING = env.ASSETS;

	// Synchronous text file read: we pre-cache assets in a Map for sync access.
	// Since Workers are single-threaded and we await font loading before serving,
	// we populate this cache on first request.
	const textCache = new Map();
	const binaryCache = new Map();

	// For asset reads we need async, but the platform API is sync for text/binary reads.
	// Strategy: pre-load required assets on first request, then serve from cache.
	// For ad-hoc reads fallback to throwing with instructions to pre-load.

	platform.readTextFile = (assetPath) => {
		if (textCache.has(assetPath)) return textCache.get(assetPath);
		throw new Error(`Asset not pre-loaded (text): ${assetPath}. Call preloadAsset() first.`);
	};

	platform.readBinaryFile = (assetPath) => {
		if (binaryCache.has(assetPath)) return binaryCache.get(assetPath);
		throw new Error(`Asset not pre-loaded (binary): ${assetPath}. Call preloadAsset() first.`);
	};

	platform.fileExists = (assetPath) => {
		return textCache.has(assetPath) || binaryCache.has(assetPath);
	};

	platform.httpGet = async (url) => {
		const resp = await fetch(url, {
			headers: { 'User-Agent': 'osu-stats-signature/1.0 (Cloudflare Workers)' },
		});
		if (!resp.ok) {
			const err = new Error(`HTTP ${resp.status}`);
			err.response = { statusCode: resp.status };
			err.statusCode = resp.status;
			throw err;
		}
		return resp.text();
	};

	platform.httpGetBuffer = async (url) => {
		const resp = await fetch(url, {
			headers: { 'User-Agent': 'osu-stats-signature/1.0 (Cloudflare Workers)' },
		});
		if (!resp.ok) {
			const err = new Error(`HTTP ${resp.status}`);
			err.response = { statusCode: resp.status };
			err.statusCode = resp.status;
			throw err;
		}
		const buf = await resp.arrayBuffer();
		return new Uint8Array(buf);
	};

	platform.resizeImage = async (img, w, h, blur = 0, flop = false) => {
		const bytes = img instanceof Uint8Array ? img : new Uint8Array(img);
		let photonImg = PhotonImage.new_from_byteslice(bytes);
		const resized = resize(photonImg, w, h, SamplingFilter.Lanczos3);
		photonImg.free();
		if (blur > 0) gaussian_blur(resized, Math.max(1, Math.round(blur)));
		if (flop) fliph(resized);
		const pngBytes = resized.get_bytes();
		resized.free();
		const b64 = bufferToBase64(pngBytes);
		return `data:image/png;base64,${b64}`;
	};

	platform.loadFont = (assetPath) => {
		const buf = binaryCache.get(assetPath);
		if (!buf) throw new Error(`Font not pre-loaded: ${assetPath}`);
		const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const font = opentype.parse(arrayBuf);
		return createTextToSVG(font);
	};

	// Return helpers for async preloading
	return {
		async preloadText(assetPath) {
			if (textCache.has(assetPath)) return;
			const resp = await fetchAsset(assetPath);
			textCache.set(assetPath, await resp.text());
		},
		async preloadBinary(assetPath) {
			if (binaryCache.has(assetPath)) return;
			const resp = await fetchAsset(assetPath);
			const buf = await resp.arrayBuffer();
			binaryCache.set(assetPath, new Uint8Array(buf));
		},
		textCache,
		binaryCache,
	};
}

// ---------------------------------------------------------------------------
// Asset preloading — load all text assets that are read synchronously
// ---------------------------------------------------------------------------

let preloadDone = false;

async function preloadAssets(helpers) {
	if (preloadDone) return;

	// Fonts (binary)
	await Promise.all([
		helpers.preloadBinary('/assets/fonts/Comfortaa/Comfortaa-Regular.ttf'),
		helpers.preloadBinary('/assets/fonts/Comfortaa/Comfortaa-Bold.ttf'),
		helpers.preloadBinary('/assets/fonts/SourceHanSansSC/SourceHanSansSC-Normal.otf').catch(() => {
			// CJK font is optional; if missing the render layer falls back to Comfortaa
		}),
	]);

	// SVG templates
	const templateTypes = ['full', 'mini', 'skill_only'];
	const templateLangs = ['cn', 'en'];
	await Promise.all(
		templateTypes.flatMap((type) =>
			templateLangs.map((lang) =>
				helpers.preloadText(`/assets/svg_template/${type}/template_${lang}.svg`).catch(() => {})
			)
		)
	);

	// Mode icons
	const modes = ['std', 'taiko', 'catch', 'mania'];
	await Promise.all(modes.map((m) => helpers.preloadText(`/assets/modes/${m}.svg`)));

	// Supporter icons
	await Promise.all([1, 2, 3].map((l) => helpers.preloadText(`/assets/icons/supporter_${l}.svg`)));

	// Example data
	await Promise.all([
		helpers.preloadText('/assets/example/user.json'),
		helpers.preloadBinary('/assets/example/example_avatar.png').catch(() => {}),
		helpers.preloadBinary('/assets/example/example_banner_c3.jpg').catch(() => {}),
		helpers.preloadBinary('/assets/example/example_banner_c4.jpg').catch(() => {}),
	]);

	// Flag SVGs — enumerate from the assets binding via a known list is not possible
	// (Workers assets don't support directory listing). Instead, we load flags on-demand.
	// Override fileExists and readTextFile to support lazy loading for flags.
	const originalReadText = platform.readTextFile;
	const originalFileExists = platform.fileExists;

	platform.fileExists = (assetPath) => {
		if (helpers.textCache.has(assetPath) || helpers.binaryCache.has(assetPath)) return true;
		// For flags, we can't know ahead of time — assume exists and let readTextFile handle failure
		if (assetPath.startsWith('/assets/flags/')) return true;
		return false;
	};

	platform.readTextFile = (assetPath) => {
		if (helpers.textCache.has(assetPath)) return helpers.textCache.get(assetPath);
		throw new Error(`Asset not pre-loaded: ${assetPath}`);
	};

	preloadDone = true;
}

// ---------------------------------------------------------------------------
// Flag lazy-loading — wraps sync reads with an async pre-fetch step
// ---------------------------------------------------------------------------

// The flag SVGs cannot be enumerated up-front. We load them on-demand and cache.
// Because the platform API for readTextFile is sync, we must pre-fetch flags
// before the synchronous render runs. We do this in the request handler.

async function ensureFlagLoaded(helpers, countryCode) {
	const chars = countryCode.split('');
	const hexEmojiChars = chars.map((c) => (c.charCodeAt(0) + 127397).toString(16));
	const fileName = hexEmojiChars.join('-');
	const assetPath = `/assets/flags/${fileName}.svg`;
	if (!helpers.textCache.has(assetPath)) {
		try {
			await helpers.preloadText(assetPath);
		} catch {
			// Fallback flag
			if (!helpers.textCache.has('/assets/flags/1f1fd-1f1fd.svg')) {
				await helpers.preloadText('/assets/flags/1f1fd-1f1fd.svg');
			}
		}
	}
	// Also ensure fallback is available
	if (!helpers.textCache.has('/assets/flags/1f1fd-1f1fd.svg')) {
		await helpers.preloadText('/assets/flags/1f1fd-1f1fd.svg').catch(() => {});
	}
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

let platformHelpers = null;

export default {
	async fetch(request, env, ctx) {
		// Configure platform on first invocation
		if (!platformHelpers) {
			platformHelpers = configurePlatform(env);
		}

		// Ensure core assets are loaded
		await preloadAssets(platformHelpers);

		const url = new URL(request.url);
		const pathname = url.pathname;

		// API routes
		if (pathname === '/card' || pathname === '/skills') {
			try {
				const query = url.searchParams;
				const cacheControlHeader = request.headers.get('cache-control');
				const cache = makeCache();

				// Pre-fetch the user data to know their country code for flag preloading
				// We handle this by wrapping the handler — after getting user data,
				// the handler calls render which calls getFlagSVGByCountryCode synchronously.
				// We need to ensure the flag is loaded before that.
				//
				// Strategy: intercept the handler result? No — the handler is self-contained.
				// Instead, we temporarily patch platform.readTextFile for flags to be more lenient.

				const originalReadText = platform.readTextFile;
				const flagMissQueue = [];

				// Patch: collect missing flag reads instead of throwing
				platform.readTextFile = (assetPath) => {
					if (platformHelpers.textCache.has(assetPath)) {
						return platformHelpers.textCache.get(assetPath);
					}
					if (assetPath.startsWith('/assets/flags/')) {
						// Return fallback flag if available, and queue the real one
						flagMissQueue.push(assetPath);
						if (platformHelpers.textCache.has('/assets/flags/1f1fd-1f1fd.svg')) {
							return platformHelpers.textCache.get('/assets/flags/1f1fd-1f1fd.svg');
						}
						return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"></svg>';
					}
					throw new Error(`Asset not loaded: ${assetPath}`);
				};

				let result;
				if (pathname === '/card') {
					result = await handleCard(query, cacheControlHeader, cache);
				} else {
					result = await handleSkills(query, cacheControlHeader, cache);
				}

				// If we had flag cache misses, pre-load them and re-render
				if (flagMissQueue.length > 0) {
					await Promise.all(
						flagMissQueue.map((p) => platformHelpers.preloadText(p).catch(() => {}))
					);
					platform.readTextFile = originalReadText;
					// Re-run with flags now cached
					const cache2 = makeCache();
					if (pathname === '/card') {
						result = await handleCard(query, cacheControlHeader, cache2);
					} else {
						result = await handleSkills(query, cacheControlHeader, cache2);
					}
				} else {
					platform.readTextFile = originalReadText;
				}

				return new Response(result.svg, {
					headers: {
						'Content-Type': 'image/svg+xml',
						'Cache-Control': 'public, max-age=3600',
					},
				});
			} catch (err) {
				return new Response(`Error: ${err.message}\n${err.stack}`, {
					status: 500,
					headers: { 'Content-Type': 'text/plain' },
				});
			}
		}

		// Serve index.html for root
		if (pathname === '/' || pathname === '') {
			const resp = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url).toString()));
			return resp;
		}

		// Fall through to static assets
		return env.ASSETS.fetch(request);
	},
};
