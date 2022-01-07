import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
const __dirname = path.resolve();
export const getFlagSVGByCountryCode = (countryCode) => {
	let chars = countryCode.split('');
	let hexEmojiChars = chars.map(char => {
			return (char.charCodeAt(0) + 127397).toString(16);
		}
	);
	let fileName = hexEmojiChars.join('-');
	let filePath = path.join(__dirname, `/assets/flags/${fileName}.svg`);
	if (!fs.existsSync(filePath)) {
		filePath = path.join(__dirname, `/assets/flags/1f1fd-1f1fd.svg`);
	}
	let flagSVG = fs.readFileSync(filePath, 'utf8');
	return flagSVG;
}
export const getPlaymodeSVG = (playmode) => {
	let filePath = path.join(__dirname, `/assets/modes/${playmode}.svg`);
	let playmodeSVG = fs.readFileSync(filePath, 'utf8');
	return playmodeSVG;
}
export const getPlaymodeFullName = (playmode) => {
	const names = {
		'std': 'osu!',
		'catch': 'osu!catch',
		'mania': 'osu!mania',
		'taiko': 'osu!taiko'
	};
	return names[playmode];
}
export const formatNumber = (number, prefix = '') => {
	if (number == null){
		return '-';
	}
	let x = number.toString().split('.');
	x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return prefix + x.join('.');
}
export const formatPlaytime = (playtime) => {
	let days = Math.floor(playtime / 86400);
	let hours = Math.floor((playtime % 86400) / 3600);
	let minutes = Math.floor((playtime % 3600) / 60);
	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	} else {
		return `${hours}h ${minutes}m`;
	}
}

export const getResizdCoverBase64 = async (img, w, h, blur = 0) => {
	blur = Math.min(blur, 100);
	if (blur >= 0.5 && blur <= 100) {
		return await sharp(img)
			.resize(w * 1.5, h * 1.5)
			.blur(blur)
			.toBuffer()
			.then(data => "data:image/png;base64," + data.toString('base64'));
	} else {
		return await sharp(img)
			.resize(w * 1.5, h * 1.5)
			.toBuffer()
			.then(data => "data:image/png;base64," + data.toString('base64'));
	}
}
