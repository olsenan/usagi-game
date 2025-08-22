// scripts/preload.js
// Preload images & audio with clear errors and Pages-safe URLs.

export const Assets = {
  images: {
    // UI
    ui_start: "assets/ui/start_button.png",
    ui_health: "assets/ui/health_bar.png",
    ui_pause: "assets/ui/pause_icon.png",

    // Player
    usagi_idle:  "assets/sprites/usagi/idle.png",
    usagi_walk:  "assets/sprites/usagi/walk.png",
    usagi_attack:"assets/sprites/usagi/attack.png",
    usagi_jump:  "assets/sprites/usagi/jump.png",
    usagi_hurt:  "assets/sprites/usagi/hurt.png",
    usagi_death: "assets/sprites/usagi/death.png",

    // Enemy
    ninja_idle:  "assets/sprites/ninja/idle.png",
    ninja_walk:  "assets/sprites/ninja/walk.png",
    ninja_attack:"assets/sprites/ninja/attack.png",
    ninja_jump:  "assets/sprites/ninja/jump.png",
    ninja_hurt:  "assets/sprites/ninja/hurt.png",
    ninja_death: "assets/sprites/ninja/death.png",
  },
  audio: {
    bgm_level1: "assets/audio/bgm_level1.ogg",
    sfx_attack: "assets/audio/attack.wav",
    sfx_hit:    "assets/audio/hit.wav",
    sfx_jump:   "assets/audio/jump.wav",
    sfx_death:  "assets/audio/death.wav",
  }
};

function toURL(path) {
  // Construct a URL relative to the current page (Pages-safe, no leading slash).
  return new URL(path, document.baseURI).toString();
}

export async function preloadAll() {
  const imagePromises = Object.entries(Assets.images).map(([key, rel]) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve([key, img]);
      img.onerror = () => reject(new Error(`Image load failed: ${rel}`));
      img.src = toURL(rel);
    })
  );

  const audioPromises = Object.entries(Assets.audio).map(([key, rel]) =>
    new Promise((resolve, reject) => {
      const audio = new Audio();
      const onCanPlay = () => { cleanup(); resolve([key, audio]); };
      const onError = () => { cleanup(); reject(new Error(`Audio load failed: ${rel}`)); };
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onCanPlay);
        audio.removeEventListener("error", onError);
      };
      audio.addEventListener("canplaythrough", onCanPlay, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = toURL(rel);
      audio.load();
    })
  );

  const entries = await Promise.all([...imagePromises, ...audioPromises]);
  const cache = Object.fromEntries(entries);
  return cache;
}
