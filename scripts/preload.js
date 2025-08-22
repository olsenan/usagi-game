(function () {
  const Loader = {
    manifest: null,
    images: new Map(),
    audio: new Map(),

    async loadJSON(path) {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return res.json();
    },

    loadImage(path) {
      return new Promise((resolve, reject) => {
        if (this.images.has(path)) return resolve(this.images.get(path));
        const img = new Image();
        img.onload = () => { this.images.set(path, img); resolve(img); };
        img.onerror = () => reject(new Error(`Image load failed: ${path}`));
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

    _readInlineManifest() {
      const tag = document.getElementById("manifest-inline");
      if (!tag) return null;
      try { return JSON.parse(tag.textContent); } catch { return null; }
    },

    async init() {
      // Try external manifest first; fall back to inline when file://
      try {
        this.manifest = await this.loadJSON("./manifest/sprite_manifest.json");
      } catch (err) {
        console.warn("Manifest fetch failed, using inline manifest. Error:", err);
        const inline = this._readInlineManifest();
        if (!inline) throw new Error("No manifest available (fetch failed and no inline manifest found).");
        this.manifest = inline;
      }

      // Preload images
      const allPaths = [];
      for (const who of Object.values(this.manifest.characters)) {
        for (const anim of Object.values(who.animations)) {
          allPaths.push(anim.path);
        }
      }
      for (const val of Object.values(this.manifest.ui || {})) {
        if (typeof val === "string") allPaths.push(val);
      }

      await Promise.all(allPaths.map(p =>
        this.loadImage(p).catch(err => console.warn(String(err)))
      ));

      // Audio
      const { audio } = this.manifest;
      if (audio?.bgm) this.loadAudio(audio.bgm, audio.bgmVolume ?? 0.5);
      if (audio?.sfx) for (const p of Object.values(audio.sfx)) this.loadAudio(p, audio.sfxVolume ?? 0.8);
    }
  };

  window.Loader = Loader;
})();
