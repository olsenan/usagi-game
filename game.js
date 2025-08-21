/* =========================================================
   Usagi (SNES-style) Pixel-Perfect Loop + Title & Touch UI
   - Integer scaling to base 256x224; smoothing disabled
   - Safe insets on sprites to prevent bleeding/halos
   - Robust asset preflight with on-screen report
   - Title screen restored; tap/Enter to start
   - Mobile touch buttons mapped to input
   - Fix: animation registration order (no null current)
   ========================================================= */

const BASE_W = 256;   // SNES-like internal resolution
const BASE_H = 224;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const titleOverlay = document.getElementById('title-overlay');
const errorOverlay = document.getElementById('error-overlay');
const errorLogEl = document.getElementById('error-log');
document.getElementById('error-close')?.addEventListener('click', () => {
  errorOverlay.classList.add('hidden');
});

canvas.width = BASE_W;
canvas.height = BASE_H;
ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingQuality = 'low';

function resizeCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth  / BASE_W,
    window.innerHeight / BASE_H
  )));
  canvas.style.width  = (BASE_W * scale) + 'px';
  canvas.style.height = (BASE_H * scale) + 'px';
  // match overlay and touch layer to canvas client rect
  const root = document.getElementById('game-root');
  root.style.width  = canvas.style.width;
  root.style.height = canvas.style.height;
}
addEventListener('resize', resizeCanvas);
resizeCanvas();

const ipx = n => Math.round(n);

// --------------------- Assets --------------------------
const ASSETS = {
  backgrounds: [
    'assets/background1.png',
    'assets/background2.png',
    'assets/background3.png',
    'assets/background_stage1.png',
    'assets/background_stage2.png',
    'assets/background_stage3.png'
  ],
  usagiSheets: [
    'assets/snes_usagi_sprite_sheet.png',        // 1024x1536 (64x64)
    'assets/usagi_snes_sheet.png',               // 1024x1536 (64x64)
    'assets/snes_usagi_sprite_sheet (1).png',    // 768x1152  (48x48)
    'assets/usagi_debug_sheet.png',              // 768x1152  (48x48)
    'assets/spritesheet.png'                     // 256x256   (32x32)
  ],
  enemySheet: 'assets/enemy_sprites.png',        // 128x64 (32x32)
  ui: {
    left:   'assets/ui_left.png',
    right:  'assets/ui_right.png',
    jump:   'assets/ui_jump.png',
    attack: 'assets/ui_attack.png'
  }
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + src));
    img.src = src;
  });
}

