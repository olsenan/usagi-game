/* =========================================================
   Usagi (SNES-style) Pixel-Perfect Loop w/ Sprite Fixes
   - Integer scaling to base 256x224
   - imageSmoothing disabled everywhere
   - SpriteSheet helper w/ safe insets to prevent bleeding
   - All draws snapped to integer pixels (no subpixel jitter)
   - Auto-detect frame size from your actual assets
   ========================================================= */

const BASE_W = 256;   // SNES-ish internal width
const BASE_H = 224;   // SNES-ish internal height

// ---- Assets in your repo (ordered by preference) ----
const ASSETS = {
  backgrounds: [
    'assets/background1.png',
    'assets/background2.png',
    'assets/background3.png',
    'assets/background_stage1.png',
    'assets/background_stage2.png',
    'assets/background_stage3.png'
  ],
  // Usagi sheets present in your repo (we'll auto-detect frame size):
  usagiSheets: [
    'assets/snes_usagi_sprite_sheet.png',         // 1024x1536 (64x64 grid)
    'assets/usagi_snes_sheet.png',                // 1024x1536 (duplicate alt)
    'assets/snes_usagi_sprite_sheet (1).png',     // 768x1152 (48x48 grid)
    'assets/usagi_debug_sheet.png',               // 768x1152 (48x48 grid)
    'assets/spritesheet.png'                      // 256x256 (32x32 grid)
  ],
  enemySheet: 'assets/enemy_sprites.png'          // 128x64 (32x32 grid)
};

// Simple animation definitions by frame index (we keep them generic;
// use your own mapping once you lock final sheet layout)
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
  ATTACK:['KeyJ', 'KeyK', 'KeyF', 'KeyH', 'KeyZ', 'KeyX'],
  DEBUG: ['Backquote']
};

// ---------------------------------------------------------
// Canvas + Context (pixel-perfect)
// ---------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

canvas.width = BASE_W;
canvas.height = BASE_H;

ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingQuality = 'low';

// Integer scaling to fit window while preserving aspect
function resizeCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth  / BASE_W,
    window.innerHeight / BASE_H
  )));
  canvas.style.width  = (BASE_W * scale) + 'px';
  canvas.style.height = (BASE_H * scale) + 'px';
}
addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------
function ipx(n) { return Math.round(n); } // snap to integer pixels

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + src));
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
  });
}

async function loadFirstAvailableImage(list) {
  let lastErr = null;
  for (const src of list) {
    try { return await loadImage(src); }
    catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('No candidate image could be loaded.');
}

// Infer frame size from known grids in your repo
function detectGrid(img) {
  // We know your sheets are one of these sizes:
  const candidates = [64, 48, 32];
  for (const fw of candidates) {
    if (img.width % fw === 0 && img.height % fw === 0) {
      const columns = img.width / fw;
      const rows = img.height / fw;
      return { frameW: fw, frameH: fw, columns, rows, spacing: 0, margin: 0 };
    }
  }
  // Fallback: try to keep 16 columns if possible
  if (img.width % 16 === 0) {
    const frameW = img.width / 16;
    const frameH = frameW;
    if (img.height % frameH === 0) {
      return { frameW, frameH, columns: 16, rows: img.height / frameH, spacing: 0, margin: 0 };
    }
  }
  throw new Error(`Unable to detect grid for ${img.width}x${img.height}`);
}

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
    this.safeInset = 0.01; // prevents bleeding from neighbors
  }
  srcRect(index) {
    const m = this.margin, s = this.spacing, fw = this.fw, fh = this.fh;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    let sx = m + col * (fw + s);
    let sy = m + row * (fh + s);
    const inset = this.safeInset;
    sx += inset; sy += inset;
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
        if (this.loop) this.i = this.i % this.frames.length;
        else { this.i = this.frames.length - 1; this.done = true; }
      }
    }
  }
  currentFrame() { return this.frames[Math.min(this.i, this.frames.length - 1)]; }
  reset() { this.t = 0; this.i = 0; this.done = false; }
}

class Sprite {
  constructor(sheet) {
    this.sheet = sheet;
    this.x = 128;
    this.y = 180;
    this.anchorX = 0.5;
    this.anchorY = 1.0;
    this.flipX = false;
    this.scale = 1;
    this.shadow = true;

    this.vx = 0; this.vy = 0; this.onGround = true;
    this.speed = 45;    // pixels/sec
    this.jumpV = -130;
    this.gravity = 340;

    this.anims = new Map();
    this.current = null;
  }

  addAnim(name, anim) { this.anims.set(name, anim); }
  play(name, restartIfSame = false) {
    const a = this.anims.get(name); if (!a) return;
    if (this.current !== a || restartIfSame) a.reset();
    this.current = a;
  }

