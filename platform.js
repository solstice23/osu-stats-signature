// Platform abstraction layer
// Configured by entry points:
//   - index.js  → Node.js / Vercel  (uses fs, got, sharp, text-to-svg)
//   - worker.js → Cloudflare Workers (uses fetch, opentype.js, ASSETS binding)
//
// All shared modules (api.js, libs.js, render.js) call these functions
// instead of importing platform-specific packages directly.

export const platform = {
	// Read a text file from assets (sync). Path is relative to project root, e.g. '/assets/flags/xxx.svg'
	readTextFile: null,

	// Read a binary file from assets (sync). Returns Buffer (Node) or Uint8Array (Worker).
	readBinaryFile: null,

	// Check if an asset file exists (sync)
	fileExists: null,

	// HTTP GET returning response body as string. Throws on non-2xx with error.response.statusCode.
	httpGet: null,

	// HTTP GET returning response body as Buffer/Uint8Array. Throws on non-2xx.
	httpGetBuffer: null,

	// Process cover image: (buffer, w, h, blur, flop) => base64 data URI string
	resizeImage: null,

	// Load a font file and return a TextToSVG-compatible instance
	// Must expose: getPath(text, options), getMetrics(text, options), getSVG(text, options)
	loadFont: null,
};
