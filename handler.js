// Shared request handler logic used by both Vercel (index.js) and Cloudflare Workers (worker.js).
// This module is platform-agnostic — it depends only on api.js, libs.js, and render.js,
// which in turn use the platform abstraction layer.

import * as libs from './libs.js';
import * as render from './render.js';
import * as api from './api.js';

/**
 * Handle the /card endpoint.
 * @param {URLSearchParams} query
 * @param {string|null} cacheControl - value of the cache-control request header
 * @param {{ get: (key: string) => any, set: (key: string, value: any) => void, has: (key: string) => boolean }} cache
 * @returns {Promise<{ svg: string, error?: undefined } | { error: string }>}
 */
export async function handleCard(query, cacheControl, cache) {
	let username = query.get('user') ?? '';
	const playmode = query.get('mode') ?? 'std';
	const isMini = query.get('mini') === 'true';
	const includeSkills = query.get('skills') === 'true';
	const cycleSkillsStats = query.get('cycleskillsstats') === 'true' && includeSkills;

	const exampleMode = query.get('example') === 'true';
	if (exampleMode) {
		username = '@example';
	}

	let userData, avatarBase64, userCoverImage;
	const cacheKey = `${username}|${playmode}|${includeSkills}`;

	if (cacheControl !== 'no-cache' && cache.has(cacheKey)) {
		({ userData, avatarBase64, userCoverImage } = cache.get(cacheKey));
	} else {
		userData = await api.getUser(username, playmode, !isMini, includeSkills);
		if (userData.error) return { svg: render.getErrorSVG('Error: ' + userData.error) };
		avatarBase64 = await api.getImageBase64(userData.user.avatar_url);
		userCoverImage = await api.getImage(userData.user.cover_url);
		cache.set(cacheKey, { userData, avatarBase64, userCoverImage });
	}

	let blur = 0;
	if (query.has('blur') && query.get('blur') === '') {
		blur = 6;
	} else if (query.has('blur')) {
		blur = parseFloat(query.get('blur'));
	}
	const flop = query.has('flop');
	let userCoverImageBase64, width, height;
	if (isMini) {
		userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 400, 120, blur, flop);
		[width, height] = [400, 120];
	} else {
		userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 550, 120, blur, flop);
		[width, height] = [550, 320];
	}
	const margin = (query.get('margin') ?? '0,0,0,0').split(',').map((x) => parseInt(x));

	const showMemory = query.has('skillmemory');
	const showFiguresForSkills = query.has('skillfigures');
	const showSkillTags = query.get('skilltags') !== 'false';

	userData.options = {
		language: query.get('lang') ?? 'cn',
		animation: query.has('animation') && query.get('animation') !== 'false',
		size: {
			width: parseFloat(query.get('w') ?? width),
			height: parseFloat(query.get('h') ?? height),
		},
		round_avatar: query.has('round_avatar') && query.get('round_avatar') !== 'false',
		color_hue: parseInt(query.get('hue') ?? 333),
		margin,
		includeSkills,
		cycleSkillsStats,
		skillsPlot: {
			showMemory,
			showFiguresForSkills,
			showSkillTags,
		},
	};

	const svg = isMini
		? render.getRenderedSVGMini(userData, avatarBase64, userCoverImageBase64)
		: render.getRenderedSVGFull(userData, avatarBase64, userCoverImageBase64);
	return { svg };
}

/**
 * Handle the /skills endpoint.
 * @param {URLSearchParams} query
 * @param {string|null} cacheControl
 * @param {{ get: (key: string) => any, set: (key: string, value: any) => void, has: (key: string) => boolean }} cache
 * @returns {Promise<{ svg: string }>}
 */
export async function handleSkills(query, cacheControl, cache) {
	let username = query.get('user') ?? '';
	const playmode = 'std';

	const exampleMode = query.get('example') === 'true';
	if (exampleMode) {
		username = '@example';
	}

	let userData, avatarBase64, userCoverImage;
	const cacheKey = `${username}|${playmode}|${true}`;

	if (cacheControl !== 'no-cache' && cache.has(cacheKey)) {
		({ userData, avatarBase64, userCoverImage } = cache.get(cacheKey));
	} else {
		userData = await api.getUser(username, playmode, false, true);
		if (userData.error) return { svg: render.getErrorSVG('Error: ' + userData.error) };
		avatarBase64 = await api.getImageBase64(userData.user.avatar_url);
		userCoverImage = await api.getImage(userData.user.cover_url);
		cache.set(cacheKey, { userData, avatarBase64, userCoverImage });
	}

	let blur = 0;
	if (query.has('blur') && query.get('blur') === '') {
		blur = 6;
	} else if (query.has('blur')) {
		blur = parseFloat(query.get('blur'));
	}
	const flop = query.has('flop');
	let userCoverImageBase64, width, height;
	userCoverImageBase64 = await libs.getResizedCoverBase64(userCoverImage, 400, 65, blur, flop);
	[width, height] = [400, 250];
	const margin = (query.get('margin') ?? '0,0,0,0').split(',').map((x) => parseInt(x));

	const showMemory = query.has('skillmemory');

	userData.options = {
		language: query.get('lang') ?? 'cn',
		animation: query.has('animation') && query.get('animation') !== 'false',
		size: {
			width: parseFloat(query.get('w') ?? width),
			height: parseFloat(query.get('h') ?? height),
		},
		round_avatar: query.has('round_avatar') && query.get('round_avatar') !== 'false',
		color_hue: parseInt(query.get('hue') ?? 333),
		margin,
		rankingDisplay: query.get('ranking_display') ?? 'global',
		skillsPlot: {
			showMemory,
		},
	};

	const svg = render.getRenderedSVGSkillOnly(userData, avatarBase64, userCoverImageBase64);
	return { svg };
}
