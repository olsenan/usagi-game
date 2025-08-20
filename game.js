// game.js — Phaser + mobile controls + robust Usagi sheet auto-slicing
'use strict';

const LOG = (m)=>{ try{ _status && _status.show(m); }catch{} console.log(m); };

if(!window.Phaser){ LOG('Phaser not loaded — add the CDN script before game.js'); throw new Error('Phaser missing'); }

const titleEl  = document.getElementById('title');
const startBtn = document.getElementById('startBtn');

// ---------- Paths ----------
const BG_PATH     = 'assets/background1.png';
const USAGI_IMG   = 'assets/snes_usagi_sprite_sheet.png'; // load as plain image; we will slice
const ENEMY_SHEET = 'assets/enemy_sprites.png';

// ---------- Mobile controls ----------
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

// ---------- Boot ----------
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

// ---------- Scene ----------
let player, cursors, enemies, canAttack = true;

function preload(){
  LOG('Preload: queue assets…');
  this.load.image('bg',     `${BG_PATH}?v=${Date.now()}`);
  this.load.image('usagi_i',`${USAGI_IMG}?v=${Date.now()}`); // plain image (we slice later)
  this.load.spritesheet('enemies', `${ENEMY_SHEET}?v=${Date.now()}`, { frameWidth:64, frameHeight:64 });

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
    this.scale.on('resize', ({width,height})=>{
      this.cameras.resize(width,height);
      bg.setDisplaySize(width,height);
    });
  }

  // -------- Slice Usagi image into a spritesheet ----------
  let usagiReady = false;
  if (this.textures.exists('usagi_i')) {
    const imgEl = this.textures.get('usagi_i').getSourceImage();
    const TW = imgEl.width, TH = imgEl.height;
    LOG(`Usagi: source size ${TW}×${TH}`);

    // Try a set of common layouts: [frameW, frameH, cols, rows] (rows may be 1 or 2)
    const candidates = [
      [64,96,5,1], [64,96,6,1], [64,96,8,1], [64,96,4,2], [64,96,5,2],
      [64,64,6,1], [64,64,8,1], [64,64,5,1], [64,64,4,2]
    ];

    let chosen = null;
    for (const [fw,fh,cols,rows] of candidates){
      if (TW % fw === 0 && TH % fh === 0){
        const c = TW / fw, r = TH / fh;
        if (c === cols && r === rows){ chosen = {fw,fh,cols,rows}; break; }
      }
    }
    // Fallback: assume single row, 5 columns
    if (!chosen){
      // derive columns from 5 frames
      chosen = { fw: Math.floor(TW/5), fh: TH, cols: 5, rows: 1 };
      LOG(`Usagi: fallback layout -> ${chosen.fw}×${chosen.fh}, ${chosen.cols}×${chosen.rows}`);
    } else {
      LOG(`Usagi: detected layout -> ${chosen.fw}×${chosen.fh}, ${chosen.cols}×${chosen.rows}`);
    }

    // Create texture 'usagi' and register frames
    const texKey = 'usagi';
    const canvas = this.textures.createCanvas(texKey, TW, TH).getSourceImage();
    const cctx = canvas.getContext('2d');
    cctx.clearRect(0,0,TW,TH);
    cctx.drawImage(imgEl, 0, 0);
    this.textures.get(texKey).refresh();

    const texObj = this.textures.get(texKey);
    let idx = 0;
    for (let row=0; row<chosen.rows; row++){
      for (let col=0; col<chosen.cols; col++){
        const sx = col*chosen.fw, sy = row*chosen.fh;
        if (sx + chosen.fw <= TW && sy + chosen.fh <= TH){
          texObj.add(String(idx), 0, sx, sy, chosen.fw, chosen.fh);
          idx++;
        }
      }
    }
    LOG(`Usagi: registered ${idx} frames`);
    this.textures.remove('usagi_i'); // remove raw image
    usagiReady = idx > 0;
  } else {
    LOG('JS ERROR: usagi image failed to decode (no source)');
  }

  // Player (fallback if not ready)
  player = this.physics.add.sprite(100, h-150, usagiReady ? 'usagi' : null).setCollideWorldBounds(true);
  if (!usagiReady){
    const g = this.add.graphics(); g.lineStyle(2,0x00ff00,1).strokeRect(0,0,64,96);
    g.generateTexture('usagi_fallback', 64,96); g.destroy();
    player.setTexture('usagi_fallback');
  }

  // Build animations from however many frames we found
  if (usagiReady){
    const frames = this.textures.get('usagi').getFrameNames()
                   .map(n=>parseInt(n,10)).sort((a,b)=>a-b);

    const idleEnd   = Math.min(1, frames.length-1);
    const walkStart = Math.min(2, frames.length-1);
    const walkEnd   = Math.min(walkStart+3, frames.length-1);
    const atkStart  = Math.min(walkEnd+1, frames.length-1);
    const atkEnd    = Math.min(atkStart+3, frames.length-1);

    const makeSeq = (s,e)=> frames.slice(s,e+1).map(i=>({key:'usagi', frame:String(i)}));
    this.anims.create({ key:'idle',   frames: makeSeq(0, idleEnd),  frameRate:4,  repeat:-1 });
    this.anims.create({ key:'walk',   frames: makeSeq(walkStart, walkEnd), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames: makeSeq(atkStart,  atkEnd),  frameRate:14, repeat:0 });

    player.play('idle');
  }

  // Input
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.on('keydown-SPACE', ()=> tryAttack());

  // Enemies
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
  if (left){  player.setVelocityX(-180); player.flipX = true;  if (player.anims) player.play('walk', true); }
  else if (right){ player.setVelocityX(180); player.flipX = false; if (player.anims) player.play('walk', true); }
  else { if (player.anims) player.play('idle', true); }

  if (jump && player.body.touching.down) player.setVelocityY(-420);
  if (attack) tryAttack();

  enemies.children.iterate(e => { if (e && e.x < -e.width) e.destroy(); });
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
