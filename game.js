// game.js — clean prototype (mobile friendly + touch controls)
'use strict';

// ---------- Canvas: fit to screen (crisp pixels, no scrolling) ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

function fitCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = cvs.clientWidth;   // 100vw from CSS
  const cssH = cvs.clientHeight;  // 100vh from CSS
  cvs.width  = Math.floor(cssW * dpr);
  cvs.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
fitCanvas();
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));

// Prevent accidental page scroll/zoom during play
['touchmove','gesturestart'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive:false })
);

// ---------- Title screen ----------
const titleEl = document.getElementById('title');
document.getElementById('startBtn').addEventListener('click', start);
document.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });

let state = 'title';
function start() {
  if (state !== 'title') return;
  state = 'play';
  titleEl.style.display = 'none';
  initGame();
}

// ---------- Touch controls -> key emulation ----------
const keys = {}; // unified key state (physical + virtual)
document.addEventListener('keydown', e => keys[e.code || e.key] = true);
document.addEventListener('keyup',   e => keys[e.code || e.key] = false);

// If touch controls exist, wire them up
const touchBtns = document.querySelectorAll('#touchControls .ctl');
touchBtns.forEach(b => {
  const code = b.dataset.key; // "ArrowLeft", "ArrowRight", "Space", "KeyA"
  const press   = e => { e.preventDefault(); keys[code] = true;  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
});

// ---------- Assets (CASE-SENSITIVE paths) ----------
const ASSETS = {
  bg1:   'assets/background1.png',
  bg2:   'assets/background2.png', // not used yet (future stages)
  bg3:   'assets/background3.png', // not used yet (future stages)
  player:'assets/spritesheet.png',
  bandit:'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png',
};

function loadImages(map) {
  const out = {};
  return Promise.all(Object.entries(map).map(([key, src]) => new Promise((res) => {
    const im = new Image();
    im.onload  = () => { out[key] = im; res(); };
    im.onerror = () => { console.warn('Failed to load', src); res(); };
    // Cache-bust to avoid stale GitHub Pages assets
    im.src = src + '?v=' + Date.now();
  }))).then(() => out);
}

// ---------- Game state ----------
let img = {};
const player = { x: 120, y: 0, w: 64, h: 64, speed: 4, vy: 0, onGround: false };
const groundY = () => Math.floor(cvs.clientHeight - 72);
const enemies = [];
let spawnTimer = 0;
let scrollX = 0; // background scroll

async function initGame() {
  img = await loadImages(ASSETS);
  player.y = groundY();
  last = performance.now();
  requestAnimationFrame(loop);
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;

  update(dt);
  render();

  if (state === 'play') requestAnimationFrame(loop);
}

function update(dt) {
  // Horizontal movement
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;

  player.x += move * player.speed;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x));

  // Simple background scroll when moving right
  scrollX += Math.max(0, move) * 80 * dt;

  // Jump (Space)
  if (keys['Space'] && player.onGround) {
    player.vy = -720;
    player.onGround = false;
  }

  // Gravity
  const gY = groundY();
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= gY) { player.y = gY; player.vy = 0; player.onGround = true; }

  // Enemy spawn + movement
  spawnTimer += dt;
  if (spawnTimer > 2) { spawnEnemy(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w) enemies.splice(i, 1);
  }

  // Attack (KeyA) – simple knockback/K.O.
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const dx = Math.abs((e.x + e.w/2) - (player.x + player.w/2));
      const dy = Math.abs(e.y - player.y);
      if (!e.dead && dx < 60 && dy < 10) {
        e.hp -= 1;
        e.vx -= 1; // knockback
        if (e.hp <= 0) e.dead = true;
      }
    });
  }

  // Remove dead enemies after they slide off a bit
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) e.x += -4;
    if (e.dead && e.x < -e.w - 40) enemies.splice(i, 1);
  }
}

function spawnEnemy() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  const stats = type === 'bandit' ? { hp: 2, vx: -(2 + Math.random()*1.5) }
                                  : { hp: 3, vx: -(2.5 + Math.random()*1.8) };
  enemies.push({ type, x: cvs.clientWidth + 20, y: groundY(), w: 64, h: 64, ...stats, dead: false });
}

function render() {
  // Background (tile horizontally for a simple scrolling feel)
  if (img.bg1) {
    const iw = img.bg1.width, ih = img.bg1.height;
    const scaleY = cvs.clientHeight / ih;
    const drawW = iw * scaleY;
    let x = - (scrollX % drawW);
    while (x < cvs.clientWidth) {
      ctx.drawImage(img.bg1, x, 0, drawW, cvs.clientHeight);
      x += drawW;
    }
  } else {
    ctx.fillStyle = '#0a2150';
    ctx.fillRect(0, 0, cvs.clientWidth, cvs.clientHeight);
  }

  // Subtle ground line
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, groundY()+64, cvs.clientWidth, 4);

  // Player
  if (img.player) {
    // Using first 64x64 cell; swap to animated frames later
    ctx.drawImage(img.player, 0, 0, 64, 64, player.x, player.y - player.h, player.w, player.h);
  } else {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(player.x, player.y - player.h, player.w, player.h);
  }

  // Enemies
  enemies.forEach(e => {
    let sprite = e.type === 'bandit' ? img.bandit : img.ninja;
    if (sprite) ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y - e.h, e.w, e.h);
    else { ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y - e.h, e.w, e.h); }
  });
}
