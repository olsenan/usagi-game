// game.js — Phaser with mobile touch controls + asset logs + enemy spawn
'use strict';

// --- QUICK CONFIG: make sure these files exist (exact names) in /assets/ ---
// assets/background1.png
// assets/snes_usagi_spritesheet.png  (64x96 per frame; at least 5 frames in one row)
// assets/enemy_sprites.png           (2 columns x 1 row; 64x64 each: [0]=bandit, [1]=ninja)

if (!window.Phaser) {
  alert('Phaser not loaded — check the CDN <script> tag in index.html (must be before game.js).');
  throw new Error('Phaser not loaded');
}

const titleEl = document.getElementById('title');
const startBtn = document.getElementById('startBtn');
const ctlButtons = document.querySelectorAll('#touchControls .ctl');

// Touch state (mobile)
const touchState = { left:false, right:false, jump:false, attack:false };

// Wire up on-screen buttons to our touch state
ctlButtons.forEach(btn => {
  const key = btn.dataset.key; // "ArrowLeft", "ArrowRight", "Space", "KeyA"
  const press = e => { e.preventDefault(); if (key==='ArrowLeft') touchState.left=true;
                                      if (key==='ArrowRight') touchState.right=true;
                                      if (key==='Space') touchState.jump=true;
                                      if (key==='KeyA') touchState.attack=true; };
  const release = e => { e.preventDefault(); if (key==='ArrowLeft') touchState.left=false;
                                        if (key==='ArrowRight') touchState.right=false;
                                        if (key==='Space') touchState.jump=false;
                                        if (key==='KeyA') touchState.attack=false; };
  btn.addEventListener('pointerdown', press,   {passive:false});
  btn.addEventListener('pointerup',   release, {passive:false});
  btn.addEventListener('pointercancel',release,{passive:false});
  btn.addEventListener('pointerleave', release,{passive:false});
});

let game;
function boot() {
  if (game) return;
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
  startBtn.addEventListener('click', boot, {passive:true});
  startBtn.addEventListener('touchstart', e => { e.preventDefault(); boot(); }, {passive:false});
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') boot(); });

let player, cursors, enemies, logText;
let canAttack = true;

function preload() {
  // cache-bust to defeat mobile caches
  this.load.image('bg', 'assets/background1.png?v=' + Date.now());
  this.load.spritesheet('usagi', 'assets/snes_usagi_spritesheet.png?v=' + Date.now(), { frameWidth:64, frameHeight:96 });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png?v=' + Date.now(), { frameWidth:64, frameHeight:64 });

  // On-screen logger
  logText = this.add.text(8, 8, 'Loading…', { font:'12px monospace', color:'#ffffff' }).setScrollFactor(0).setDepth(9999);

  const log = (msg) => { if (logText) logText.text = (logText.text.split('\n').concat(msg)).slice(-8).join('\n'); };

  this.load.on('filecomplete', (key) => log('Loaded: ' + key));
  this.load.on('loaderror', (file) => log('LOAD ERROR: ' + (file?.src || 'unknown')));
  this.load.on('complete', () => log('All assets loaded'));
}

function create() {
  const w = this.scale.width, h = this.scale.height;

  // Background
  const bg = this.add.image(0, 0, 'bg').setOrigin(0);
  bg.setDisplaySize(w, h);

  // Player
  player = this.physics.add.sprite(100, h - 150, 'usagi').setCollideWorldBounds(true);

  // Animations (tune ranges to your sheet; these assume first 5 frames are general-purpose)
  this.anims.create({ key:'idle',   frames:this.anims.generateFrameNumbers('usagi', { start:0, end:1 }), frameRate:4,  repeat:-1 });
  this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi', { start:0, end:4 }), frameRate:10, repeat:-1 });
  this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi', { start:3, end:4 }), frameRate:14, repeat:0 });

  player.play('idle');

  // Keyboard input (works alongside touchState)
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.on('keydown-SPACE', () => tryAttack());
  this.input.keyboard.on('keyup-SPACE', () => {}); // noop; we gate with canAttack

  // Enemies
  enemies = this.physics.add.group();
  spawnEnemy(this); // one on start
  this.time.addEvent({ delay: 1800, loop: true, callback: () => spawnEnemy(this) });

  // Resize
  this.scale.on('resize', ({ width, height }) => {
    this.cameras.resize(width, height);
    bg.setDisplaySize(width, height);
  });

  // If enemy sheet missing, draw bright rects so you still "see enemies"
  // (Handled in update() render path below)
}

function update() {
  if (!player) return;

  // Combine keyboard + touch input
  const left   = cursors.left.isDown  || touchState.left;
  const right  = cursors.right.isDown || touchState.right;
  const jump   = cursors.up.isDown    || touchState.jump;
  const attack = touchState.attack; // (spacebar handled in keyboard listener)

  player.setVelocityX(0);

  if (left)  { player.setVelocityX(-180); player.flipX = true;  player.play('walk', true); }
  else if (right) { player.setVelocityX(180);  player.flipX = false; player.play('walk', true); }
  else { player.play('idle', true); }

  if (jump && player.body.touching.down) {
    player.setVelocityY(-420);
  }

  if (attack) tryAttack();

  // Simple enemy cleanup (when off-screen far left)
  enemies.children.iterate(e => {
    if (!e) return;
    if (e.x < -e.width) e.destroy();
  });
}

function tryAttack() {
  if (!canAttack) return;
  canAttack = false;
  player.play('attack', true);
  setTimeout(() => { canAttack = true; }, 250);

  // very simple hit check
  enemies.children.iterate(e => {
    if (!e) return;
    const dx = Math.abs((e.x) - (player.x));
    const dy = Math.abs((e.y) - (player.y));
    if (dx < 70 && dy < 40) {
      e.setVelocityX(-120); // knockback
      e.setTint(0xffaaaa);
      setTimeout(() => e?.clearTint(), 200);
    }
  });
}

function spawnEnemy(scene) {
  const w = scene.scale.width, h = scene.scale.height;
  const e = enemies.create(w + 32, h - 150, 'enemies');

  // If enemy sheet failed to load, draw a visible fallback rectangle
  if (!scene.textures.exists('enemies') || !scene.textures.get('enemies').key) {
    e.setActive(true).setVisible(true);
    const g = scene.add.graphics();
    g.fillStyle(0xff00ff, 1);
    g.fillRect(0, 0, 64, 64);
    const texKey = 'enemy_fallback_' + Phaser.Math.RND.uuid().slice(0,6);
    g.generateTexture(texKey, 64, 64);
    g.destroy();
    e.setTexture(texKey);
  }

  e.setVelocityX(-50 - Math.random()*40);
  e.setCollideWorldBounds(false);
}
