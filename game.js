/* =========================================================
   Usagi Prototype – Enemies + Combat + Stages
   - Loads usagi.png / ninjas.png sprite sheets (128x128)
   - Six backgrounds (one per stage)
   - Spawns ninja waves with simple AI
   - Player sword hitbox & enemy contact damage
   - Health bars + stage progression
   ========================================================= */

const BASE_W = 256, BASE_H = 224;

const root   = document.getElementById('game-root');
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d', { alpha: true, desynchronized: true });

const titleOverlay  = document.getElementById('title-overlay');
const reportOverlay = document.getElementById('report-overlay');
const reportLogEl   = document.getElementById('report-log');
document.getElementById('report-close')?.addEventListener('click', () => {
  reportOverlay.classList.add('hidden');
});
document.getElementById('start-btn')?.addEventListener('click', () => startGame());

canvas.width = BASE_W;
canvas.height = BASE_H;
ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingQuality = 'low';

function resizeCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth  / BASE_W,
    window.innerHeight / BASE_H
  )));
  const w = BASE_W * scale, h = BASE_H * scale;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  root.style.width  = canvas.style.width;
  root.style.height = canvas.style.height;

  const shortest = Math.min(w, h);
  const btn = Math.max(48, Math.min(96, Math.floor(shortest / 6))); // 48–96px
  const gap = Math.max(10, Math.floor(btn * 0.25));
  root.style.setProperty('--btn', `${btn}px`);
  root.style.setProperty('--gap', `${gap}px`);
}
addEventListener('resize', resizeCanvas);
resizeCanvas();

const ipx = n => Math.round(n);

// -------------------- Assets ---------------------------
const ASSETS = {
  usagi: 'assets/sprites/usagi.png',
  ninjas: 'assets/sprites/ninjas.png',
  backgrounds: [
    'assets/background/background1.png',
    'assets/background/background2.png',
    'assets/background/background3.png',
    'assets/background/background4.png',
    'assets/background/background5.png',
    'assets/background/background6.png',
  ],
  ui: {
    left:   'assets/ui/ui_left.png',
    right:  'assets/ui/ui_right.png',
    jump:   'assets/ui/ui_jump.png',
    attack: 'assets/ui/ui_attack.png'
  }
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + src));
    img.src = src;
  });
}

