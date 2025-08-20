// --- Canvas: fit to screen with devicePixelRatio for crisp pixels ---
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

function fitCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = cvs.clientWidth;   // 100vw
  const cssH = cvs.clientHeight;  // 100vh
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

// --- Title screen start logic ---
const titleEl = document.getElementById('title');
document.getElementById('startBtn').addEventListener('click', start);
document.addEventListener('keydown', e => { if(e.key === 'Enter') start(); });

let state = 'title';
function start() {
  if (state !== 'title') return;
  state = 'play';
  titleEl.style.display = 'none';
  initGame();
}

// --- Touch controls emulate key presses ---
const keys = {}; // tracks virtual + physical keys
document.addEventListener('keydown', e => keys[e.code || e.key] = true);
document.addEventListener('keyup',   e => keys[e.code || e.key] = false);
for (const b of document.querySelectorAll('#touchControls .ctl')) {
  const code = b.dataset.key;
  const press   = e => { e.preventDefault(); keys[code] = true; };
  const release = e => { e.preventDefault(); keys[code] = false; };
  b.addEventListener('pointerdown', press,   { passive:false });
  b.addEventListener('pointerup',   release, { passive:false });
  b.addEventListener('pointercancel',release,{ passive:false });
  b.addEventListener('pointerleave', release,{ passive:false });
}

// --- EXPECTED ASSET PATHS (all under /assets, CASE-SENSITIVE) ---
const ASSET_PATHS = {
  bg1: 'assets/background1.png',
  bg2: 'assets/background2.png',
  bg3: 'assets/background3.png',
  player: 'assets/spritesheet.png',
  bandit: 'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png',
};

// resilient image loader: never rejects; records failures
async function loadImages(paths) {
  const loaded = {};
  const failures = [];

  await Promise.all(Object.entries(paths).map(([key, src]) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { loaded[key] = im; resolve(); };
    im.onerror = () => { failures.push(src); resolve(); };
    im.src = src + '?v=' + Date.now(); // cache-bust for Pages
  })));

  return { loaded, failures };
}

let img = {};
let missing = [];  // list of missing asset URLs
const player = { x: 120, y: 0, w: 64, h: 64, speed: 4, vy: 0, onGround: false };
const groundY = () => Math.floor(cvs.clientHeight - 72);

const enemies = [];
let spawnTimer = 0;

async function initGame() {
  const { loaded, failures } = await loadImages(ASSET_PATHS);
  img = loaded;
  missing = failures;      // show these on screen
  player.y = groundY();
  last = performance.now();
  requestAnimationFrame(loop);
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last)/1000);
  last = ts;
  update(dt);
  render();
  if (state === 'play') requestAnimationFrame(loop);
}

function update(dt) {
  // movement
  let move = 0;
  if (keys['ArrowRight']) move += 1;
  if (keys['ArrowLeft'])  move -= 1;
  player.x += move * player.speed;
  player.x = Math.max(0, Math.min(cvs.clientWidth - player.w, player.x));

  // jump
  if (keys['Space'] && player.onGround) {
    player.vy = -720;
    player.onGround = false;
  }

  // gravity
  const gY = groundY();
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= gY) { player.y = gY; player.vy = 0; player.onGround = true; }

  // spawn enemies
  spawnTimer += dt;
  if (spawnTimer > 2) { spawn(); spawnTimer = 0; }
  enemies.forEach(e => e.x += e.vx);
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x < -enemies[i].w) enemies.splice(i,1);
  }

  // attack (KeyA) – simple knockback
  if (keys['KeyA']) {
    enemies.forEach(e => {
      const hit = Math.abs((e.x + e.w/2) - (player.x + player.w/2)) < 60
               && Math.abs((e.y) - (player.y)) < 10;
      if (hit) e.x += 12;
    });
  }
}

function spawn() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  enemies.push({ type, x: cvs.clientWidth + 20, y: groundY(), w: 64, h: 64, vx: - (2 + Math.random()*2) });
}

function render() {
  // background (use bg1; fallback color if missing)
  if (img.bg1) ctx.drawImage(img.bg1, 0, 0, cvs.clientWidth, cvs.clientHeight);
  else { ctx.fillStyle = '#0a2150'; ctx.fillRect(0,0,cvs.clientWidth,cvs.clientHeight); }

  // subtle ground line
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, groundY()+64, cvs.clientWidth, 4);

  // player
  if (img.player) ctx.drawImage(img.player, 0, 0, 64, 64, player.x, player.y - player.h, player.w, player.h);
  else { ctx.fillStyle = '#10b981'; ctx.fillRect(player.x, player.y - player.h, player.w, player.h); }

  // enemies
  enemies.forEach(e => {
    const sprite = e.type === 'bandit' ? img.bandit : img.ninja;
    if (sprite) ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y - e.h, e.w, e.h);
    else { ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y - e.h, e.w, e.h); }
  });

  // show missing asset list (if any)
  if (missing.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, 8, 360, 24 + 16*missing.length);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '12px system-ui';
    ctx.fillText('Missing assets (check file paths/case):', 16, 28);
    missing.forEach((m, i) => ctx.fillText(m, 16, 48 + i*16));
  }
}
