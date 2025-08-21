/* =========================================================
   Usagi (SNES-style) Pixel-Perfect Loop w/ Sprite Fixes
   - Integer scaling to base 256x224
   - imageSmoothing disabled across the board
   - SpriteSheet helper w/ spacing & safe insets to prevent bleeding
   - All draws snapped to integer pixels (no subpixel jitter)
   - Responsive, not absolute sprite sizing
   - Minimal player stub w/ idle/run/jump/attack states
   ========================================================= */

const BASE_W = 256;   // SNES-ish internal width
const BASE_H = 224;   // SNES-ish internal height

// ---- Configure your assets here ----
// If the file names differ in your repo, just update the "candidates" lists.
// "spacing" is the gap between frames in your sprite sheet (0 or 1+).
// "margin" is the outer border before the first frame begins.
const ASSETS = {
  background: {
    candidates: [
      'assets/bg.png',
      'assets/backgrounds/forest.png',
      'assets/backgrounds/level1.png'
    ]
  },
  playerSheet: {
    // Try these names in order until one loads successfully:
    candidates: [
      'assets/usagi/usagi.png',
      'assets/usagi_spritesheet.png',
      'assets/sprites/usagi.png',
      'assets/sprites/usagi_spritesheet.png'
    ],
    frameW: 32,       // <- adjust to your sheet
    frameH: 32,       // <- adjust to your sheet
    columns: 8,       // <- frames per row in the sheet
    margin: 0,        // <- outer padding of sheet (px)
    spacing: 1        // <- spacing between frames (px) – set to 0 if none
  }
};

// Animation definitions (frame indices within the sheet)
const ANIMS = {
  idle:   { frames: [0,1,2,3], fps: 6, loop: true },
  run:    { frames: [8,9,10,11,12,13], fps: 10, loop: true },
  jump:   { frames: [16,17,18,19], fps: 8, loop: false },
  attack: { frames: [24,25,26,27], fps: 12, loop: false, holdLast: true }
};

// Controls (keyboard)
const KEYS = {
  LEFT:  ['ArrowLeft', 'KeyA'],
  RIGHT: ['ArrowRight', 'KeyD'],
  UP:    ['ArrowUp', 'KeyW', 'Space'],
  ATTACK:['KeyJ', 'KeyK', 'KeyF', 'KeyH', 'KeyZ', 'KeyX']
};

// ---------------------------------------------------------
// Canvas + Context (pixel-perfect)
// ---------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

// Hard set internal resolution; scale up via CSS only (integer multiples)
canvas.width = BASE_W;
canvas.height = BASE_H;

// Absolutely disable smoothing (prevents halos/blur)
ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingQuality = 'low';

// Integer scaling to fit window while preserving aspect (no fractional scale)
function resizeCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth  / BASE_W,
    window.innerHeight / BASE_H
  )));
  canvas.style.width  = (BASE_W * scale) + 'px';
  canvas.style.height = (BASE_H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------
// Utilities
// ---------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + src));
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now(); // cache-bust while iterating
  });
}

