// Canvas setup
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
function resize() { cvs.width = 800; cvs.height = 480; }
resize(); window.addEventListener('resize', resize);

// Title logic
let state = 'title';
const titleEl = document.getElementById('title');
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function start() {
  state = 'play';
  titleEl.style.display = 'none';
}

// Start game (keyboard + tap)
document.addEventListener('keydown', e => { if (state==='title' && e.key==='Enter') start(); });
document.addEventListener('click', () => { if (state==='title') start(); });

// --- ASSETS (all from /assets) ---
const img = {
  bg1: new Image(),
  bg2: new Image(),
  bg3: new Image(),
  player: new Image(),
  bandit: new Image(),
  ninja: new Image()
};
img.bg1.src   = 'assets/background1.png';
img.bg2.src   = 'assets/background2.png';
img.bg3.src   = 'assets/background3.png';
img.player.src= 'assets/spritesheet.png';      // 64x64 sprite frame (placeholder ok)
img.bandit.src= 'assets/enemy_bandit.png';     // 64x64
img.ninja.src = 'assets/enemy_ninja.png';      // 64x64

// Simple prototype player/enemy
const player = { x: 120, y: 360, w: 64, h: 64, vx: 0, speed: 4 };
const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup',   e => keys[e.key] = false);

const enemies = [];
function spawn() {
  const type = Math.random() < 0.5 ? 'bandit' : 'ninja';
  enemies.push({ type, x: cvs.width + 20, y: 360, w: 64, h: 64, vx: -2 - Math.random()*2 });
}
setInterval(()=> state==='play' && spawn(), 2000);

// Draw helpers
function drawBG() { ctx.drawImage(img.bg1, 0, 0, cvs.width, cvs.height); }
function drawPlayer() { ctx.drawImage(img.player, 0, 0, 64, 64, player.x, player.y, player.w, player.h); }
function drawEnemy(e) {
  const sprite = e.type === 'bandit' ? img.bandit : img.ninja;
  ctx.drawImage(sprite, 0, 0, 64, 64, e.x, e.y, e.w, e.h);
}

function update() {
  if (state !== 'play') return;

  // movement
  player.vx = (keys['ArrowRight'] ? player.speed : 0) + (keys['ArrowLeft'] ? -player.speed : 0);
  player.x += player.vx;
  player.x = Math.max(0, Math.min(cvs.width - player.w, player.x));

  // enemies
  for (let i=enemies.length-1;i>=0;i--) {
    const e = enemies[i];
    e.x += e.vx;
    if (e.x < -e.w) enemies.splice(i,1);
  }
}

function render() {
  ctx.clearRect(0,0,cvs.width,cvs.height);
  if (state === 'title') {
    drawBG();
    // Title text is in HTML overlay; nothing else needed here
    return;
  }
  drawBG();
  drawPlayer();
  enemies.forEach(drawEnemy);
}

function loop() { update(); render(); requestAnimationFrame(loop); }
loop();
