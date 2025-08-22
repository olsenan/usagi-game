(function () {
  const Loader = {
    manifest: null,
    images: new Map(),
    audio: new Map(),

    async loadJSON(path) {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}`);
      return res.json();
    },

    loadImage(path) {
      return new Promise((resolve, reject) => {
        if (this.images.has(path)) return resolve(this.images.get(path));
        const img = new Image();
        img.onload = () => { this.images.set(path, img); resolve(img); };
        img.onerror = reject;
        img.src = path;
      });
    },

    loadAudio(path, volume = 1) {
      if (this.audio.has(path)) return this.audio.get(path);
      const el = new Audio(path);
      el.preload = "auto";
      el.volume = volume;
      this.audio.set(path, el);
      return el;
    },

    async init() {
      this.manifest = await this.loadJSON("./manifest/sprite_manifest.json");

      // Preload character sheets
      const allPaths = [];
      for (const who of Object.values(this.manifest.characters)) {
        for (const anim of Object.values(who.animations)) {
          allPaths.push(anim.path);
        }
      }
      // UI
      for (const k of Object.keys(this.manifest.ui)) {
        const p = this.manifest.ui[k];
        if (typeof p === "string") allPaths.push(p);
      }

      await Promise.all(allPaths.map(p => this.loadImage(p)));

      // Audio
      const { audio } = this.manifest;
      if (audio?.bgm) this.loadAudio(audio.bgm, audio.bgmVolume ?? 0.5);
      if (audio?.sfx) {
        for (const [k, p] of Object.entries(audio.sfx)) {
          this.loadAudio(p, audio.sfxVolume ?? 0.8);
        }
      }
    }
  };

  window.Loader = Loader;
})();