// -------------------- Core Sprite Helpers ---------------
class SpriteSheet {
  constructor(img, fw, fh, cols, margin=0, spacing=0) {
    this.img=img; this.fw=fw; this.fh=fh; this.cols=cols;
    this.margin=margin; this.spacing=spacing;
    this.safeInset=0.01; // bleed guard
  }
  srcRect(i) {
    const col = i % this.cols, row = Math.floor(i / this.cols);
    const s = this.spacing, m = this.margin, inset = this.safeInset;
    const sx = m + col * (this.fw + s) + inset;
    const sy = m + row * (this.fh + s) + inset;
    return { sx, sy, sw: this.fw - inset*2, sh: this.fh - inset*2 };
  }
}
class Animation {
  constructor(frames, fps=8, loop=true, holdLast=false) {
    this.frames=frames; this.fps=fps; this.loop=loop; this.holdLast=holdLast;
    this.t=0; this.i=0; this.done=false;
  }
  update(dt){
    if(this.done) return;
    this.t+=dt;
    const adv=Math.floor(this.t*this.fps);
    if(adv>0){
      this.t-=adv/this.fps; this.i+=adv;
      if(this.i>=this.frames.length){
        if(this.loop) this.i%=this.frames.length;
        else { this.i=this.frames.length-1; this.done=true; }
      }
    }
  }
  currentFrame(){ return this.frames[Math.min(this.i,this.frames.length-1)]; }
  reset(){ this.t=0; this.i=0; this.done=false; }
}
class Actor {
  constructor(sheet){
    this.sheet=sheet; this.x=128; this.y=180;
    this.anchorX=0.5; this.anchorY=1.0; this.flipX=false; this.scale=1;
    this.vx=0; this.vy=0; this.onGround=true;
    this.speed=45; this.jumpV=-130; this.gravity=340;
    this.anims=new Map(); this.current=null;
    this.shadow=true;

    // combat stats
    this.hp = 5;
    this.maxHp = 5;
    this.invulnT = 0;   // seconds of invulnerability after hit
  }
  addAnim(n,a){ this.anims.set(n,a); }
  play(n, restart=false){ const a=this.anims.get(n); if(!a) return; if(this.current!==a||restart) a.reset(); this.current=a; }
  updatePhysics(dt){
    this.x+=this.vx*dt; this.vy+=this.gravity*dt; this.y+=this.vy*dt;
    if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
    if(this.current) this.current.update(dt);
    if(this.invulnT>0) this.invulnT = Math.max(0, this.invulnT - dt);
  }
  draw(ctx){
    if(!this.current) return;
    const {sx,sy,sw,sh}=this.sheet.srcRect(this.current.currentFrame());
    const dw=this.sheet.fw*this.scale, dh=this.sheet.fh*this.scale;

    if(this.shadow){ const shw=ipx(dw*0.6), shh=ipx(dh*0.15); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(ipx(this.x-shw/2), ipx(this.y-2), shw, shh); }

    ctx.save();
    ctx.translate(ipx(this.x), ipx(this.y));
    if(this.flipX) ctx.scale(-1,1);

    // flicker while invulnerable
    if(this.invulnT>0 && (Math.floor(performance.now()/50)%2)===0) {
      ctx.globalAlpha = 0.5;
    }

    ctx.drawImage(this.sheet.img, sx,sy,sw,sh, ipx(-this.anchorX*dw), ipx(-this.anchorY*dh), dw, dh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  rect(w=22,h=40){ // basic body hurtbox for overlap checks
    return { x: this.x - w/2, y: this.y - h, w, h };
  }
}

// -------------------- Input -----------------------------
const input = { left:false, right:false, jump:false, attack:false, debug:false };
function handleKey(e, down){
  const k=e.code;
  if(k==='ArrowLeft'||k==='KeyA'){ input.left=down; e.preventDefault(); }
  if(k==='ArrowRight'||k==='KeyD'){ input.right=down; e.preventDefault(); }
  if(k==='ArrowUp'||k==='KeyW'||k==='Space'){ input.jump=down; e.preventDefault(); }
  if(['KeyJ','KeyK','KeyF','KeyH','KeyZ','KeyX'].includes(k)){ input.attack=down; e.preventDefault(); }
  if(k==='Enter' && down) startGame();
  if(k==='Backquote') input.debug=down;
}
addEventListener('keydown', e=>handleKey(e,true), {passive:false});
addEventListener('keyup',   e=>handleKey(e,false),{passive:false});

// Tap anywhere to start
['pointerdown','touchstart'].forEach(ev=>{
  root.addEventListener(ev, ()=>{ if(GAME.state==='title') startGame(); }, {passive:true});
});

// Touch buttons (hold-to-press)
function bindHold(id, setFlag){
  const el=document.getElementById(id); if(!el) return;
  const on = e=>{ e.preventDefault(); setFlag(true); };
  const off= e=>{ e.preventDefault(); setFlag(false); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold('btn-left',  v=>input.left=v);
bindHold('btn-right', v=>input.right=v);
bindHold('btn-jump',  v=>input.jump=v);
bindHold('btn-attack',v=>input.attack=v);

// -------------------- Game State ------------------------
const GAME = {
  state: 'boot',
  report: [],
  player: null,
  enemies: [],
  // Stage data
  levels: [],
  levelIndex: 0,
  scrollX: 0,

  // sheets
  usagiSheet: null,
  ninjaSheet: null
};

// -------------------- Animation Frame Maps --------------
// Using the indices from the earlier sheets (8 columns)
const U = {
  idle:   [0,1,2],
  walk:   [3,4,5,6,7, 8],         // row0 col3..7 + row1 col0
  run:    [9,10,11,12,13,14,15],  // row1 col1..7
  attack: [16,17,18,19,20,21],    // row2 col0..5
  jump:   [22,23],                 // row2 col6..7
  hurt:   [24]                     // row3 col0
};
// First row (black ninja) simple loop from earlier sheet
const N = {
  idle:   [0],
  walk:   [1,2,6,7],   // keep it simple
  attack: [3,4],
  hurt:   [5]
};

// -------------------- Loop ------------------------------
let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

// -------------------- Boot ------------------------------
async function boot(){
  try{
    const [uimg, nimg, ...bgs] = await Promise.all([
      loadImage(ASSETS.usagi),
      loadImage(ASSETS.ninjas),
      ...ASSETS.backgrounds.map(loadImage)
    ]);

    GAME.usagiSheet = new SpriteSheet(uimg, 128,128,8);
    GAME.ninjaSheet = new SpriteSheet(nimg, 128,128,8);

    // Player
    const p = new Actor(GAME.usagiSheet);
    p.x = 80; p.y = 180; p.scale=1;
    p.addAnim('idle',   new Animation(U.idle,6,true));
    p.addAnim('walk',   new Animation(U.walk,8,true));
    p.addAnim('run',    new Animation(U.run,12,true));
    p.addAnim('attack', new Animation(U.attack,12,false,true));
    p.addAnim('jump',   new Animation(U.jump,6,false,true));
    p.addAnim('hurt',   new Animation(U.hurt,4,false,true));
    p.play('idle', true);
    p.maxHp = 6; p.hp = 6;
    GAME.player = p;

    // Levels
    GAME.levels = bgs.map((img, i) => ({ name:`Stage ${i+1}`, img, speed: 16 + i*3, waves: i+1 }));
    GAME.levelIndex = 0;
    startLevel(0);

    GAME.state='title';
    titleOverlay.classList.remove('hidden');
  } catch (e) {
    GAME.report.push('Fatal load error: ' + e.message);
    reportLogEl.textContent = GAME.report.join('\n');
    reportOverlay.classList.remove('hidden');
    GAME.state = 'title';
  }
  requestAnimationFrame(loop);
}

function startGame(){
  if(GAME.state!=='play'){
    GAME.state='play';
    titleOverlay.classList.add('hidden');
    document.getElementById('touch-controls')?.classList.remove('hidden');
  }
}

function startLevel(idx){
  GAME.levelIndex = idx;
  GAME.enemies.length = 0;
  GAME.scrollX = 0;

  // Spawn a simple wave of ninjas (count increases with stage)
  const count = Math.min(5, 2 + idx);
  for(let i=0;i<count;i++){
    const e = new Actor(GAME.ninjaSheet);
    e.x = 160 + i*30;
    e.y = 180;
    e.scale = 1;
    e.speed = 28 + idx*3;
    e.maxHp = 3 + Math.floor(idx/2);
    e.hp = e.maxHp;

    e.addAnim('idle',   new Animation(N.idle,   4, true));
    e.addAnim('walk',   new Animation(N.walk,   7, true));
    e.addAnim('attack', new Animation(N.attack, 8, false, true));
    e.addAnim('hurt',   new Animation(N.hurt,   6, false, true));
    e.play('idle', true);

    // lightweight AI state
    e.ai = { state:'approach', timer: 0 };
    GAME.enemies.push(e);
  }
}

// -------------------- Update/Render ---------------------
function update(dt){
  if(GAME.state!=='play') return;

  // Scroll background
  const lv = currentLevel();
  if (lv) GAME.scrollX = (GAME.scrollX + dt * lv.speed) % (lv.img.width||BASE_W);

  // PLAYER input → movement/animation
  const p = GAME.player;
  if(p){
    // movement
    if(input.left){ p.vx=-p.speed; p.flipX=true; }
    else if(input.right){ p.vx=p.speed; p.flipX=false; }
    else p.vx=0;

    if(input.jump && p.onGround){ p.vy=p.jumpV; p.onGround=false; }

    // attacks
    const isBusy = p.current===p.anims.get('attack') && !p.current.done;
    if(input.attack && !isBusy){ p.play('attack', true); }

    // auto state if not attacking
    if(!isBusy){
      if(!p.onGround) p.play('jump');
      else if (Math.abs(p.vx) > p.speed*0.75) p.play('run');
      else if (Math.abs(p.vx) > 0) p.play('walk');
      else p.play('idle');
    }

    p.updatePhysics(dt);
  }

  // ENEMY AI + movement
  for(const e of GAME.enemies){
    if(e.hp<=0) continue;

    const dist = (p.x - e.x);
    e.flipX = dist < 0; // face player

    e.ai.timer -= dt;
    const close = Math.abs(dist) < 22;

    if(e.invulnT>0){
      // stagger back slightly when hit
      e.vx = (e.flipX ? -1 : 1) * -30;
      e.play('hurt');
    } else if(close && e.ai.timer <= 0){
      e.play('attack', true);
      e.vx = 0;
      e.ai.timer = 0.8; // cooldown
    } else if (!close){
      e.play('walk');
      e.vx = Math.sign(dist) * e.speed;
    } else {
      e.vx = 0;
      if(e.current!==e.anims.get('attack')) e.play('idle');
    }

    e.updatePhysics(dt);

    // Enemy attack touches player (contact damage when in attack frames)
    const atk = e.current===e.anims.get('attack') && !e.current.done;
    if(atk && overlap(e.rect(20,36), p.rect(20,40)) && p.invulnT<=0){
      damageActor(p, 1, (p.x < e.x) ? -80 : 80);
    }
  }

  // PLAYER sword hitbox → enemies
  if(p){
    const atk = p.current===p.anims.get('attack');
    const frameIndex = atk ? p.current.currentFrame() : -1;
    // Make the middle of the combo active
    const active = atk && (frameIndex===18 || frameIndex===19 || frameIndex===20);
    if(active){
      const hit = playerSwordHitbox(p);
      for(const e of GAME.enemies){
        if(e.hp>0 && e.invulnT<=0 && overlap(hit, e.rect(20,40))){
          damageActor(e, 1, (e.x < p.x) ? -90 : 90);
        }
      }
    }
  }

  // Clean up dead enemies and progress level
  let living = 0;
  for(const e of GAME.enemies){ if(e.hp>0) living++; }
  if(living===0){
    // Next level after a short delay
    levelAdvanceTimer = Math.max(0, levelAdvanceTimer - dt);
    if(levelAdvanceTimer===0){
      levelAdvanceTimer = 1.25;
      const next = (GAME.levelIndex + 1) % GAME.levels.length;
      startLevel(next);
    }
  }

  // Lose condition (optional: simple respawn)
  if(p && p.hp<=0){
    startLevel(GAME.levelIndex); // quick reset of current level
    p.hp = p.maxHp;
  }
}

let levelAdvanceTimer = 1.25;

function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  // Title shows level 1 background
  if(GAME.state==='title'){
    const lv0 = GAME.levels[0];
    if (lv0) drawTiled(lv0.img, 0);
    drawUI();
    return;
  }

  // Background
  const lv = currentLevel();
  if (lv) drawTiled(lv.img, GAME.scrollX);

  // Ground
  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  // Actors
  if(GAME.player) GAME.player.draw(ctx);
  for(const e of GAME.enemies){ if(e.hp>0) e.draw(ctx); }

  // UI overlays
  drawUI();
}

function drawUI(){
  // Health bars
  drawHealthBar(10, 10, 80, 8, GAME.player ? GAME.player.hp : 0, GAME.player ? GAME.player.maxHp : 1);
  // Enemies: show total remaining
  let alive = 0; for(const e of GAME.enemies) if(e.hp>0) alive++;
  drawHealthBar(BASE_W-90, 10, 80, 8, alive, Math.max(alive, 1));
}

function drawHealthBar(x,y,w,h,hp,maxHp){
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = '#111'; ctx.fillRect(ipx(x-1), ipx(y-1), w+2, h+2);
  ctx.fillStyle = '#4a0'; ctx.fillRect(ipx(x), ipx(y), Math.floor(w*pct), h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(ipx(x), ipx(y), w, h);
}

// Sword hitbox based on player facing; a thin rectangle ahead of body
function playerSwordHitbox(p){
  const reach = 30, height = 18;
  if(!p.flipX){
    return { x: p.x + 6, y: p.y - 36, w: reach, h: height };
  } else {
    return { x: p.x - 6 - reach, y: p.y - 36, w: reach, h: height };
  }
}

// AABB overlap
function overlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Apply damage and small knockback
function damageActor(a, dmg, knockVx){
  a.hp = Math.max(0, a.hp - dmg);
  a.invulnT = 0.35;
  a.vx = knockVx;
  a.vy = -60;
  a.onGround = false;
  a.play('hurt', true);
}

// Tile background image across the width with an x-offset (scroll)
function drawTiled(img, scroll){
  if(!img) return;
  const scale = BASE_H / img.height;
  const drawW = Math.ceil(img.width * scale);
  const drawH = BASE_H;
  const offset = -Math.floor((scroll * scale) % drawW);
  for (let x = offset; x < BASE_W; x += drawW) {
    ctx.drawImage(img, 0,0,img.width,img.height, x, 0, drawW, drawH);
  }
}

function currentLevel(){ return GAME.levels[GAME.levelIndex] || null; }

// -------------------- Go -------------------------------
boot();
