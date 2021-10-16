const app = {
	data() {
		return {
			username: "",
			playmode: "std",
			blur_checked: false,
			blur_size: 6,
			animation: true,
			color_hue: 333,
			size: {
				w: 550,
				h: 320
			},
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
			if (this.blur_checked){
				url += `&blur=${this.blur_size}`;
			}
			if (this.animation){
				url += "&animation=true";
			}
			if (this.color_hue != 333){
				url += "&hue=" + this.color_hue;
			}
			if (this.size.w != 550 || this.size.h != 320){
				url += "&w=" + this.size.w + "&h=" + this.size.h;
			}
			document.getElementById("link").setAttribute("href", url);
			document.getElementById("link").click();
		},
	}
}

Vue.createApp(app).mount('#main');