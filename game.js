// game.js with animation system for Usagi
'use strict';

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

// Keys
const keys = {};
document.addEventListener('keydown', e => keys[e.code] = true);
document.addEventListener('keyup',   e => keys[e.code] = false);

// Assets
const ASSETS = {
  bg: 'assets/background1.png',
  player: 'assets/spritesheet.png',
  bandit: 'assets/enemy_bandit.png',
  ninja: 'assets/enemy_ninja.png'
};

let img = {};
function loadImages(map) {
  const out = {};
  return Promise.all(Object.entries(map).map(([k, src]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { out[k] = im; res(); };
    im.onerror = () => { console.warn("Missing:", src); res(); };
    im.src = src + '?v=' + Date.now();
  }))).then(() => out);
}

// Game objects
const player = {
  x: 120, y: 0, w: 64, h: 64, speed: 3, vy: 0, onGround: false,
  animRow: 0, animCol: 0, frameTimer: 0
};
const groundY = () => Math.floor(cvs.clientHeight - 72);

// Anim constants
const frameDuration = 0.15; // seconds per frame
const frameCount = 4; // columns per row

let enemies = [], spawnTimer = 0, scrollX = 0;
let last = 0;

async function init() {
  img = await loadImages(ASSETS);
  player.y = groundY();
  last = performance.now();
  requestAnimationFrame(loop);
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  let move = 0;
  if (keys['ArrowRight']) move = 1;
  if (keys['ArrowLeft']) move = -1;
  player.x += move * player.speed;

  // Jump
  if (keys['Space'] && player.onGround) {
    player.vy = -700;
    player.onGround = false;
  }
  // Gravity
  if (!player.onGround) player.vy += 2200 * dt;
  player.y += player.vy * dt;
  if (player.y >= groundY()) { player.y = groundY(); player.vy = 0; player.onGround = true; }

  // Animation row select
  if (!player.onGround) player.animRow = 2; // jump
  else if (keys['KeyA']) player.animRow = 3; // attack
  else if (move !== 0) player.animRow = 1; // walk
  else player.animRow = 0; // idle

  // Frame advance
  player.frameTimer += dt;
  if (player.frameTimer >= frameDuration) {
    player.animCol = (player.animCol + 1) % frameCount;
    player.frameTimer = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, cvs.clientWidth, cvs.clientHeight);
  if (img.bg) ctx.drawImage(img.bg, 0, 0, cvs.clientWidth, cvs.clientHeight);

  // Player
  if (img.player) {
    const sx = player.animCol * 64;
    const sy = player.animRow * 64;
    ctx.drawImage(img.player, sx, sy, 64, 64,
                  player.x, player.y - player.h, player.w, player.h);
  } else {
    ctx.fillStyle = 'red';
    ctx.fillRect(player.x, player.y - player.h, player.w, player.h);
  }
}

init();
