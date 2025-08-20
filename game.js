// game.js — Usagi Yojimbo prototype (mobile friendly + touch controls + resilient loader)
'use strict';

// ---------- Canvas: fit to screen (no scrolling, crisp pixels) ----------
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

// Prevent accidental page scroll / zoom during touch controls
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

// ---------- Touch controls emulate keyboard ----------
const keys = {}; // unified key state (physical + virtual)
document.addEventListener('keydown', e => keys[e.code || e.key] = true);
document.addEventListener('keyup',   e => keys[e.code || e.key] = false);
for (const b of document.querySelectorAll('#touchControls .ctl')) {
  const code = b.dataset.key; // "ArrowLeft", "ArrowRight", "Space", "KeyA"
  const press   = e => { e.preventDefault(); keys[code] = true;  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
}

// ---------- Asset paths (CASE-SENSITIVE) ----------
const ASSET_PATHS = {
  bg1:   'assets/background1.png',
  bg2:   'assets/background2.png',
  bg3:   'assets/background3.png',
  player:'assets/spritesheet.png',
  bandit:'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png',
};

// Resilient loader: returns { loaded, missing }
async function loadImages(paths) {
  const loaded = {}, missing = [];
  await Promise.all(Object.entries(paths).map(([key, src]) => new Promise(res => {
    const im = new Image();
    im.onload  = () => { loaded[key] = im; res(); };
    im.onerror = () => { missing.push(src); res(); };
    // Cache-bust to avoid GitHub Pages serving old files
    im.src = src + '?v=' + Date.now();
  })));
  return { loaded, missing };
}

// ---------- Simple prototype gameplay ----------
let img = {};
let missing = []; // list of missing asset URLs (shown on screen)

const player = { x: 120, y: 0, w: 64, h: 64, speed: 4, vy: 0, onGround: false };
const groundY = () => Math.floor(cvs.clientHeight - 72);

const enemies = [];
let spawnTimer = 0;

async function initGame() {
  // Load art; continue even if some assets are missing
  const { loaded, missing: miss } = await loadImages(ASSET_PATHS);
  img = loaded; missing = miss;

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
  // Move left/right
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x += move * player.speed;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x));

  // Jump (Space)
  if (keys['Space'] && player.onGround) {
    player.vy = -720;              // jump impulse
    player.onGround = false;
  }

  // Gravity
  const gY = groundY();
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= gY) { player.y = gY; player.vy = 0; player.onGround = true; }

  // Spawn simple enemies
  spawnTimer += dt;
  if (spawnTimer > 2) { spawnEnemy(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w) enemies.splice(i, 1);
  }

  // Attack (KeyA) – quick knockback for now
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const dx = Math.abs((e.x + e.w/2) - (player.x + player.w/2));
      const dy = Math.abs(e.y - player.y);
      if (dx < 60 && dy < 10) e.x += 12;
    });
  }
}

function spawnEnemy() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  enemies.push({ type, x: cvs.clientWidth + 20, y: groundY(), w: 64, h: 64, vx: - (2 + Math.random()*2) });
}

function render() {
  // Background (use bg1 for now)
  if (img.bg1) ctx.drawImage(img.bg1, 0, 0, cvs.clientWidth, cvs.clientHeight);
  else { ctx.fillStyle = '#0a2150'; ctx.fillRect(0, 0, cvs.clientWidth, cvs.clientHeight); }

  // Subtle ground line
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, groundY()+64, cvs.clientWidth, 4);

  // Player
  if (img.player) ctx.drawImage(img.player, 0, 0, 64, 64, player.x, player.y - player.h, player.w, player.h);
  else { ctx.fillStyle = '#10b981'; ctx.fillRect(player.x, player.y - player.h, player.w, player.h); }

  // Enemies
  enemies.forEach(e => {
    const sprite = e.type === 'bandit' ? img.bandit : img.ninja;
    if (sprite) ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y - e.h, e.w, e.h);
    else { ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y - e.h, e.w, e.h); }
  });

  // On-screen diagnostics: list any missing asset paths
  if (missing.length) {
    const pad = 8, w = Math.min(480, cvs.clientWidth - 16), h = 28 + 16*missing.length;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(pad, pad, w, h);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '12px system-ui';
    ctx.fillText('Missing assets (check file names & paths):', pad+8, pad+20);
    missing.forEach((m, i) => ctx.fillText(m, pad+8, pad+40 + i*16));
  }
}
