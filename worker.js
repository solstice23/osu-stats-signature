// Cloudflare Workers entry point
// Configures the platform abstraction for the Workers runtime, then handles requests.
//
// Assets (fonts, flags, SVG templates, etc.) are served from the static assets binding.
// The worker handles /card and /skills API routes; all other paths fall through to static assets.

import { platform } from './platform.js';
import { handleCard, handleSkills } from './handler.js';
import opentype from 'opentype.js';
import { PhotonImage, resize, gaussian_blur, fliph, SamplingFilter } from '@cf-wasm/photon';

// ---------------------------------------------------------------------------
// text-to-svg shim — provides getPath / getMetrics / getSVG from an opentype Font
// ---------------------------------------------------------------------------

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

		if (anchor.horizontal === 'center') x -= width / 2;
		else if (anchor.horizontal === 'right') x -= width;

		if (anchor.vertical === 'top') y += ascender;
		else if (anchor.vertical === 'middle') y += ascender - height / 2;
		else if (anchor.vertical === 'bottom') y += descender;

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
// Simple in-memory cache (per-isolate, persists across requests on warm starts)
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
	const url = new URL(assetPath, 'http://assets.local');
	const resp = await ASSETS_BINDING.fetch(new Request(url.toString()));
	if (!resp.ok) throw new Error(`Asset not found: ${assetPath} (${resp.status})`);
	return resp;
}

// ---------------------------------------------------------------------------
// Platform configuration (Cloudflare Workers)
// ---------------------------------------------------------------------------

const textCache = new Map();
const binaryCache = new Map();

function configurePlatform(env) {
	ASSETS_BINDING = env.ASSETS;

	platform.readTextFile = (assetPath) => {
		if (textCache.has(assetPath)) return textCache.get(assetPath);
		throw new Error(`Asset not pre-loaded (text): ${assetPath}`);
	};

	platform.readBinaryFile = (assetPath) => {
		if (binaryCache.has(assetPath)) return binaryCache.get(assetPath);
		throw new Error(`Asset not pre-loaded (binary): ${assetPath}`);
	};

	platform.fileExists = (assetPath) => {
		if (textCache.has(assetPath) || binaryCache.has(assetPath)) return true;
		// Flags are lazy-loaded — assume they exist
		if (assetPath.startsWith('/assets/flags/')) return true;
		return false;
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

	platform.getEnv = (name) => env[name];
}

// ---------------------------------------------------------------------------
// Async preload helpers
// ---------------------------------------------------------------------------

async function preloadText(assetPath) {
	if (textCache.has(assetPath)) return;
	const resp = await fetchAsset(assetPath);
	textCache.set(assetPath, await resp.text());
}

async function preloadBinary(assetPath) {
	if (binaryCache.has(assetPath)) return;
	const resp = await fetchAsset(assetPath);
	const buf = await resp.arrayBuffer();
	binaryCache.set(assetPath, new Uint8Array(buf));
}

// ---------------------------------------------------------------------------
// Core asset preloading — only the essentials for rendering
// ---------------------------------------------------------------------------

let coreAssetsReady = false;

async function ensureCoreAssets() {
	if (coreAssetsReady) return;

	// Fonts (binary) — only Comfortaa (~137KB each, fast to parse)
	// CJK font (SourceHanSansSC, 15.6MB) is excluded from the build entirely.
	// render.js ensureFontsLoaded() catches the error and falls back to Comfortaa-Regular.
	await Promise.all([
		preloadBinary('/assets/fonts/Comfortaa/Comfortaa-Regular.ttf'),
		preloadBinary('/assets/fonts/Comfortaa/Comfortaa-Bold.ttf'),
	]);

	// SVG templates
	const templateTypes = ['full', 'mini', 'skill_only'];
	const templateLangs = ['cn', 'en'];
	await Promise.all(
		templateTypes.flatMap((type) =>
			templateLangs.map((lang) =>
				preloadText(`/assets/svg_template/${type}/template_${lang}.svg`).catch(() => {})
			)
		)
	);

	// Mode icons
	await Promise.all(
		['std', 'taiko', 'catch', 'mania'].map((m) => preloadText(`/assets/modes/${m}.svg`))
	);

	// Supporter icons
	await Promise.all([1, 2, 3].map((l) => preloadText(`/assets/icons/supporter_${l}.svg`)));

	// Fallback flag (always needed)
	await preloadText('/assets/flags/1f1fd-1f1fd.svg').catch(() => {});

	coreAssetsReady = true;
}

// Example-mode assets (loaded only when ?example=true)
let exampleAssetsReady = false;

async function ensureExampleAssets() {
	if (exampleAssetsReady) return;
	await Promise.all([
		preloadText('/assets/example/user.json'),
		preloadBinary('/assets/example/example_avatar.png').catch(() => {}),
		preloadBinary('/assets/example/example_banner_c3.jpg').catch(() => {}),
		preloadBinary('/assets/example/example_banner_c4.jpg').catch(() => {}),
	]);
	exampleAssetsReady = true;
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

let platformReady = false;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// --- Static file requests: pass straight to ASSETS, zero preloading ---
		if (pathname !== '/card' && pathname !== '/skills') {
			if (pathname === '/' || pathname === '') {
				return env.ASSETS.fetch(new Request(new URL('/index.html', request.url).toString()));
			}
			return env.ASSETS.fetch(request);
		}

		// --- API routes: /card and /skills ---
		try {
			// One-time platform + core asset init
			if (!platformReady) {
				configurePlatform(env);
				platformReady = true;
			}
			await ensureCoreAssets();

			const query = url.searchParams;
			const cacheControlHeader = request.headers.get('cache-control');
			const cache = makeCache();

			// Pre-load example assets only when needed
			if (query.get('example') === 'true') {
				await ensureExampleAssets();
			}

			// First pass: render, collecting any flag cache misses
			const flagMissQueue = [];
			const savedReadTextFile = platform.readTextFile;

			platform.readTextFile = (assetPath) => {
				if (textCache.has(assetPath)) return textCache.get(assetPath);
				if (assetPath.startsWith('/assets/flags/')) {
					flagMissQueue.push(assetPath);
					// Return fallback flag
					if (textCache.has('/assets/flags/1f1fd-1f1fd.svg')) {
						return textCache.get('/assets/flags/1f1fd-1f1fd.svg');
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

			// If flags were missing, load them and re-render once
			if (flagMissQueue.length > 0) {
				await Promise.all(flagMissQueue.map((p) => preloadText(p).catch(() => {})));
				platform.readTextFile = savedReadTextFile;
				const cache2 = makeCache();
				if (pathname === '/card') {
					result = await handleCard(query, cacheControlHeader, cache2);
				} else {
					result = await handleSkills(query, cacheControlHeader, cache2);
				}
			} else {
				platform.readTextFile = savedReadTextFile;
			}

			return new Response(result.svg, {
				headers: {
					'Content-Type': 'image/svg+xml',
					// Don't let a transient failure sit in the edge cache for an hour
					'Cache-Control': result.error ? 'public, max-age=60' : 'public, max-age=3600',
				},
			});
		} catch (err) {
			return new Response(`Error: ${err.message}\n${err.stack}`, {
				status: 500,
				headers: { 'Content-Type': 'text/plain' },
			});
		}
	},
};