  update(dt, input) {
    if (this.current) this.current.update(dt);

    if (input.left)  { this.vx = -this.speed; this.flipX = true; }
    else if (input.right) { this.vx = this.speed; this.flipX = false; }
    else this.vx = 0;

    if (input.jump && this.onGround) {
      this.vy = this.jumpV; this.onGround = false;
    }

    if (input.attack && (!this.current || this.current.done ||
        this.current === this.anims.get('idle') || this.current === this.anims.get('run'))) {
      this.play('attack', true);
    }

    this.x += this.vx * dt;
    this.vy += this.gravity * dt;
    this.y += this.vy * dt;

    if (this.y >= 180) { this.y = 180; this.vy = 0; this.onGround = true; }

    const attacking = this.current === this.anims.get('attack') && !this.current.done;
    if (!attacking) {
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

    if (this.shadow) {
      const shw = ipx(dw * 0.6);
      const shh = ipx(dh * 0.15);
      const shx = ipx(this.x - shw / 2);
      const shy = ipx(this.y - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(shx, shy, shw, shh);
    }

    const px = ipx(this.x);
    const py = ipx(this.y);

    ctx.save();
    ctx.translate(px, py);
    if (this.flipX) ctx.scale(-1, 1);

    const ax = ipx(-this.anchorX * dw);
    const ay = ipx(-this.anchorY * dh);

    ctx.drawImage(this.sheet.img, sx, sy, sw, sh, ax, ay, dw, dh);
    ctx.restore();
  }
}

// ---------------------------------------------------------
// Input
// ---------------------------------------------------------
const input = { left: false, right: false, jump: false, attack: false, debug: false };
function handleKey(e, isDown) {
  const k = e.code;
  if (KEYS.LEFT.includes(k))  { input.left = isDown; e.preventDefault(); }
  if (KEYS.RIGHT.includes(k)) { input.right = isDown; e.preventDefault(); }
  if (KEYS.UP.includes(k))    { input.jump = isDown; e.preventDefault(); }
  if (KEYS.ATTACK.includes(k)){ input.attack = isDown; e.preventDefault(); }
  if (KEYS.DEBUG.includes(k)) { input.debug = isDown; }
}
addEventListener('keydown', e => handleKey(e, true), { passive: false });
addEventListener('keyup',   e => handleKey(e, false), { passive: false });

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------
let bgImg = null;
let player = null;
let enemy = null;

async function boot() {
  // Background (first that loads)
  try { bgImg = await loadFirstAvailableImage(ASSETS.backgrounds); }
  catch { bgImg = null; }

  // Usagi sheet (choose first that loads, then detect grid)
  const usagiImg = await loadFirstAvailableImage(ASSETS.usagiSheets);
  const grid = detectGrid(usagiImg);
  const usagiSheet = new SpriteSheet(usagiImg, grid.frameW, grid.frameH, grid.columns, grid.margin, grid.spacing);

  player = new Sprite(usagiSheet);
  player.addAnim('idle',   new Animation(ANIMS.idle.frames,   ANIMS.idle.fps,   ANIMS.idle.loop));
  player.addAnim('run',    new Animation(ANIMS.run.frames,    ANIMS.run.fps,    ANIMS.run.loop));
  player.addAnim('jump',   new Animation(ANIMS.jump.frames,   ANIMS.jump.fps,   ANIMS.jump.loop));
  player.addAnim('attack', new Animation(ANIMS.attack.frames, ANIMS.attack.fps, ANIMS.attack.loop, ANIMS.attack.holdLast));
  player.play('idle', true);

  // Enemy demo (verifies slicing/bleed on another sheet)
  try {
    const eImg = await loadImage(ASSETS.enemySheet); // 128x64 -> 32x32
    const eGrid = detectGrid(eImg);
    const eSheet = new SpriteSheet(eImg, eGrid.frameW, eGrid.frameH, eGrid.columns, eGrid.margin, eGrid.spacing);
    enemy = new Sprite(eSheet);
    enemy.x = 200; enemy.y = 180; enemy.scale = 1; enemy.play('idle', true);
    // A super-simple idle loop using frames 0..3
    enemy.addAnim('idle', new Animation([0,1,2,3], 4, true));
  } catch {}

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
  if (enemy && input.debug) {
    // little bob to prove animation/draw is stable & bleed-free
    enemy.y = 180 + Math.sin(performance.now() * 0.003) * 2;
  }
}

function render() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  if (bgImg) {
    const tiles = Math.ceil(BASE_W / bgImg.width);
    for (let i = 0; i < tiles; i++) {
      ctx.drawImage(bgImg, i * bgImg.width, ipx(BASE_H - bgImg.height));
    }
  } else {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  // Ground baseline (temporary)
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  if (player) player.draw(ctx);
  if (enemy) enemy.draw(ctx);

  if (input.debug && player) {
    ctx.strokeStyle = '#00ffff';
    ctx.strokeRect(ipx(player.x - 16), ipx(player.y - 32), 32, 32);
  }
}

boot().catch(err => {
  console.error(err);
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText('Failed to load assets. Open console for details.', 8, 16);
});
