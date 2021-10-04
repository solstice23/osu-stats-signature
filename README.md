# osu-stats-signature

[![GitHub](https://img.shields.io/github/license/solstice23/osu-stats-signature?color=blue&style=for-the-badge)](https://github.com/solstice23/osu-stats-signature/blob/master/LICENSE) [![GitHub stars](https://img.shields.io/github/stars/solstice23/osu-stats-signature?color=ff69b4&style=for-the-badge)](https://github.com/solstice23/osu-stats-signature/stargazers) [![GitHub last commit](https://img.shields.io/github/last-commit/solstice23/osu-stats-signature?style=for-the-badge)](https://github.com/solstice23/osu-stats-signature/commits/master)

## 简介

osu-stats-signature 可以生成实时更新的 osu! 个人资料卡片/签名档。生成的卡片为 SVG，可用于个人主页。

## 使用

该项目部署在 Vercel 上，前往 [osu-stats-signature.vercel.app](https://osu-stats-signature.vercel.app) 生成卡片。

将得到的卡片 SVG 地址作为图片插入到个人主页中即可。

## 功能 & TODO

- [x] 获取 osu! 账号信息并生成卡片
- [x] 获取并显示头像和用户背景图片
- [x] 支持背景图片高斯模糊
- [x] 过渡动画
- [ ] 缓存机制
- [ ] 显示 Supporter 等 Tag
- [ ] 英文版卡片
- [ ] 生成个人 bp (最佳成绩) 卡片
- [ ] 生成单个成绩详情卡片

# 预览

<a href="https://osu.ppy.sh/users/7562902/"><img src="https://osu-stats-signature.vercel.app/card?user=mrekk&mode=std&animation=true" width="550" /></a>

<a href="https://osu.ppy.sh/users/21226378/"><img src="https://osu-stats-signature.vercel.app/card?user=solstice23&mode=std&animation=true" width="550" /></a>