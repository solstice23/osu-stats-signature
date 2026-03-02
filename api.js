import { platform } from './platform.js';
import cheerio from 'cheerio';

export const getUser = async (username, playmode = 'std', includeTopPlays = false, includeSkills = false) => {
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
	let response;
	try {
		response = { body: await platform.httpGet(`https://osu.ppy.sh/users/${username}/${playmodes[playmode]}`) };
	} catch (error) {
		const statusCode = error.response?.statusCode || error.statusCode;
		if (statusCode === 404){
			return {
				error: `User ${username} not found`
			}
		}
		return {
			error: `Unknown Error: ${error.message}`
		}
	}
	
    const body = response.body;
	let $ = cheerio.load(body);
	let data = JSON.parse($('.js-react[data-initial-data]').attr('data-initial-data'));
	data.current_mode = playmode;

	if (includeTopPlays) {
		const topRanksBody = await platform.httpGet(`https://osu.ppy.sh/users/${data.user.id}/extra-pages/top_ranks?mode=${playmodes[playmode]}`);
		data.top_ranks = JSON.parse(topRanksBody);
	}

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