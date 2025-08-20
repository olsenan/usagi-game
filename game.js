// game.js — Phaser build with robust start + visible load logs + error overlay
'use strict';

// If Phaser script failed to load, tell us immediately
if (!window.Phaser) {
  if (window._status) _status.show('Phaser not loaded — check CDN <script> tag in index.html');
  throw new Error('Phaser not loaded');
}

const titleEl = document.getElementById('title');
const startBtn = document.getElementById('startBtn');

let game;

function boot() {
  if (game) return; // no double boot
  const config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: window.innerWidth,
    height: window.innerHeight,
    physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
    scene: { preload, create, update }
  };
  game = new Phaser.Game(config);
  if (titleEl) titleEl.style.display = 'none';
}
if (startBtn) {
  startBtn.addEventListener('click', boot, { passive:true });
  startBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); boot(); }, { passive:false });
}
document.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') boot(); });

// ---------- Scene ----------
let player, cursors, enemies;

function preload() {
  // cache-bust to avoid stale phone cache
  this.load.image('bg', 'assets/background1.png?v=' + Date.now());
  this.load.spritesheet('usagi', 'assets/snes_usagi_spritesheet.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 96 });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 64 });

  const banner = (txt, ok) => window._status && _status.show((ok?'✅ ':'❌ ') + txt);

  this.load.on('filecomplete', (key) => {
    if (key === 'bg')     banner('Loaded: background', true);
    if (key === 'usagi')  banner('Loaded: usagi', true);
    if (key === 'enemies')banner('Loaded: enemies', true);
  });
  this.load.on('loaderror', (file) => {
    const src = file && file.src ? file.src : '(unknown)';
    banner('LOAD ERROR: ' + src, false);
    console.error('LOAD ERROR:', src, file);
  });
  this.load.on('complete', () => banner('All assets loaded', true));
}

function create() {
  const w = this.scale.width, h = this.scale.height;

  const bg = this.add.image(0, 0, 'bg').setOrigin(0);
  bg.setDisplaySize(w, h);

  player = this.physics.add.sprite(100, h - 150, 'usagi').setCollideWorldBounds(true);

  // Animations — adjust ranges if you later add more frames
  this.anims.create({ key: 'idle',   frames: this.anims.generateFrameNumbers('usagi', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
  this.anims.create({ key: 'walk',   frames: this.anims.generateFrameNumbers('usagi', { start: 0, end: 4 }), frameRate: 10, repeat: -1 });
  this.anims.create({ key: 'attack', frames: this.anims.generateFrameNumbers('usagi', { start: 3, end: 4 }), frameRate: 14, repeat: 0 });

  // Tiny sanity sprite so we can *see* if the sheet is available
  try { this.add.sprite(60, 80, 'usagi', 0).setScrollFactor(0); } catch(e) {}

  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.on('keydown-SPACE', () => player.play('attack', true));

  enemies = this.physics.add.group();
  spawnEnemy(this);
  this.time.addEvent({ delay: 2000, loop: true, callback: () => spawnEnemy(this) });

  this.scale.on('resize', ({ width, height }) => {
    this.cameras.resize(width, height);
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
  const w = scene.scale.width, h = scene.scale.height;
  const e = enemies.create(w - 50, h - 150, 'enemies');
  e.setVelocityX(-50);
}
