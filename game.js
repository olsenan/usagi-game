// game.js — Phaser + mobile controls + auto-anim from new Usagi sheet
'use strict';

const LOG = (m)=>{ try{ _status && _status.show(m) }catch{}; console.log(m); };

if(!window.Phaser){ LOG('Phaser not loaded — add the CDN script before game.js'); throw new Error('Phaser missing'); }

const titleEl  = document.getElementById('title');
const startBtn = document.getElementById('startBtn');

// ---------- CONFIGURE YOUR SHEET HERE ----------
const USAGI_SHEET_PATH = 'assets/snes_usagi_sprite_sheet.png'; // <- make sure this exists
const USAGI_FRAME_W = 64;
const USAGI_FRAME_H = 96;
// Animation layout assumption (all frames in one row, left→right):
// idle = first 2, walk = next 4, attack = next 4 (if present). Code will fall back if fewer exist.
// ------------------------------------------------

const touch = { left:false, right:false, jump:false, attack:false };
document.querySelectorAll('#touchControls .ctl').forEach(btn=>{
  const k = btn.dataset.key;
  const down = e=>{ e.preventDefault();
    if(k==='ArrowLeft')  touch.left=true;
    if(k==='ArrowRight') touch.right=true;
    if(k==='Space')      touch.jump=true;
    if(k==='KeyA')       touch.attack=true;
  };
  const up   = e=>{ e.preventDefault();
    if(k==='ArrowLeft')  touch.left=false;
    if(k==='ArrowRight') touch.right=false;
    if(k==='Space')      touch.jump=false;
    if(k==='KeyA')       touch.attack=false;
  };
  btn.addEventListener('pointerdown', down, {passive:false});
  btn.addEventListener('pointerup',   up,   {passive:false});
  btn.addEventListener('pointercancel',up,  {passive:false});
  btn.addEventListener('pointerleave', up,  {passive:false});
});

let game;
function boot(){
  if(game) return;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: window.innerWidth,
    height: window.innerHeight,
    physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
    scene: { preload, create, update }
  });
  if(titleEl) titleEl.style.display = 'none';
}
if(startBtn){
  startBtn.addEventListener('click', boot, {passive:true});
  startBtn.addEventListener('touchstart', e=>{ e.preventDefault(); boot(); }, {passive:false});
}
document.addEventListener('keydown', e=>{ if(e.key==='Enter') boot(); });

let player, cursors, enemies, canAttack = true;

function preload(){
  // cache-bust to avoid old cached files on mobile
  this.load.image('bg', 'assets/background1.png?v='+Date.now());
  this.load.spritesheet('usagi', `${USAGI_SHEET_PATH}?v=${Date.now()}`, { frameWidth: USAGI_FRAME_W, frameHeight: USAGI_FRAME_H });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png?v='+Date.now(), { frameWidth:64, frameHeight:64 });

  this.load.on('filecomplete', (key)=> LOG('Loaded: ' + key));
  this.load.on('loaderror',   (file)=> LOG('LOAD ERROR: ' + (file?.src || 'unknown')));
  this.load.on('complete',    ()=> LOG('All assets loaded'));
}

function create(){
  const w = this.scale.width, h = this.scale.height;

  // Background
  if (this.textures.exists('bg')){
    const bg = this.add.image(0,0,'bg').setOrigin(0);
    bg.setDisplaySize(w,h);
    this.scale.on('resize', ({width,height})=>{ this.cameras.resize(width,height); bg.setDisplaySize(width,height); });
  }

  // --------- Build animations based on sheet length ----------
  let totalCols = 0;
  if (this.textures.exists('usagi')){
    const tex = this.textures.get('usagi').getSourceImage();
    totalCols = Math.floor(tex.width / USAGI_FRAME_W);
  }
  const idleEnd   = Math.min(1, totalCols-1);        // 0..1
  const walkStart = Math.min(2, totalCols-1);        // 2..
  const walkEnd   = Math.min(walkStart+3, totalCols-1); // +4 frames if possible
  const atkStart  = Math.min(walkEnd+1, totalCols-1);
  const atkEnd    = Math.min(atkStart+3, totalCols-1);

  if (this.textures.exists('usagi')){
    this.anims.create({ key:'idle',   frames:this.anims.generateFrameNumbers('usagi',{ start:0, end:idleEnd }), frameRate:4,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{ start:walkStart, end:walkEnd }), frameRate:10, repeat:-1 });
    // If we don’t have 4 attack frames, it will still animate (shorter)
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{ start:atkStart, end:atkEnd }), frameRate:14, repeat:0 });
  }

  // Player (fallback box if sheet missing)
  player = this.physics.add.sprite(100, h-150, this.textures.exists('usagi') ? 'usagi' : null).setCollideWorldBounds(true);
  if (!this.textures.exists('usagi')){
    const g = this.add.graphics(); g.lineStyle(2,0x00ff00,1).strokeRect(0,0,USAGI_FRAME_W,USAGI_FRAME_H);
    g.generateTexture('usagi_fallback', USAGI_FRAME_W, USAGI_FRAME_H); g.destroy();
    player.setTexture('usagi_fallback');
  } else {
    player.play('idle');
  }

  // Input
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.on('keydown-SPACE', ()=> tryAttack());

  // Enemies (visible even if enemy sheet fails)
  enemies = this.physics.add.group({ allowGravity:false });
  spawnEnemy(this);
  this.time.addEvent({ delay: 1800, loop:true, callback: ()=> spawnEnemy(this) });
}

function update(){
  if (!player || !player.body) return;

  const left   = (cursors && cursors.left.isDown)  || touch.left;
  const right  = (cursors && cursors.right.isDown) || touch.right;
  const jump   = (cursors && cursors.up.isDown)    || touch.jump;
  const attack = touch.attack;

  player.setVelocityX(0);
  if (left){  player.setVelocityX(-180); player.flipX=true;  if(player.anims) player.play('walk', true); }
  else if (right){ player.setVelocityX(180); player.flipX=false; if(player.anims) player.play('walk', true); }
  else { if(player.anims) player.play('idle', true); }

  if (jump && player.body.touching.down) player.setVelocityY(-420);
  if (attack) tryAttack();

  enemies.children.iterate(e=>{ if(e && e.x < -e.width) e.destroy(); });
}

let canAttack = true;
function tryAttack(){
  if (!canAttack || !player) return;
  canAttack = false;
  if (player.anims) player.play('attack', true);
  setTimeout(()=>{ canAttack = true; }, 250);

  enemies.children.iterate(e=>{
    if (!e) return;
    const dx = Math.abs(e.x - player.x), dy = Math.abs(e.y - player.y);
    if (dx < 70 && dy < 40){ e.setVelocityX(-120); e.setTint(0xffaaaa); setTimeout(()=>e?.clearTint(), 200); }
  });
}

function spawnEnemy(scene){
  const w = scene.scale.width, h = scene.scale.height;
  const e = enemies.create(w + 32, h - 150, scene.textures.exists('enemies') ? 'enemies' : null);
  if (!scene.textures.exists('enemies')){
    const g = scene.add.graphics(); g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
    const key = 'enemy_fallback_' + Phaser.Math.RND.uuid().slice(0,6);
    g.generateTexture(key,64,64); g.destroy();
    e.setTexture(key);
  }
  e.setVelocityX(-50 - Math.random()*40);
}
