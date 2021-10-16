import express from 'express';
import path from 'path';
import * as libs from './libs.js';
import * as render from './render.js';
import * as api from './api.js';

const __dirname = path.resolve();

var app = express();

app.use('/', express.static(path.join(__dirname, '/static')));

app.get('/card', async function(req, res) {
    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
    });
    let username = req.query.user ?? "";
    let playmode = req.query.mode ?? "std";
    let userData = await api.getUser(username, playmode);
    if (userData.error) {
        res.send(render.getErrorSVG("Error: " + userData.error));
        return;
    }
    let avatarBase64 = await api.getImageBase64(userData.avatar_url);
    let userCoverImage = await api.getImage(userData.cover_url);

    let blur = 0;
    if (req.query.blur != undefined && req.query.blur == '') {
        blur = 6;
    } else if (req.query.blur != undefined) {
        blur = parseFloat(req.query.blur);
    }
    let userCoverImageBase64 = await libs.getResizdCoverBase64(userCoverImage, 550, 120, blur);

    
    userData.options = {
        animation: (req.query.animation != undefined && req.query.animation != 'false'),
        size: {
            width: parseFloat(req.query.w ?? 550),
            height: parseFloat(req.query.h ?? 320)
        },
        color_hue: parseInt(req.query.hue ?? 333),
    }

    res.send(render.getRenderedSVG(userData, avatarBase64, userCoverImageBase64));
});

app.listen(process.env.PORT || 3000);