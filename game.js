// game.js — force spawn + mini HUD + strong fallbacks
'use strict';

// ---------- Canvas: fit to screen ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
function fitCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = cvs.clientWidth, cssH = cvs.clientHeight;
  cvs.width = Math.floor(cssW * dpr);
  cvs.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));
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

// ---------- Touch → key emulation ----------
const keys = {};
document.addEventListener('keydown', e => keys[e.code || e.key] = true);
document.addEventListener('keyup',   e => keys[e.code || e.key] = false);
const touchBtns = document.querySelectorAll('#touchControls .ctl');
touchBtns.forEach(b => {
  const code = b.dataset.key;
  const press   = e => { e.preventDefault(); keys[code] = true;  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
});

// ---------- Assets ----------
const ASSETS = {
  bg1:   'assets/background1.png',
  player:'assets/spritesheet.png',
  bandit:'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png',
};
function loadImages(map) {
  const out = {};
  return Promise.all(Object.entries(map).map(([k, src]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { out[k] = im; res(); };
    im.onerror = () => { console.warn('Failed to load image:', src); res(); };
    im.src = src + '?v=' + Date.now(); // cache-bust
  }))).then(() => out);
}

// ---------- Game state ----------
let img = {};
const player = { x: 120, y: 0, w: 64, h: 64, speed: 4, vy: 0, onGround: false };
const groundY = () => Math.floor(cvs.clientHeight - 72);
const enemies = [];
let spawnTimer = 0;           // time since last spawn
let spawnEvery = 0.8;         // seconds
let scrollX = 0;

async function initGame() {
  img = await loadImages(ASSETS);
  player.y = groundY();

  // Force an immediate enemy so you see one right away
  spawnEnemy();

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
  // Movement
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x + move * player.speed));

  // BG scroll when moving right
  scrollX += Math.max(0, move) * 80 * dt;

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

  // Spawning
  spawnTimer += dt;
  if (spawnTimer >= spawnEvery) { spawnEnemy(); spawnTimer = 0; }

  // Enemy movement & cleanup
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w - 20) enemies.splice(i, 1);
  }

  // Attack (KeyA) – simple knockback/KO
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const dx = Math.abs((e.x + e.w/2) - (player.x + player.w/2));
      const dy = Math.abs(e.y - player.y);
      if (!e.dead && dx < 60 && dy < 10) {
        e.hp -= 1;
        e.vx -= 1.2; // knockback
        if (e.hp <= 0) e.dead = true;
      }
    });
  }

  // Slide dead enemies off a bit faster
  enemies.forEach(e => { if (e.dead) e.x -= 3; });
}

function spawnEnemy() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  const stats = type === 'bandit' ? { hp: 2, vx: -(2 + Math.random()*1.2) }
                                  : { hp: 3, vx: -(2.2 + Math.random()*1.5) };
  enemies.push({ type, x: cvs.clientWidth + 20, y: groundY(), w: 64, h: 64, ...stats, dead: false });
}

function render() {
  // Background (tile horizontally)
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

  // Ground guide
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, groundY()+64, cvs.clientWidth, 4);

  // Player (first 64x64 cell)
  if (img.player) ctx.drawImage(img.player, 0, 0, 64, 64, player.x, player.y - player.h, player.w, player.h);
  else { ctx.fillStyle = '#10b981'; ctx.fillRect(player.x, player.y - player.h, player.w, player.h); }

  // Enemies (use sprite if loaded; else bright fallback box so you SEE them)
  enemies.forEach(e => {
    const sprite = e.type === 'bandit' ? img.bandit : img.ninja;
    if (sprite && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y - e.h, e.w, e.h);
    } else {
      ctx.fillStyle = e.type === 'bandit' ? '#ff5252' : '#9b59b6';
      ctx.fillRect(e.x, e.y - e.h, e.w, e.h);
    }
  });

  // Mini HUD (top-left)
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(8, 8, 200, 46);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui';
  ctx.fillText(`Enemies: ${enemies.length}`, 16, 24);
  const banditOk = img.bandit && img.bandit.naturalWidth > 0;
  const ninjaOk  = img.ninja  && img.ninja.naturalWidth  > 0;
  ctx.fillStyle = banditOk ? '#10b981' : '#ff6b6b';
  ctx.fillText(`bandit.png: ${banditOk ? 'OK' : 'missing'}`, 16, 38);
  ctx.fillStyle = ninjaOk ? '#10b981' : '#ff6b6b';
  ctx.fillText(`ninja.png:  ${ninjaOk ? 'OK' : 'missing'}`, 16, 52);
}
