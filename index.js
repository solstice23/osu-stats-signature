import express from 'express';
import path from 'path';
import NodeCache from 'node-cache';
import * as libs from './libs.js';
import * as render from './render.js';
import * as api from './api.js';

const __dirname = path.resolve();

var cacheControl = new NodeCache({ stdTTL: 600, checkperiod: 600, deleteOnExpire: true });

var app = express();

app.use('/', express.static(path.join(__dirname, '/static')));

app.get('/card', async function (req, res) {
    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
    });
    let username = req.query.user ?? "";
    let playmode = req.query.mode ?? "std";

    let cacheKey = `${username}|${playmode}`;
    if (req.headers['cache-control'] != 'no-cache' && cacheControl.has(cacheKey)) {
        res.send(cacheControl.get(cacheKey));
        return;
    }

    let userData = await api.getUser(username, playmode);
    if (userData.error) {
        res.send(render.getErrorSVG("Error: " + userData.error));
        return;
    }
    let avatarBase64 = await api.getImageBase64(userData.user.avatar_url);
    let userCoverImage = await api.getImage(userData.user.cover_url);

    let blur = 0;
    if (req.query.blur != undefined && req.query.blur == '') {
        blur = 6;
    } else if (req.query.blur != undefined) {
        blur = parseFloat(req.query.blur);
    }
    let isMini = req.query.mini != undefined && req.query.mini == 'true';
    let userCoverImageBase64, width, height;
    if (isMini) {
        userCoverImageBase64 = await libs.getResizdCoverBase64(userCoverImage, 400, 120, blur);
        [width, height] = [400, 120];
    } else {
        userCoverImageBase64 = await libs.getResizdCoverBase64(userCoverImage, 550, 120, blur);
        [width, height] = [550, 320];
    }

    userData.options = {
        language: req.query.lang ?? "cn",
        animation: (req.query.animation != undefined && req.query.animation != 'false'),
        size: {
            width: parseFloat(req.query.w ?? width),
            height: parseFloat(req.query.h ?? height)
        },
        round_avatar: (req.query.round_avatar != undefined && req.query.round_avatar != 'false'),
        color_hue: parseInt(req.query.hue ?? 333),
    }

    let svg = "";
    if (isMini) {
        svg = render.getRenderedSVGMini(userData, avatarBase64, userCoverImageBase64);
    } else {
        svg = render.getRenderedSVGFull(userData, avatarBase64, userCoverImageBase64);
    }
    cacheControl.set(cacheKey, svg);
    res.send(svg);
});

app.listen(process.env.PORT || 3000);