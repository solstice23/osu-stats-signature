import express from 'express';
import path from 'path';
import NodeCache from 'node-cache';
import * as libs from './libs.js';
import * as render from './render.js';
import * as api from './api.js';

const cacheControl = new NodeCache({ stdTTL: 600, checkperiod: 600, deleteOnExpire: true });
const app = express();

app.use('/', express.static(path.join(process.cwd(), '/static')));

app.get('/card', async function (req, res) {
	res.set({
		'Content-Type': 'image/svg+xml',
		'Cache-Control': 'public, max-age=3600'
	});
	let username = req.query.user ?? '';
	const playmode = req.query.mode ?? 'std';
	const isMini = req.query.mini != undefined && req.query.mini == 'true';
	const includeSkills = req.query.skills != undefined && req.query.skills == 'true';
	const cycleSkillsStats = req.query.cycleskillsstats != undefined && req.query.cycleskillsstats == 'true' && includeSkills;

	const exampleMode = req.query.example != undefined && req.query.example == 'true';
	if (exampleMode) {
		username = '@example';
	}

	let userData, avatarBase64, userCoverImage;
	let cacheKey = `${username}|${playmode}|${includeSkills}`;

	if (req.headers['cache-control'] != 'no-cache' && cacheControl.has(cacheKey)) {
		({ userData, avatarBase64, userCoverImage } = cacheControl.get(cacheKey));
	} else {
		userData = await api.getUser(username, playmode, !isMini, includeSkills);
		if (userData.error) return res.send(render.getErrorSVG('Error: ' + userData.error));
		avatarBase64 = await api.getImageBase64(userData.user.avatar_url);
		userCoverImage = await api.getImage(userData.user.cover_url);
		cacheControl.set(cacheKey, { userData, avatarBase64, userCoverImage });
	}

	let blur = 0;
	if (req.query.blur != undefined && req.query.blur == '') {
		blur = 6;
	} else if (req.query.blur != undefined) {
		blur = parseFloat(req.query.blur);
	}
	const flop = req.query.flop != undefined;
	let userCoverImageBase64, width, height;
	if (isMini) {
		userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 400, 120, blur, flop);
		[width, height] = [400, 120];
	} else {
		userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 550, 120, blur, flop);
		[width, height] = [550, 320];
	}
	const margin = (req.query.margin ?? '0,0,0,0').split(',').map((x) => parseInt(x));
	
	const showMemory = req.query.skillmemory != undefined;
	const showFiguresForSkills = req.query.skillfigures != undefined;
	const showSkillTags = req.query.skilltags != 'false';

	userData.options = {
		language: req.query.lang ?? 'cn',
		animation: req.query.animation != undefined && req.query.animation != 'false',
		size: {
			width: parseFloat(req.query.w ?? width),
			height: parseFloat(req.query.h ?? height)
		},
		round_avatar: req.query.round_avatar != undefined && req.query.round_avatar != 'false',
		color_hue: parseInt(req.query.hue ?? 333),
		margin,
		includeSkills,
		cycleSkillsStats,
		skillsPlot: {
			showMemory,
			showFiguresForSkills,
			showSkillTags
		}
	};

	const svg = isMini
		? render.getRenderedSVGMini(userData, avatarBase64, userCoverImageBase64)
		: render.getRenderedSVGFull(userData, avatarBase64, userCoverImageBase64);
	res.send(svg);
});

app.get('/skills', async function (req, res) {
	res.set({
		'Content-Type': 'image/svg+xml',
		'Cache-Control': 'public, max-age=3600'
	});
	let username = req.query.user ?? '';
	const playmode = 'std';

	const exampleMode = req.query.example != undefined && req.query.example == 'true';
	if (exampleMode) {
		username = '@example';
	}

	let userData, avatarBase64, userCoverImage;
	let cacheKey = `${username}|${playmode}|${true}`;

	if (req.headers['cache-control'] != 'no-cache' && cacheControl.has(cacheKey)) {
		({ userData, avatarBase64, userCoverImage } = cacheControl.get(cacheKey));
	} else {
		userData = await api.getUser(username, playmode, false, true);
		if (userData.error) return res.send(render.getErrorSVG('Error: ' + userData.error));
		avatarBase64 = await api.getImageBase64(userData.user.avatar_url);
		userCoverImage = await api.getImage(userData.user.cover_url);
		cacheControl.set(cacheKey, { userData, avatarBase64, userCoverImage });
	}

	let blur = 0;
	if (req.query.blur != undefined && req.query.blur == '') {
		blur = 6;
	} else if (req.query.blur != undefined) {
		blur = parseFloat(req.query.blur);
	}
	const flop = req.query.flop != undefined;
	let userCoverImageBase64, width, height;
	userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 400, 65, blur, flop);
	[width, height] = [400, 250];
	const margin = (req.query.margin ?? '0,0,0,0').split(',').map((x) => parseInt(x));
	
	const showMemory = req.query.skillmemory != undefined;

	userData.options = {
		language: req.query.lang ?? 'cn',
		animation: req.query.animation != undefined && req.query.animation != 'false',
		size: {
			width: parseFloat(req.query.w ?? width),
			height: parseFloat(req.query.h ?? height)
		},
		round_avatar: req.query.round_avatar != undefined && req.query.round_avatar != 'false',
		color_hue: parseInt(req.query.hue ?? 333),
		margin,
		rankingDisplay: req.query.ranking_display ?? 'global',
		skillsPlot: {
			showMemory
		}
	};

	const svg = render.getRenderedSVGSkillOnly(userData, avatarBase64, userCoverImageBase64);
	res.send(svg);
});

app.listen(process.env.PORT || 3000);
