import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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

export const getResizdCoverBase64 = async (img, w, h, blur = 0) => {
	blur = Math.min(blur, 100);
	const image = sharp(img).resize(w * 1.5, h * 1.5);
	if (blur >= 0.5 && blur <= 100) image.blur(blur);

	return image.toBuffer().then((data) => 'data:image/png;base64,' + data.toString('base64'));
};
