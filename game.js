// game.js — single enemy sheet (bandit + ninja), mobile friendly
'use strict';

// ---------- DOM refs ----------
const titleEl  = document.getElementById('title');
const startBtn = document.getElementById('startBtn');
const cvs      = document.getElementById('game');
const ctx      = cvs.getContext('2d');

// ---------- Canvas fit ----------
function fitCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = cvs.clientWidth, cssH = cvs.clientHeight;
  cvs.width  = Math.floor(cssW * dpr);
  cvs.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));

// ---------- Keys & touch ----------
const keys = {};
document.addEventListener('keydown', e => { keys[e.code || e.key] = true; if (state==='title' && (e.key==='Enter' || e.code==='Enter')) start(); });
document.addEventListener('keyup',   e => { keys[e.code || e.key] = false; });

for (const b of document.querySelectorAll('#touchControls .ctl')) {
  const code = b.dataset.key;
  const down = e => { e.preventDefault(); keys[code] = true;  };
  const up   = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', down, { passive:false });
  b.addEventListener('pointerup',   up,   { passive:false });
  b.addEventListener('pointercancel',up,  { passive:false });
  b.addEventListener('pointerleave', up,  { passive:false });
}

// ---------- Game state ----------
let state = 'title';
let img = {};            // loaded images
let last = 0;

// ---------- Start handlers ----------
if (startBtn) startBtn.addEventListener('click', start, { passive:true });
if (titleEl) {
  titleEl.addEventListener('click', start, { passive:true });
  titleEl.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive:false });
}
cvs.addEventListener('click', start, { passive:true });
cvs.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive:false });

function blockTouchScrolling() {
  ['touchmove','gesturestart'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive:false })
  );
}

// ---------- Assets ----------
const ASSETS = {
  bg1:   'assets/background1.png',
  player:'assets/spritesheet.png',      // 4x4 (idle, walk, jump, attack)
  enemies:'assets/enemy_sprites.png',   // 2x1: bandit (left), ninja (right), 64x64 each
};

function loadImages(map) {
  const out = {};
  return Promise.all(Object.entries(map).map(([k, src]) => new Promise(res => {
    const im = new Image();
    im.onload  = () => { out[k] = im; res(); };
    im.onerror = () => { console.warn('Failed to load', src); res(); };
    im.src = src + '?v=' + Date.now(); // cache-bust Pages
  }))).then(() => out);
}

// Enemy sheet slicing info (auto-computed once loaded)
let ENEMY_COLS = 2; // expected columns
const ENEMY_SIZE = 64;

// ---------- Objects ----------
const player = { x:120, y:0, w:64, h:64, speed:4, vy:0, onGround:false,
  animRow:0, animCol:0, frameTimer:0 };
const frameDuration = 0.15, frameCols = 4;
const groundY = () => Math.floor(cvs.clientHeight - 72);

const enemies = [];
let spawnTimer = 0, spawnEvery = 1.1;
let scrollX = 0;

// ---------- Start ----------
async function start() {
  if (state !== 'title') return;
  state = 'play';
  if (titleEl) titleEl.style.display = 'none';
  blockTouchScrolling();

  img = await loadImages(ASSETS);

  // compute columns in enemy sheet in case the sheet width changes
  if (img.enemies && img.enemies.naturalWidth >= ENEMY_SIZE) {
    ENEMY_COLS = Math.max(1, Math.floor(img.enemies.naturalWidth / ENEMY_SIZE));
  }

  player.y = groundY();
  spawnEnemy(); // show one instantly
  last = performance.now();
  requestAnimationFrame(loop);
}

// ---------- Loop ----------
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render();
  if (state === 'play') requestAnimationFrame(loop);
}

// ---------- Update ----------
function update(dt) {
  // move
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x + move*player.speed));
  scrollX += Math.max(0, move) * 80 * dt;

  // jump
  if (keys['Space'] && player.onGround) { player.vy = -720; player.onGround = false; }
  if (!player.onGround) player.vy += 2200*dt;
  player.y += player.vy*dt;
  if (player.y >= groundY()) { player.y = groundY(); player.vy = 0; player.onGround = true; }

  // player anim row
  if (!player.onGround) player.animRow = 2;
  else if (keys['KeyA']) player.animRow = 3;
  else if (move !== 0)   player.animRow = 1;
  else                   player.animRow = 0;

  // frame advance
  player.frameTimer += dt;
  if (player.frameTimer >= frameDuration) {
    player.animCol = (player.animCol + 1) % frameCols;
    player.frameTimer = 0;
  }

  // enemies
  spawnTimer += dt;
  if (spawnTimer >= spawnEvery) { spawnEnemy(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i=enemies.length-1;i>=0;i--) if (enemies[i].x < -enemies[i].w - 20) enemies.splice(i,1);

  // attack
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const dx = Math.abs((e.x+e.w/2)-(player.x+player.w/2));
      const dy = Math.abs(e.y - player.y);
      if (!e.dead && dx < 60 && dy < 10) {
        e.hp -= 1; e.vx -= 1.0;
        if (e.hp <= 0) e.dead = true;
      }
    });
  }
  enemies.forEach(e => { if (e.dead) e.x -= 3; });
}

// Spawn bandit/ninja — both from the same sheet
function spawnEnemy() {
  const typeIndex = Math.random() < 0.5 ? 0 : 1; // 0=bandit, 1=ninja (columns)
  const type = typeIndex === 0 ? 'bandit' : 'ninja';
  const stats = type === 'bandit'
    ? { hp: 2, vx: -(2 + Math.random()*1.2) }
    : { hp: 3, vx: -(2.2 + Math.random()*1.5) };
  enemies.push({
    type, typeIndex,
    x: cvs.clientWidth + 20, y: groundY(),
    w: 64, h: 64, ...stats, dead:false
  });
}

// ---------- Render ----------
function render() {
  // BG tile
  if (img.bg1) {
    const iw = img.bg1.width, ih = img.bg1.height;
    const scaleY = cvs.clientHeight / ih;
    const drawW  = iw * scaleY;
    let x = - (scrollX % drawW);
    while (x < cvs.clientWidth) { ctx.drawImage(img.bg1, x, 0, drawW, cvs.clientHeight); x += drawW; }
  } else {
    ctx.fillStyle = '#0a2150'; ctx.fillRect(0,0,cvs.clientWidth,cvs.clientHeight);
  }

  // ground guide
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, groundY()+64, cvs.clientWidth, 4);

  // Player (animated 4x4)
  if (img.player) {
    const sx = (player.animCol % 4) * 64;
    const sy = (player.animRow % 4) * 64;
    ctx.drawImage(img.player, sx, sy, 64,64, player.x, player.y-player.h, player.w, player.h);
  } else {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(player.x, player.y-player.h, player.w, player.h);
  }

  // Enemies (slice from single sheet)
  enemies.forEach(e => {
    if (img.enemies && img.enemies.naturalWidth > 0) {
      // Compute source X by column (0 = bandit, 1 = ninja)
      const col = Math.min(ENEMY_COLS-1, e.typeIndex);
      const sx = col * ENEMY_SIZE;
      const sy = 0; // one-row sheet
      ctx.drawImage(img.enemies, sx, sy, ENEMY_SIZE, ENEMY_SIZE, e.x, e.y - e.h, e.w, e.h);
    } else {
      // Bright fallback if sheet didn't load
      ctx.fillStyle = e.type === 'bandit' ? '#ff5252' : '#9b59b6';
      ctx.fillRect(e.x, e.y - e.h, e.w, e.h);
    }
  });
}