async function loadFirstAvailableImage(list, report) {
  let lastErr = null;
  for (const src of list) {
    try {
      const img = await loadImage(src);
      report.push(`OK   ${src}  (${img.width}x${img.height})`);
      return img;
    } catch (e) {
      report.push(`MISS ${src}`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('No candidate image could be loaded.');
}

function detectGrid(img) {
  const candidates = [64, 48, 32];
  for (const fw of candidates) {
    if (img.width % fw === 0 && img.height % fw === 0) {
      return { frameW: fw, frameH: fw, columns: img.width / fw, rows: img.height / fw, spacing: 0, margin: 0 };
    }
  }
  if (img.width % 16 === 0) {
    const fw = img.width / 16;
    if (img.height % fw === 0) return { frameW: fw, frameH: fw, columns: 16, rows: img.height / fw, spacing: 0, margin: 0 };
  }
  throw new Error(`Unable to detect grid for ${img.width}x${img.height}`);
}

// --------------------- Sprites -------------------------
class SpriteSheet {
  constructor(img, frameW, frameH, columns, margin = 0, spacing = 0) {
    this.img = img; this.fw = frameW; this.fh = frameH;
    this.cols = columns; this.margin = margin; this.spacing = spacing;
    this.safeInset = 0.01;
  }
  srcRect(index) {
    const m = this.margin, s = this.spacing, fw = this.fw, fh = this.fh;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    let sx = m + col * (fw + s);
    let sy = m + row * (fh + s);
    const inset = this.safeInset;
    sx += inset; sy += inset;
    return { sx, sy, sw: fw - inset * 2, sh: fh - inset * 2 };
  }
}
class Animation {
  constructor(frames, fps = 8, loop = true, holdLast = false) {
    this.frames = frames; this.fps = fps; this.loop = loop; this.holdLast = holdLast;
    this.t = 0; this.i = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const adv = Math.floor(this.t * this.fps);
    if (adv > 0) {
      this.t -= adv / this.fps;
      this.i += adv;
      if (this.i >= this.frames.length) {
        if (this.loop) this.i %= this.frames.length;
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
    this.x = 128; this.y = 180;
    this.anchorX = 0.5; this.anchorY = 1.0;
    this.flipX = false; this.scale = 1; this.shadow = true;

    this.vx = 0; this.vy = 0; this.onGround = true;
    this.speed = 45; this.jumpV = -130; this.gravity = 340;

    this.anims = new Map(); this.current = null;
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

    if (input.jump && this.onGround) { this.vy = this.jumpV; this.onGround = false; }

    if (input.attack && (!this.current || this.current.done ||
        this.current === this.anims.get('idle') || this.current === this.anims.get('run'))) {
      this.play('attack', true);
    }

    this.x += this.vx * dt; this.vy += this.gravity * dt; this.y += this.vy * dt;
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
    const { sx, sy, sw, sh } = this.sheet.srcRect(this.current.currentFrame());
    const dw = this.sheet.fw * this.scale;
    const dh = this.sheet.fh * this.scale;

    if (this.shadow) {
      const shw = ipx(dw * 0.6), shh = ipx(dh * 0.15);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ipx(this.x - shw / 2), ipx(this.y - 2), shw, shh);
    }

    ctx.save();
    ctx.translate(ipx(this.x), ipx(this.y));
    if (this.flipX) ctx.scale(-1, 1);
    ctx.drawImage(this.sheet.img, sx, sy, sw, sh, ipx(-this.anchorX * dw), ipx(-this.anchorY * dh), dw, dh);
    ctx.restore();
  }
}

// --------------------- Input ---------------------------
const input = { left: false, right: false, jump: false, attack: false, debug: false };
function handleKey(e, isDown) {
  const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA')  { input.left   = isDown; e.preventDefault(); }
  if (k === 'ArrowRight'|| k === 'KeyD')  { input.right  = isDown; e.preventDefault(); }
  if (k === 'ArrowUp'   || k === 'KeyW' || k === 'Space') { input.jump   = isDown; e.preventDefault(); }
  if (['KeyJ','KeyK','KeyF','KeyH','KeyZ','KeyX'].includes(k)) { input.attack = isDown; e.preventDefault(); }
  if (k === 'Enter' && isDown) startGame();
  if (k === 'Backquote') input.debug = isDown;
}
addEventListener('keydown', e => handleKey(e, true), { passive: false });
addEventListener('keyup',   e => handleKey(e, false), { passive: false });

// Touch buttons
function bindHold(btnId, setter) {
  const el = document.getElementById(btnId);
  if (!el) return;
  const on = e => { e.preventDefault(); setter(true); };
  const off = e => { e.preventDefault(); setter(false); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold('btn-left',   v => input.left   = v);
bindHold('btn-right',  v => input.right  = v);
bindHold('btn-jump',   v => input.jump   = v);
bindHold('btn-attack', v => input.attack = v);

// Also tap canvas to start from title
canvas.addEventListener('pointerdown', () => {
  if (GAME.state === 'title') startGame();
}, { passive: true });

// --------------------- Game State ----------------------
const GAME = {
  state: 'boot',        // 'boot' | 'title' | 'play'
  bgImg: null,
  player: null,
  enemy: null,
  assetReport: []
};

const ANIMS = {
  idle:   { frames: [0,1,2,3], fps: 6,  loop: true },
  run:    { frames: [8,9,10,11,12,13], fps: 10, loop: true },
  jump:   { frames: [16,17,18,19], fps: 8,  loop: false },
  attack: { frames: [24,25,26,27], fps: 12, loop: false, holdLast: true }
};

let lastTime = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000) || 0.0167;
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(frame);
}

// --------------------- Boot / Load ---------------------
async function boot() {
  try {
    // background
    try {
      GAME.bgImg = await loadFirstAvailableImage(ASSETS.backgrounds, GAME.assetReport);
    } catch {
      GAME.assetReport.push('No background loaded (using flat color).');
      GAME.bgImg = null;
    }

    // pick usagi sheet
    const usagiImg = await loadFirstAvailableImage(ASSETS.usagiSheets, GAME.assetReport);
    const grid = detectGrid(usagiImg);
    const sheet = new SpriteSheet(usagiImg, grid.frameW, grid.frameH, grid.columns, grid.margin, grid.spacing);

    const player = new Sprite(sheet);
    player.addAnim('idle',   new Animation(ANIMS.idle.frames,   ANIMS.idle.fps,   ANIMS.idle.loop));
    player.addAnim('run',    new Animation(ANIMS.run.frames,    ANIMS.run.fps,    ANIMS.run.loop));
    player.addAnim('jump',   new Animation(ANIMS.jump.frames,   ANIMS.jump.fps,   ANIMS.jump.loop));
    player.addAnim('attack', new Animation(ANIMS.attack.frames, ANIMS.attack.fps, ANIMS.attack.loop, ANIMS.attack.holdLast));
    player.play('idle', true);
    GAME.player = player;

    // enemy demo (register anim BEFORE play) – bug fixed here
    try {
      const eImg = await loadImage(ASSETS.enemySheet);
      GAME.assetReport.push(`OK   ${ASSETS.enemySheet} (${eImg.width}x${eImg.height})`);
      const eGrid = detectGrid(eImg);
      const eSheet = new SpriteSheet(eImg, eGrid.frameW, eGrid.frameH, eGrid.columns, eGrid.margin, eGrid.spacing);
      const enemy = new Sprite(eSheet);
      enemy.x = 200; enemy.y = 180;
      enemy.addAnim('idle', new Animation([0,1,2,3], 4, true)); // REGISTER FIRST
      enemy.play('idle', true);
      GAME.enemy = enemy;
    } catch (e) {
      GAME.assetReport.push(`MISS ${ASSETS.enemySheet}`);
    }

    // Show title after boot
    GAME.state = 'title';
    titleOverlay.classList.remove('hidden');
  } catch (e) {
    GAME.assetReport.push('Fatal load error: ' + e.message);
    errorLogEl.textContent = GAME.assetReport.join('\n');
    errorOverlay.classList.remove('hidden');
  }

  requestAnimationFrame(frame);
}

function startGame() {
  if (GAME.state !== 'play') {
    GAME.state = 'play';
    titleOverlay.classList.add('hidden');
  }
}

// --------------------- Update & Render -----------------
function update(dt) {
  if (GAME.state !== 'play') return;
  if (GAME.player) GAME.player.update(dt, input);
  if (GAME.enemy)  GAME.enemy.update(dt, { left:false,right:false,jump:false,attack:false });
}

function render() {
  // clear
  ctx.clearRect(0, 0, BASE_W, BASE_H);

  // background
  if (GAME.bgImg) {
    const tiles = Math.ceil(BASE_W / GAME.bgImg.width);
    for (let i = 0; i < tiles; i++) {
      ctx.drawImage(GAME.bgImg, i * GAME.bgImg.width, ipx(BASE_H - GAME.bgImg.height));
    }
  } else {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  // ground
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  // actors
  if (GAME.player) GAME.player.draw(ctx);
  if (GAME.enemy)  GAME.enemy.draw(ctx);

  // debug overlay
  if (input.debug) {
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(`State: ${GAME.state}`, 4, 12);
  }
}

// --------------------- Start ---------------------------
boot();
