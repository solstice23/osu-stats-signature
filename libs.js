import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import svgRoundCorners from 'svg-round-corners';
const { roundCommands } = svgRoundCorners;

export const getFlagSVGByCountryCode = (countryCode) => {
	const chars = countryCode.split('');
	const hexEmojiChars = chars.map((char) => (char.charCodeAt(0) + 127397).toString(16));
	const fileName = hexEmojiChars.join('-');
	const filePath = path.join(process.cwd(), `/assets/flags/${fileName}.svg`);
	if (!fs.existsSync(filePath)) {
		filePath = path.join(process.cwd(), `/assets/flags/1f1fd-1f1fd.svg`);
	}

	const flagSVG = fs.readFileSync(filePath, 'utf8');
	return flagSVG;
};

export const getPlaymodeSVG = (playmode) => {
	const filePath = path.join(process.cwd(), `/assets/modes/${playmode}.svg`);
	const playmodeSVG = fs.readFileSync(filePath, 'utf8');
	return playmodeSVG;
};

export const getPlaymodeFullName = (playmode) => {
	const names = {
		std: 'osu!',
		catch: 'osu!catch',
		mania: 'osu!mania',
		taiko: 'osu!taiko'
	};
	return names[playmode];
};

/**
 * @param {number} number
 * @param {string} prefix
 */
export const formatNumber = (number, prefix = '') => {
	if (number == null) return '-';
	return `${prefix}${number.toLocaleString('en-GB')}`;
};

export const formatPlaytime = (playtime) => {
	const days = Math.floor(playtime / 86400);
	const hours = Math.floor((playtime % 86400) / 3600);
	const minutes = Math.floor((playtime % 3600) / 60);
	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	}

	return `${hours}h ${minutes}m`;
};

export const getResizdCoverBase64 = async (img, w, h, blur = 0, flop = false) => {
	blur = Math.min(blur, 100);
	const image = sharp(img).resize(w * 1.5, h * 1.5);
	if (blur >= 0.5 && blur <= 100) image.blur(blur);
	if (flop) image.flop();

	return image.toBuffer().then((data) => 'data:image/png;base64,' + data.toString('base64'));
};

export const getHexagonPath = (origX, origY, radius, borderRadius = 2) => {
	let outerPathCommands = [];
	for (let i = 0; i <= 6; i++) {
		const angle = (-120 + i * 60) / 180 * Math.PI;
		const x = origX + Math.cos(angle) * radius;
		const y = origY + Math.sin(angle) * radius;
		outerPathCommands.push({
			marker: 'L',
			values: { x, y }
		});
	}
	outerPathCommands[0].marker = 'M';
	outerPathCommands.push({
		marker: 'Z',
		values: { x: outerPathCommands[0].values.x, y: outerPathCommands[0].values.x }
	});
	const path = roundCommands(outerPathCommands, borderRadius);
	return path.path;
}

export const getColorBySkillRankName = (skillRankName) => {
	const colors = {
		Hardy: '#464ac1',
		Tenacious: '#ff0066',
		Swift: '#fcc013',
		Perceptive: '#24d8fe',
		Volcanic: '#ef525b',
		Furious: '#f8095c',
		Sturdy: '#1bad58',
		Adventurous: '#79de4f',
		Adamant: '#4dceff',
		Spirited: '#d0dc05',
		Berserk: '#b00106',
		Fearless: '#a8157d',
		Frantic: '#468c00',
		Volatile: '#dc4ad2',
		Versatile: '#e9ce14',
		Ambitious: '#46d1a7',
		Sage: '#1baec0',
		Sharpshooter: '#9b1400',
		Phychic: '#66d9b7',
		Pirate: '#d90606',
		Seer: '#1368bd',
		Sniper: '#519216',
		Daredevil: '#c01900'
	}
	return colors[skillRankName];
}