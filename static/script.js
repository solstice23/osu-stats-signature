const i18n = {
	en: {
		'生成 osu! 签名档卡片': 'Generate osu! signature card',
		'用户名 / UID': 'Username / UID',
		'背景模糊': 'Background blur',
		'模糊强度': 'Blur size',
		'圆头像': 'Round avatar',
		'动画': 'Animation',
		'颜色': 'Color',
		'粉色': 'Pink',
		'紫色': 'Purple',
		'蓝色': 'Blue',
		'绿色': 'Green',
		'酸橙': 'Lime',
		'黄色': 'Yellow',
		'橙色': 'Orange',
		'红色': 'Red',
		'尺寸': 'Size',
		'完整': 'Full',
		'迷你': 'Mini',
		'生成': 'Generate',
		'▼ 显示额外选项': '▼ Show extra options',
		'▲ 隐藏额外选项': '▲ Hide extra options',
		'外边距': 'Margin',
		'上': 'top',
		'下': 'bottom',
		'左': 'left',
		'右': 'right',
		'左右反转封面图': 'Mirror cover image',
		'显示': 'Show',
		'数据统计': 'Statistics',
		'循环显示 osu!skills 和统计数据': 'Cycle between skills and stats',
		'显示 osu!skills 图表中的数字': 'Figures in skills chart',
		'在 osu!skills 用"记忆"代替"反应"': 'Replace <i>Reaction</i> with <i>Memory</i> in skills',
		'显示 osu!skill <a href=\'https://osuskills.com/faq\' target=\'_blank\'>头衔标签<\/a>': 'Show osu!skill <a href=\'https://osuskills.com/faq\' target=\'_blank\'>tags<\/a>',
		'Skills 排名显示': 'Skills Ranking Display',
		'全球排名': 'Global rank',
		'国内/区内排名': 'Country rank',
		'循环显示': 'Cycle both'
	}
}
const app = {
	data() {
		return {
			username: "",
			playmode: "std",
			language: navigator.language.includes("zh") ? "cn" : "en",
			cardmode: "full_stats",
			blur_checked: false,
			blur_size: 6,
			round_avatar: false,
			animation: true,
			color_hue: 333,
			size: {
				w: 550,
				h: 320
			},
			size_mini: {
				w: 400,
				h: 120
			},
			size_skills: {
				w: 400,
				h: 250
			},
			margin: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			},
			flop: false,
			show_extra_settings: false,
			cycle_skills_stats: false,
			show_figures_for_skills: false,
			show_memory_in_skills: false,
			show_skill_tags: true,
			skills_ranking_display: "global",

			generated_url: null,
			generated_osu_profile_url: null,
		}
	},
	watch: {
		color_hue(val) {
			document.body.style.setProperty('--base-hue', val);
		},
	},
	methods: {
		clamp(val, min, max) {
			return Math.min(Math.max(val, min), max);
		},
		generate() {
			let url = `/card?user=${encodeURI(this.username.trim())}&mode=${this.playmode}`;
			if (this.language != "cn") {
				url += `&lang=${this.language}`;
			}
			if (this.blur_checked){
				url += `&blur=${this.blur_size}`;
			}
			if (this.round_avatar){
				url += `&round_avatar=true`;
			}
			if (this.animation){
				url += "&animation=true";
			}
			if (this.color_hue != 333){
				url += `&hue=${this.color_hue}`;
			}
			switch (this.cardmode) {
				case "full_stats":
				case "full_skills":
					if (this.size.w != 550 || this.size.h != 320){
						url += `&w=${this.size.w}&h=${this.size.h}`;
					}
					break;
				case "mini":
					url += "&mini=true";
					if (this.size_mini.w != 400 || this.size_mini.h != 120){
						url += `&w=${this.size_mini.w}&h=${this.size_mini.h}`;
					}
					break;
				case "skills":
					url = url.replace("/card", "/skills");
					if (this.size_skills.w != 400 || this.size_skills.h != 250){
						url += `&w=${this.size_skills.w}&h=${this.size_skills.h}`;
					}
					break;
			}
			if (this.margin.left != 0 || this.margin.right != 0 || this.margin.top != 0 || this.margin.bottom != 0){
				url += `&margin=${this.margin.top},${this.margin.right},${this.margin.bottom},${this.margin.left}`;
			}
			if (this.flop){
				url += "&flop=true";
			}
			if (this.cardmode == "full_skills"){
				url += "&skills=true";
				if (this.cycle_skills_stats) {
					url += "&cycleskillsstats=true";
				}
				if (this.show_figures_for_skills){
					url += "&skillfigures=true";
				}
				if (this.show_memory_in_skills){
					url += "&skillmemory=true";
				}
				if (!this.show_skill_tags){
					url += "&skilltags=false";
				}
			}
			if (this.cardmode == "skills"){
				if (this.show_memory_in_skills){
					url += "&skillmemory=true";
				}
				if (this.skills_ranking_display != "global"){
					url += `&ranking_display=${this.skills_ranking_display}`;
				}
			}
			this.generated_url = url;
			this.generated_osu_profile_url = `https://osu.ppy.sh/u/${this.username}`;
			this.$nextTick(() => {
				const results = document.getElementById("results");
				results.scrollIntoView({ behavior: "smooth" });
			});
		},
		open_generated_svg() {
			this.generate();
			document.getElementById("link").setAttribute("href", this.generated_url);
			document.getElementById("link").click();
		},
		$n(text) {
			if (!i18n.hasOwnProperty(this.language)){
				return text;
			}
			return i18n[this.language][text] || text;
		},
		select_all(e) {
			e.target.select();			
		}
	},
	computed: {
		generated_full_url() {
			return window.location.origin + this.generated_url;
		},
		generated_markdown() {
			return `![osu! signature card](${this.generated_url})`;
		},
		generated_markdown_with_link() {
			return `[![osu! signature card](${this.generated_url})](${this.generated_osu_profile_url})`;
		},
		generated_bbcode() {
			return `[img]${this.generated_url}[/img]`;
		},
		generated_bbcode_with_link() {
			return `[url=${this.generated_osu_profile_url}][img]${this.generated_url}[/img][/url]`;
		},
		generated_html() {
			return `<img src="${this.generated_url}" />`;
		},
		generated_html_with_link() {
			return `<a href="${this.generated_osu_profile_url}"><img src="${this.generated_url}" /></a>`;
		}
	},
}

Vue.createApp(app).mount('#main');