const app = {
	data() {
		return {
			username: "",
			playmode: "std",
			blur_checked: false,
			blur_size: 6,
			animation: false
		}
	},
	methods: {
		generate() {
			let url = `/card?user=${encodeURI(this.username.trim())}&mode=${this.playmode}`;
			if (this.blur_checked){
				url += `&blur=${this.blur_size}`;
			}
			if (this.animation){
				url += "&animation=true";
			}
			document.getElementById("link").setAttribute("href", url);
			document.getElementById("link").click();
		}
	}
}

Vue.createApp(app).mount('#main');