// Node.js / Vercel entry point
// Configures the platform abstraction for Node.js, then starts Express.

import fs from 'fs';
import path from 'path';
import express from 'express';
import got from 'got';
import sharp from 'sharp';
import TextToSVG from 'text-to-svg';
import NodeCache from 'node-cache';
import { platform } from './platform.js';
import { handleCard, handleSkills } from './handler.js';

// ------ Platform configuration (Node.js) ------

const PROJECT_ROOT = process.cwd();

platform.readTextFile = (assetPath) => {
	return fs.readFileSync(path.join(PROJECT_ROOT, assetPath), 'utf-8');
};

platform.readBinaryFile = (assetPath) => {
	return fs.readFileSync(path.join(PROJECT_ROOT, assetPath));
};

platform.fileExists = (assetPath) => {
	return fs.existsSync(path.join(PROJECT_ROOT, assetPath));
};

platform.httpGet = async (url) => {
	const response = await got(url);
	return response.body;
};

platform.httpGetBuffer = async (url) => {
	const response = await got(url, { responseType: 'buffer' });
	return response.body;
};

platform.resizeImage = async (img, w, h, blur = 0, flop = false) => {
	let pipeline = sharp(img).resize(w, h);
	if (blur > 0) pipeline = pipeline.blur(blur);
	if (flop) pipeline = pipeline.flop();
	const buf = await pipeline.toFormat('png').toBuffer();
	return 'data:image/png;base64,' + buf.toString('base64');
};

platform.loadFont = (assetPath) => {
	return TextToSVG.loadSync(path.join(PROJECT_ROOT, assetPath));
};

// ------ In-memory cache adapter ------

const nodeCache = new NodeCache({ stdTTL: 600, checkperiod: 600, deleteOnExpire: true });
const cache = {
	get: (key) => nodeCache.get(key),
	set: (key, value) => nodeCache.set(key, value),
	has: (key) => nodeCache.has(key),
};

// ------ Express app ------

const app = express();

app.use('/', express.static(path.join(PROJECT_ROOT, '/static')));

app.get('/card', async (req, res) => {
	res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
	const query = new URLSearchParams(req.originalUrl.split('?')[1] || '');
	const result = await handleCard(query, req.headers['cache-control'] ?? null, cache);
	res.send(result.svg);
});

app.get('/skills', async (req, res) => {
	res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
	const query = new URLSearchParams(req.originalUrl.split('?')[1] || '');
	const result = await handleSkills(query, req.headers['cache-control'] ?? null, cache);
	res.send(result.svg);
});

app.listen(process.env.PORT || 3000);