async function loadFirstAvailableImage(candidates) {
  let lastErr = null;
  for (const src of candidates) {
    try {
      return await loadImage(src);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('No candidate image could be loaded.');
}

// Snap to integer pixels to avoid sub-pixel sampling
function ipx(n) { return Math.round(n); }

// ---------------------------------------------------------
// Sprite System
// ---------------------------------------------------------
class SpriteSheet {
  constructor(img, frameW, frameH, columns, margin = 0, spacing = 0) {
    this.img = img;
    this.fw = frameW;
    this.fh = frameH;
    this.cols = columns;
    this.margin = margin;
    this.spacing = spacing;

    // A tiny inset to avoid sampling bordering texels when scaling
    // (Fixes "edge bleeding" when frames are adjacent.)
    this.safeInset = 0.01;
  }

  // Compute source rect for given frame index
  srcRect(index) {
    const m = this.margin, s = this.spacing, fw = this.fw, fh = this.fh;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    let sx = m + col * (fw + s);
    let sy = m + row * (fh + s);

    // Apply a tiny inset on all sides to prevent bleeding
    const inset = this.safeInset;
    sx += inset;
    sy += inset;
    const sw = fw - inset * 2;
    const sh = fh - inset * 2;

    return { sx, sy, sw, sh };
  }
}

class Animation {
  constructor(frames, fps = 8, loop = true, holdLast = false) {
    this.frames = frames;
    this.fps = fps;
    this.loop = loop;
    this.holdLast = holdLast;
    this.t = 0;
    this.i = 0;
    this.done = false;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const advance = Math.floor(this.t * this.fps);
    if (advance > 0) {
      this.t -= advance / this.fps;
      this.i += advance;
      if (this.i >= this.frames.length) {
        if (this.loop) {
          this.i = this.i % this.frames.length;
        } else {
          this.i = this.holdLast ? this.frames.length - 1 : this.frames.length - 1;
          this.done = true;
        }
      }
    }
  }

  currentFrame() {
    return this.frames[Math.min(this.i, this.frames.length - 1)];
  }

  reset() {
    this.t = 0; this.i = 0; this.done = false;
  }
}

class Sprite {
  constructor(sheet) {
    this.sheet = sheet;
    this.x = 128;
    this.y = 180;
    this.z = 0;
    this.anchorX = 0.5;
    this.anchorY = 1.0;
    this.flipX = false;
    this.scale = 1; // stays integer by design
    this.shadow = true;

    this.anims = new Map();
    this.current = null;

    // For basic physics
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.speed = 45;   // pixels/sec at base res
    this.jumpV = -130; // jump velocity
    this.gravity = 340;
  }

  addAnim(name, anim) {
    this.anims.set(name, anim);
  }
  play(name, restartIfSame = false) {
    const a = this.anims.get(name);
    if (!a) return;
    if (this.current !== a || restartIfSame) a.reset();
    this.current = a;
  }

  update(dt, input) {
    if (this.current) this.current.update(dt);

    // Simple platformer physics with integer snapping in render step
    if (input.left)  { this.vx = -this.speed; this.flipX = true; }
    else if (input.right) { this.vx = this.speed; this.flipX = false; }
    else this.vx = 0;

    if (input.jump && this.onGround) {
      this.vy = this.jumpV;
      this.onGround = false;
    }

    // Attack animation takes priority while active
    if (input.attack && (!this.current || this.current.done || this.current === this.anims.get('idle') || this.current === this.anims.get('run'))) {
      this.play('attack', true);
    }

    // Integrate
    this.x += this.vx * dt;
    this.vy += this.gravity * dt;
    this.y += this.vy * dt;

    // Ground collision @ y = 180 (tweak for your ground)
    if (this.y >= 180) {
      this.y = 180;
      this.vy = 0;
      this.onGround = true;
    }

    // Animation state logic (skip if attack playing and not done)
    const attackActive = this.current === this.anims.get('attack') && !this.current.done;
    if (!attackActive) {
      if (!this.onGround) this.play('jump');
      else if (this.vx !== 0) this.play('run');
      else this.play('idle');
    }
  }

  draw(ctx) {
    if (!this.current) return;
    const frameIndex = this.current.currentFrame();
    const { sx, sy, sw, sh } = this.sheet.srcRect(frameIndex);

    const dw = this.sheet.fw * this.scale;
    const dh = this.sheet.fh * this.scale;

    // Optional drop shadow (helps ground contact readability)
    if (this.shadow) {
      const shw = ipx(dw * 0.6);
      const shh = ipx(dh * 0.15);
      const shx = ipx(this.x - shw / 2);
      const shy = ipx(this.y - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(shx, shy, shw, shh);
    }

    // Pixel-perfect draw:
    // - translate to integer pixel
    // - draw relative to anchor (also integer)
    const px = ipx(this.x);
    const py = ipx(this.y);

    ctx.save();
    ctx.translate(px, py);

    if (this.flipX) {
      ctx.scale(-1, 1);
    }

    const ax = ipx(-this.anchorX * dw);
    const ay = ipx(-this.anchorY * dh);

    // drawImage with integer dest coords to prevent subpixel sampling
    ctx.drawImage(
      this.sheet.img,
      sx, sy, sw, sh,
      ax, ay, dw, dh
    );

    ctx.restore();
  }
}

// ---------------------------------------------------------
// Input
// ---------------------------------------------------------
const input = { left: false, right: false, jump: false, attack: false, debug: false };
const down = new Set();

function handleKey(e, isDown) {
  const k = e.code;
  if (KEYS.LEFT.includes(k))  { input.left = isDown; e.preventDefault(); }
  if (KEYS.RIGHT.includes(k)) { input.right = isDown; e.preventDefault(); }
  if (KEYS.UP.includes(k))    { input.jump = isDown; e.preventDefault(); }
  if (KEYS.ATTACK.includes(k)){ input.attack = isDown; e.preventDefault(); }
  if (k === 'KeyD')           { input.debug = isDown; }
  if (isDown) down.add(k); else down.delete(k);
}
addEventListener('keydown', e => handleKey(e, true), { passive: false });
addEventListener('keyup',   e => handleKey(e, false), { passive: false });

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------
let bgImg = null;
let player = null;

async function boot() {
  // Load background (optional)
  try {
    bgImg = await loadFirstAvailableImage(ASSETS.background.candidates);
  } catch {
    bgImg = null; // fine: render solid background instead
  }

  // Load player sheet
  const sheetImg = await loadFirstAvailableImage(ASSETS.playerSheet.candidates);
  const sheet = new SpriteSheet(
    sheetImg,
    ASSETS.playerSheet.frameW,
    ASSETS.playerSheet.frameH,
    ASSETS.playerSheet.columns,
    ASSETS.playerSheet.margin,
    ASSETS.playerSheet.spacing
  );

  // Create player
  player = new Sprite(sheet);
  player.addAnim('idle',   new Animation(ANIMS.idle.frames,   ANIMS.idle.fps,   ANIMS.idle.loop));
  player.addAnim('run',    new Animation(ANIMS.run.frames,    ANIMS.run.fps,    ANIMS.run.loop));
  player.addAnim('jump',   new Animation(ANIMS.jump.frames,   ANIMS.jump.fps,   ANIMS.jump.loop));
  player.addAnim('attack', new Animation(ANIMS.attack.frames, ANIMS.attack.fps, ANIMS.attack.loop, ANIMS.attack.holdLast));
  player.play('idle', true);

  // Start loop
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

let lastTime = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000) || 0.0167;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  if (player) player.update(dt, input);
}

function render() {
  // Clear
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  // Background
  if (bgImg) {
    // Fill width, anchored bottom, with pixel-perfect tiling if needed
    const times = Math.ceil(BASE_W / bgImg.width);
    for (let i = 0; i < times; i++) {
      ctx.drawImage(bgImg, i * bgImg.width, ipx(BASE_H - bgImg.height));
    }
  } else {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  // Ground baseline (temporary)
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  // Player
  if (player) player.draw(ctx);

  // Debug overlays
  if (input.debug && player) {
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(ipx(player.x - 16), ipx(player.y - 32), 32, 32);
  }
}

// Kick it off
boot().catch(err => {
  console.error(err);
  // Fallback screen
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText('Failed to load assets. Open console for details.', 8, 16);
});
