// game.js — robust start + mobile friendly + enemies + animation-ready
'use strict';

// ---------- DOM refs ----------
const titleEl   = document.getElementById('title');
const startBtn  = document.getElementById('startBtn');
const cvs       = document.getElementById('game');
const ctx       = cvs.getContext('2d');

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

// ---------- State ----------
let state = 'title';
let img = {};
const keys = {};
let last = 0;

// ---------- Key handling ----------
document.addEventListener('keydown', e => { keys[e.code || e.key] = true; if (state==='title' && e.key==='Enter') start(); });
document.addEventListener('keyup',   e => { keys[e.code || e.key] = false; });

// Touch controls (if present in HTML)
for (const b of document.querySelectorAll('#touchControls .ctl')) {
  const code = b.dataset.key;
  const press   = e => { e.preventDefault(); keys[code] = true;  };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
}

// ---------- Start wiring (multiple fallbacks) ----------
function armStartListeners() {
  // Button click
  if (startBtn) startBtn.addEventListener('click', start, { passive:true });

  // Tap anywhere on title overlay
  if (titleEl) {
    titleEl.addEventListener('click', start, { passive:true });
    titleEl.addEventListener('touchstart', (e)=>{ e.preventDefault(); start(); }, { passive:false });
  }

  // Tap canvas as fallback
  cvs.addEventListener('click', start, { passive:true });
  cvs.addEventListener('touchstart', (e)=>{ e.preventDefault(); start(); }, { passive:false });
}
armStartListeners();

// Only block page scrolling AFTER we start the game (avoids interfering with start tap)
function blockTouchScrolling() {
  ['touchmove','gesturestart'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive:false })
  );
}

// ---------- Assets ----------
const ASSETS = {
  bg1:   'assets/background1.png',
  player:'assets/spritesheet.png',       // 4x4 frames: idle, walk, jump, attack
  bandit:'assets/enemy_bandit.png',      // 64x64
  ninja: 'assets/enemy_ninja.png',       // 64x64
};

function loadImages(map) {
  const out = {};
  return Promise.all(Object.entries(map).map(([key, src]) => new Promise((res) => {
    const im = new Image();
    im.onload  = () => { out[key] = im; res(); };
    im.onerror = () => { console.warn('Failed to load', src); res(); };
    im.src = src + '?v=' + Date.now();
  }))).then(() => out);
}

// ---------- Game objects ----------
const player = {
  x: 120, y: 0, w: 64, h: 64,
  speed: 4, vy: 0, onGround: false,
  animRow: 0, animCol: 0, frameTimer: 0
};
const groundY = () => Math.floor(cvs.clientHeight - 72);

const frameDuration = 0.15; // sec per frame (4 cols each row)
const frameCount = 4;

const enemies = [];
let spawnTimer = 0;
let spawnEvery = 1.2;
let scrollX = 0;

// ---------- Start game ----------
async function start() {
  if (state !== 'title') return;
  state = 'play';

  // Hide title overlay
  if (titleEl) titleEl.style.display = 'none';

  // Now block page scrolling (after start gesture)
  blockTouchScrolling();

  // Load art
  img = await loadImages(ASSETS);

  // Init player position
  player.y = groundY();

  // Force a first enemy right away so you see one
  spawnEnemy();

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
  // Movement
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x + move * player.speed));

  // BG scroll
  scrollX += Math.max(0, move) * 80 * dt;

  // Jump
  if (keys['Space'] && player.onGround) { player.vy = -720; player.onGround = false; }

  // Gravity
  const gY = groundY();
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= gY) { player.y = gY; player.vy = 0; player.onGround = true; }

  // Animation state
  if (!player.onGround) player.animRow = 2;           // jump
  else if (keys['KeyA']) player.animRow = 3;          // attack
  else if (move !== 0)   player.animRow = 1;          // walk
  else                   player.animRow = 0;          // idle

  // Advance frame
  player.frameTimer += dt;
  if (player.frameTimer >= frameDuration) {
    player.animCol = (player.animCol + 1) % frameCount;
    player.frameTimer = 0;
  }

  // Enemies
  spawnTimer += dt;
  if (spawnTimer >= spawnEvery) { spawnEnemy(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w - 20) enemies.splice(i, 1);
  }

  // Attack (KeyA): simple KO/knockback
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const dx = Math.abs((e.x + e.w/2) - (player.x + player.w/2));
      const dy = Math.abs(e.y - player.y);
      if (!e.dead && dx < 60 && dy < 10) {
        e.hp -= 1;
        e.vx -= 1.1;
        if (e.hp <= 0) e.dead = true;
      }
    });
  }

  // Slide KOs off-screen
  enemies.forEach(e => { if (e.dead) e.x -= 3; });
}

// ---------- Enemies ----------
function spawnEnemy() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  const stats = type === 'bandit'
    ? { hp: 2, vx: -(2 + Math.random()*1.2) }
    : { hp: 3, vx: -(2.2 + Math.random()*1.5) };
  enemies.push({ type, x: cvs.clientWidth + 20, y: groundY(), w: 64, h: 64, ...stats, dead: false });
}

// ---------- Render ----------
function render() {
  // BG (tile horizontally)
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

  // Player (animated)
  if (img.player) {
    const sx = (player.animCol % 4) * 64;
    const sy = (player.animRow % 4) * 64;
    ctx.drawImage(img.player, sx, sy, 64, 64, player.x, player.y - player.h, player.w, player.h);
  } else {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(player.x, player.y - player.h, player.w, player.h);
  }

  // Enemies (sprite or bright fallback box)
  enemies.forEach(e => {
    const sprite = e.type === 'bandit' ? img.bandit : img.ninja;
    if (sprite && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y - e.h, e.w, e.h);
    } else {
      ctx.fillStyle = e.type === 'bandit' ? '#ff5252' : '#9b59b6';
      ctx.fillRect(e.x, e.y - e.h, e.w, e.h);
    }
  });
}
