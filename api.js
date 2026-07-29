import { platform } from './platform.js';
import cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Official osu! API (v2)
// ---------------------------------------------------------------------------
// Needs an OAuth client (https://osu.ppy.sh/home/account/edit#oauth) configured
// through the OSU_CLIENT_ID / OSU_CLIENT_SECRET environment variables.
// When they are missing we transparently fall back to scraping the web page.

const OSU_API_BASE = 'https://osu.ppy.sh/api/v2';
const OSU_API_VERSION = '20220705';

let tokenCache = { token: null, expiresAt: 0 };

const getAccessToken = async () => {
	const clientId = platform.getEnv?.('OSU_CLIENT_ID');
	const clientSecret = platform.getEnv?.('OSU_CLIENT_SECRET');
	if (!clientId || !clientSecret) {
		return null;
	}
	if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
		return tokenCache.token;
	}
	const response = await fetch('https://osu.ppy.sh/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'client_credentials',
			scope: 'public',
		}),
	});
	if (!response.ok) {
		throw new Error(`Failed to get an osu! API token (HTTP ${response.status})`);
	}
	const json = await response.json();
	// Renew a minute before the actual expiry
	tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
	return tokenCache.token;
}
const osuApiGet = async (token, path) => {
	const response = await fetch(OSU_API_BASE + path, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'x-api-version': OSU_API_VERSION,
		},
	});
	if (!response.ok) {
		const error = new Error(`HTTP ${response.status}`);
		error.statusCode = response.status;
		throw error;
	}
	return response.json();
}
const getUserFromApi = async (token, username, mode, includeTopPlays) => {
	const user = await osuApiGet(token, `/users/${encodeURIComponent(username)}/${mode}`);

	// Normalize the few fields the renderer expects but the API may omit/name differently
	user.country ??= { code: user.country_code, name: user.country_code };
	user.user_achievements ??= [];
	user.cover_url ??= user.cover?.custom_url ?? user.cover?.url;
	if (user.statistics) {
		user.statistics.country_rank ??= user.statistics.rank?.country ?? null;
	}

	const data = { user };

	if (includeTopPlays) {
		const bestScores = await osuApiGet(token, `/users/${user.id}/scores/best?mode=${mode}&limit=1`);
		data.top_ranks = {
			best: { items: bestScores },
			firsts: { count: user.scores_first_count ?? 0 },
		};
	}

	return data;
}
const getUserFromWeb = async (username, mode, includeTopPlays) => {
	const body = await platform.httpGet(`https://osu.ppy.sh/users/${username}/${mode}`);
	let $ = cheerio.load(body);
	let data = JSON.parse($('.js-react[data-initial-data]').attr('data-initial-data'));

	if (includeTopPlays) {
		const topRanksBody = await platform.httpGet(`https://osu.ppy.sh/users/${data.user.id}/extra-pages/top_ranks?mode=${mode}`);
		data.top_ranks = JSON.parse(topRanksBody);
	}

	return data;
}
export const getUser = async (username, playmode = 'std', includeTopPlays = false, includeSkills = false, useOfficialApi = true) => {
	if (username == '@example') {
		return JSON.parse(platform.readTextFile('/assets/example/user.json'));
	}
	const playmodes = {
		std: 'osu',
		taiko: 'taiko',
		catch: 'fruits',
		mania: 'mania',
	}
	if (!playmodes[playmode]){
		return {
			error: `Invalid playmode ${playmode}`
		}
	}
	let data;
	try {
		const token = useOfficialApi ? await getAccessToken() : null;
		data = token
			? await getUserFromApi(token, username, playmodes[playmode], includeTopPlays)
			: await getUserFromWeb(username, playmodes[playmode], includeTopPlays);
	} catch (error) {
		const statusCode = error.response?.statusCode || error.statusCode;
		if (statusCode === 404){
			return {
				error: `User ${username} not found`
			}
		}
		if (statusCode === 429){
			return {
				error: `Rate limited by osu!, please try again later`
			}
		}
		return {
			error: `Unknown Error: ${error.message}`
		}
	}
	data.current_mode = playmode;

	if (includeSkills) {
		data.user.skills = await getUserOsuSkills(data.user.username);
	}

	return data;
}
export const getImage = async (url) => {
	if (url.startsWith('example_')){
		return platform.readBinaryFile(`/assets/example/${url}`);
	}
	return platform.httpGetBuffer(url);
}
export const getImageBase64 = async (url) => {
	if (url.startsWith('example_')){
		const data = platform.readBinaryFile(`/assets/example/${url}`);
		return "data:image/png;base64," + Buffer.from(data).toString('base64');
	}
	const data = await platform.httpGetBuffer(url);
	return "data:image/png;base64," + Buffer.from(data).toString('base64');
}
export const getUserOsuSkills = async (username) => {
	const calcSingleSkill = (value, globalRank, countryRank) => {
		value = parseInt(value);
		globalRank = parseInt(globalRank);
		countryRank = parseInt(countryRank);
		return {
			"value": value,
			"globalRank": globalRank,
			"countryRank": countryRank,
			"percent": Math.min(value / 1000 * 100, 100)
		}
	}
	let body;
	try {
		body = await platform.httpGet(`https://osuskills.com/user/${username}`);
	} catch (error) {
		return {
			error: `Failed to get skills data`
		}
	}

	try {
		let $ = cheerio.load(body);
		const values = $('.skillsList .skillValue');
		const globalRanks = $('#ranks .skillTop .world');
		const countryRanks = $('#ranks .skillTop .country');
		const names = ["stamina", "tenacity", "agility", "accuracy", "precision", "reaction", "memory"];
		let result = {skills: {}, tags: []};
		for (let i = 0; i <= 6; i++){
			result.skills[names[i]] = calcSingleSkill(
				values[i].children[0].data,
				globalRanks[i].children[0].data.substring(1),
				countryRanks[i].children[0].data.substring(1)
			);
		}

		const tags = $('.userRank .userRankTitle');
		for (let i of tags){
			result.tags.push(i.children[0].data.trim());
		}

		return result;
	} catch (error) {
		return null;
	}
}