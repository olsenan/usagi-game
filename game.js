// game.js — diagnostic build (verifies assets + mobile controls)
'use strict';

// ---------- Canvas: fit to screen ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

function fitCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = cvs.clientWidth;
  const cssH = cvs.clientHeight;
  cvs.width  = Math.floor(cssW * dpr);
  cvs.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));

// Prevent touch scroll/zoom
['touchmove','gesturestart'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive:false })
);

// ---------- Title ----------
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

// ---------- Touch controls ----------
const keys = {};
document.addEventListener('keydown', e => keys[e.code || e.key] = true);
document.addEventListener('keyup',   e => keys[e.code || e.key] = false);
for (const b of document.querySelectorAll('#touchControls .ctl')) {
  const code = b.dataset.key;
  const press   = e => { e.preventDefault(); keys[code] = true;  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
}

// ---------- Expected asset paths (CASE-SENSITIVE) ----------
const ASSET_PATHS = {
  bg1:   'assets/background1.png',
  bg2:   'assets/background2.png',
  bg3:   'assets/background3.png',
  player:'assets/spritesheet.png',
  bandit:'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png',
};

// ---------- Diagnostic loader ----------
async function verifyUrl(url) {
  try {
    // HEAD often works, but some CDNs block it; fall back to GET if needed
    let r = await fetch(url + '?v=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
    if (!r.ok || (r.status >= 400)) {
      r = await fetch(url + '?v=' + Date.now(), { method: 'GET', cache: 'no-store' });
    }
    return r.ok;
  } catch {
    return false;
  }
}

async function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => (im.naturalWidth > 0 ? res(im) : rej(new Error('0 size')));
    im.onerror = rej;
    im.src = url + '?v=' + Date.now(); // cache-bust
  });
}

async function loadAssets(paths) {
  const report = {}; // key -> {url, fetchOk, imgOk}
  const images = {};
  const failures = [];

  for (const [key, url] of Object.entries(paths)) {
    const entry = { url, fetchOk: false, imgOk: false };
    report[key] = entry;

    entry.fetchOk = await verifyUrl(url);
    if (entry.fetchOk) {
      try {
        images[key] = await loadImage(url);
        entry.imgOk = true;
      } catch {
        failures.push(url);
      }
    } else {
      failures.push(url);
    }
  }

  return { images, failures, report };
}

// ---------- Game state ----------
let img = {};
let missing = [];
let diagReport = {};
const player = { x: 120, y: 0, w: 64, h: 64, speed: 4, vy: 0, onGround: false };
const groundY = () => Math.floor(cvs.clientHeight - 72);
const enemies = [];
let spawnTimer = 0;

async function initGame() {
  const { images, failures, report } = await loadAssets(ASSET_PATHS);
  img = images;
  missing = failures;
  diagReport = report;

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
  // Move
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x += move * player.speed;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x));

  // Jump
  if (keys['Space'] && player.onGround) {
    player.vy = -720;
    player.onGround = false;
  }

  // Gravity
  const gY = groundY();
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= gY) { player.y = gY; player.vy = 0; player.onGround = true; }

  // Enemies
  spawnTimer += dt;
  if (spawnTimer > 2) { spawnEnemy(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w) enemies.splice(i, 1);
  }

  // Attack (KeyA)
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
  // Background
  if (img.bg1) ctx.drawImage(img.bg1, 0, 0, cvs.clientWidth, cvs.clientHeight);
  else { ctx.fillStyle = '#0a2150'; ctx.fillRect(0, 0, cvs.clientWidth, cvs.clientHeight); }

  // Ground guide
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

  // Diagnostic panel (always visible for now)
  drawDiagnostics();
}

function drawDiagnostics() {
  const pad = 8;
  const keys = Object.keys(ASSET_PATHS);
  const h = 28 + 18 * keys.length;
  const w = Math.min(520, cvs.clientWidth - 16);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(pad, pad, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui';
  ctx.fillText('Asset check (fetch + image decode):', pad + 8, pad + 20);

  keys.forEach((k, i) => {
    const r = diagReport[k] || {};
    const y = pad + 40 + i * 18;
    const status = r.imgOk ? 'OK' : (r.fetchOk ? 'Decode FAILED' : 'Fetch FAILED');
    ctx.fillStyle = r.imgOk ? '#10b981' : r.fetchOk ? '#f59e0b' : '#ef4444';
    ctx.fillText(`${k} → ${r.url} [${status}]`, pad + 8, y);
  });
}
