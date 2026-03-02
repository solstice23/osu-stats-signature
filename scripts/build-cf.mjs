#!/usr/bin/env node

// Build script for Cloudflare Workers deployment.
// Creates cf-dist/ with all static and application assets merged.
//
// Usage: node scripts/build-cf.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'cf-dist');

function copyDirSync(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirSync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

// Clean
if (fs.existsSync(DIST)) {
	fs.rmSync(DIST, { recursive: true, force: true });
}

// Copy static/ → cf-dist/ (frontend HTML/CSS/JS)
console.log('Copying static/ ...');
copyDirSync(path.join(ROOT, 'static'), DIST);

// Copy assets/ → cf-dist/assets/ (fonts, flags, templates, etc.)
console.log('Copying assets/ ...');
copyDirSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

console.log(`Done. Output in ${DIST}`);
