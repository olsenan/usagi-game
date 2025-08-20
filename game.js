// game.js — Phaser build with robust Start, asset logs, on-screen banners, and sanity sprite.
// Uses: assets/background1.png, assets/snes_usagi_spritesheet.png (64x96), assets/enemy_sprites.png (2x1 @ 64x64)

'use strict';

// 0) Phaser presence check (runs immediately)
if (!window.Phaser) {
  alert('Phaser not loaded — check the CDN <script> tag in index.html (must be before game.js).');
}

// ----- Title / Start wiring -----
const titleEl = document.getElementById('title');
const startBtn = document.getElementById('startBtn');

// Boot the Phaser game
let game;
function boot() {
  if (game) return; // prevent double boot
  const config = {
    type: Phaser.AUTO,
    parent: 'game',             // <div id="game"></div> in index.html
    width: window.innerWidth,
    height: window.innerHeight,
    physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
    scene: { preload, create, update }
  };
  game = new Phaser.Game(config);
  if (titleEl) titleEl.style.display = 'none';
}

// Arm start gestures (button, tap, Enter)
if (startBtn) {
  startBtn.addEventListener('click', boot, { passive: true });
  startBtn.addEventListener('touchstart', (e) => { e.preventDefault(); boot(); }, { passive: false });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') boot(); });

// ---------- Scene scope ----------
let player, cursors, enemies;

function preload() {
  // 1) Asset queue (with cache-buster to avoid stale Pages cache)
  this.load.image('bg', 'assets/background1.png?v=' + Date.now());
  this.load.spritesheet('usagi', 'assets/snes_usagi_spritesheet.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 96 });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 64 });

  // 2) On-screen banner helper
  const addBanner = (scene, text, color = '#ffffff') => {
    const t = scene.add.text(10, 10, text, { font: '14px monospace', color }).setScrollFactor(0);
    t.setDepth(9999);
    // stack multiple lines neatly
    const existing = scene._debugLines = scene._debugLines || [];
    t.y = 10 + existing.length * 18;
    existing.push(t);
  };

  // 3) Loader logs (console + on-screen)
  this.load.on('filecomplete', (key, type, data) => {
    console.log('Loaded:', key);
    if (key === 'usagi') addBanner(this, 'Loaded: usagi ✅', '#00ff88');
    if (key === 'enemies') addBanner(this, 'Loaded: enemies ✅', '#00ff88');
    if (key === 'bg') addBanner(this, 'Loaded: background ✅', '#00ff88');
  });
  this.load.on('loaderror', (file) => {
    const src = file && file.src ? file.src : '(unknown)';
    console.error('LOAD ERROR:', src, file);
    addBanner(this, 'LOAD ERROR: ' + src, '#ff6666');
  });
  this.load.on('complete', () => {
    console.log('All assets loaded.');
    addBanner(this, 'All assets loaded', '#ccccff');
  });
}

function create() {
  const w = this.scale.width;
  const h = this.scale.height;

  // Background full screen
  const bg = this.add.image(0, 0, 'bg').setOrigin(0);
  bg.setDisplaySize(w, h);

  // Player
  player = this.physics.add.sprite(100, h - 150, 'usagi').setCollideWorldBounds(true);

  // Animations (adjust frame ranges if your sheet differs)
  this.anims.create({ key: 'idle',   frames: this.anims.generateFrameNumbers('usagi', { start: 0, end: 1 }), frameRate: 4,  repeat: -1 });
  this.anims.create({ key: 'walk',   frames: this.anims.generateFrameNumbers('usagi', { start: 0, end: 4 }), frameRate: 10, repeat: -1 });
  this.anims.create({ key: 'attack', frames: this.anims.generateFrameNumbers('usagi', { start: 3, end: 4 }), frameRate: 14, repeat: 0 });

  player.play('idle');

  // Sanity sprite draw (top-left) — proves texture exists
  try {
    const sanity = this.add.sprite(60, 80, 'usagi', 0).setScrollFactor(0);
    sanity.setScale(1);
  } catch (e) {
    console.warn('Usagi texture not available at create():', e);
  }

  // Input
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.on('keydown-SPACE', () => player.play('attack', true));

  // Enemies
  enemies = this.physics.add.group();
  spawnEnemy(this);
  this.time.addEvent({ delay: 2000, loop: true, callback: () => spawnEnemy(this) });

  // Resize handler (keeps bg scaled)
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.scale.resize(width, height);
    bg.setDisplaySize(width, height);
  });
}

function update() {
  if (!player) return;

  player.setVelocityX(0);

  if (cursors.left.isDown) {
    player.setVelocityX(-180);
    player.flipX = true;
    player.play('walk', true);
  } else if (cursors.right.isDown) {
    player.setVelocityX(180);
    player.flipX = false;
    player.play('walk', true);
  } else {
    player.play('idle', true);
  }

  if (cursors.up.isDown && player.body.touching.down) {
    player.setVelocityY(-420);
  }
}

function spawnEnemy(scene) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const e = enemies.create(w - 50, h - 150, 'enemies');
  e.setVelocityX(-50);
}
