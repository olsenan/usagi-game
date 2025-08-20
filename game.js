// game.js — Ultra-safe Phaser boot with mobile controls + on-screen logs
'use strict';

// ----- helpers -----
const log = (m) => { try { window._status && _status.show(m); } catch(_) {} console.log(m); };

// 0) Basic DOM refs (guarded)
const titleEl  = document.getElementById('title');
const startBtn = document.getElementById('startBtn');
const ctlBtns  = document.querySelectorAll('#touchControls .ctl');
const gameParentId = 'game';

// 1) Quick sanity checks (don’t throw; just log)
if (!document.getElementById(gameParentId)) {
  log(`JS WARN: Missing <div id="${gameParentId}"></div> container. Phaser will fail to mount.`);
}
if (!window.Phaser) {
  log('JS ERROR: Phaser not loaded — check the CDN <script> tag before game.js.');
}

// 2) Touch state + wiring (guard if no controls exist)
const touch = { left:false, right:false, jump:false, attack:false };
if (ctlBtns && ctlBtns.forEach) {
  ctlBtns.forEach(btn => {
    const key = btn.dataset.key;
    const down = e => { e.preventDefault();
      if (key==='ArrowLeft')  touch.left  = true;
      if (key==='ArrowRight') touch.right = true;
      if (key==='Space')      touch.jump  = true;
      if (key==='KeyA')       touch.attack= true;
    };
    const up = e => { e.preventDefault();
      if (key==='ArrowLeft')  touch.left  = false;
      if (key==='ArrowRight') touch.right = false;
      if (key==='Space')      touch.jump  = false;
      if (key==='KeyA')       touch.attack= false;
    };
    btn.addEventListener('pointerdown', down, {passive:false});
    btn.addEventListener('pointerup',   up,   {passive:false});
    btn.addEventListener('pointercancel',up,  {passive:false});
    btn.addEventListener('pointerleave', up,  {passive:false});
  });
} else {
  log('JS WARN: No #touchControls buttons found; mobile controls disabled.');
}

// 3) Boot Phaser on Start (guarded)
let game;
function boot() {
  try {
    if (game) return;
    if (!window.Phaser) { log('JS ERROR: Phaser not loaded.'); return; }

    const config = {
      type: Phaser.AUTO,
      parent: gameParentId,
      width: window.innerWidth,
      height: window.innerHeight,
      physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
      scene: { preload, create, update }
    };
    game = new Phaser.Game(config);
    if (titleEl) titleEl.style.display = 'none';
    log('Boot: Phaser game created.');
  } catch (e) {
    log('JS ERROR during boot: ' + (e && e.message ? e.message : e));
  }
}
if (startBtn) {
  startBtn.addEventListener('click', boot, {passive:true});
  startBtn.addEventListener('touchstart', e => { e.preventDefault(); boot(); }, {passive:false});
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') boot(); });

// ---------- Scene ----------
let player, cursors, enemies, canAttack = true;

function preload() {
  log('Preload: queue assets...');
  // cache-bust to avoid stale phone cache
  this.load.image('bg', 'assets/background1.png?v=' + Date.now());
  this.load.spritesheet('usagi', 'assets/snes_usagi_spritesheet.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 96 });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png?v=' + Date.now(), { frameWidth: 64, frameHeight: 64 });

  this.load.on('filecomplete', (key) => log('Loaded: ' + key));
  this.load.on('loaderror', (file) => log('LOAD ERROR: ' + (file?.src || 'unknown')));
  this.load.on('complete', () => log('All assets loaded.'));
}

function create() {
  try {
    const w = this.scale.width, h = this.scale.height;

    // Background (even if bg missing, keep going)
    if (this.textures.exists('bg')) {
      const bg = this.add.image(0, 0, 'bg').setOrigin(0);
      bg.setDisplaySize(w, h);
    } else {
      log('WARN: background texture missing, using solid fill.');
      const g = this.add.graphics(); g.fillStyle(0x0a2150, 1).fillRect(0,0,w,h);
    }

    // Player
    if (!this.textures.exists('usagi')) {
      log('JS ERROR: usagi spritesheet missing or failed to decode.');
      // draw a placeholder so game still runs
      const g = this.add.graphics(); g.fillStyle(0x10b981,1).fillRect(80, h-200, 64, 96);
    }
    player = this.physics.add.sprite(100, h - 150, 'usagi').setCollideWorldBounds(true);

    // Animations (tweak ranges if your sheet differs)
    if (this.textures.exists('usagi')) {
      this.anims.create({ key:'idle',   frames:this.anims.generateFrameNumbers('usagi', { start:0, end:1 }), frameRate:4,  repeat:-1 });
      this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi', { start:0, end:4 }), frameRate:10, repeat:-1 });
      this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi', { start:3, end:4 }), frameRate:14, repeat:0 });
      player.play('idle');
    }

    // Keyboard
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', () => tryAttack());

    // Enemies group + first spawn
    enemies = this.physics.add.group();
    spawnEnemy(this);
    this.time.addEvent({ delay: 1800, loop: true, callback: () => spawnEnemy(this) });

    // Resize
    this.scale.on('resize', ({ width, height }) => {
      this.cameras.resize(width, height);
    });

    log('Create: scene ready.');
  } catch (e) {
    log('JS ERROR in create(): ' + (e && e.message ? e.message : e));
  }
}

function update() {
  if (!player || !player.body) return;

  // combine keyboard + touch input
  const left   = (cursors && cursors.left.isDown)  || touch.left;
  const right  = (cursors && cursors.right.isDown) || touch.right;
  const jump   = (cursors && cursors.up.isDown)    || touch.jump;
  const attack = touch.attack;

  player.setVelocityX(0);

  if (left)  { player.setVelocityX(-180); player.flipX = true;  if (player.anims) player.play('walk', true); }
  else if (right) { player.setVelocityX(180);  player.flipX = false; if (player.anims) player.play('walk', true); }
  else { if (player.anims) player.play('idle', true); }

  if (jump && player.body.touching.down) { player.setVelocityY(-420); }
  if (attack) tryAttack();

  // clean up enemies off-screen
  enemies.children.iterate(e => { if (e && e.x < -e.width) e.destroy(); });
}

function tryAttack() {
  if (!canAttack || !player) return;
  canAttack = false;
  if (player.anims) player.play('attack', true);
  setTimeout(() => { canAttack = true; }, 250);

  enemies.children.iterate(e => {
    if (!e) return;
    const dx = Math.abs(e.x - player.x), dy = Math.abs(e.y - player.y);
    if (dx < 70 && dy < 40) { e.setVelocityX(-120); e.setTint(0xffaaaa); setTimeout(()=>e?.clearTint(), 200); }
  });
}

function spawnEnemy(scene) {
  const w = scene.scale.width, h = scene.scale.height;
  const e = enemies.create(w + 32, h - 150, 'enemies');

  // If enemy sheet missing, make a bright magenta square so you still SEE enemies
  if (!scene.textures.exists('enemies')) {
    const g = scene.add.graphics();
    g.fillStyle(0xff00ff, 1).fillRect(0, 0, 64, 64);
    const texKey = 'enemy_fallback_' + Phaser.Math.RND.uuid().slice(0,6);
    g.generateTexture(texKey, 64, 64);
    g.destroy();
    e.setTexture(texKey);
  }

  e.setVelocityX(-50 - Math.random()*40);
  e.setCollideWorldBounds(false);
}
