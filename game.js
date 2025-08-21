/* =========================================================
   Usagi Prototype – Multi-Level Backgrounds (6 stages)
   - Loads assets/background/background1.png ... background6.png
   - Each level uses a different background
   - Background auto-scrolls; tiled horizontally
   - Level cycling: N (next), P (prev); or hold Jump+Attack (mobile)
   - Keeps pixel-perfect sprite rendering and mobile controls
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

  // Responsive touch control sizing
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

// -------------------- Sprites --------------------------
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
class Sprite {
  constructor(sheet){
    this.sheet=sheet; this.x=128; this.y=180;
    this.anchorX=0.5; this.anchorY=1.0; this.flipX=false; this.scale=1; this.shadow=true;
    this.vx=0; this.vy=0; this.onGround=true; this.speed=45; this.jumpV=-130; this.gravity=340;
    this.anims=new Map(); this.current=null;
  }
  addAnim(n,a){ this.anims.set(n,a); }
  play(n, restart=false){ const a=this.anims.get(n); if(!a) return; if(this.current!==a||restart) a.reset(); this.current=a; }
  update(dt,input){
    if(this.current) this.current.update(dt);
    if(input.left){ this.vx=-this.speed; this.flipX=true; }
    else if(input.right){ this.vx=this.speed; this.flipX=false; }
    else this.vx=0;
    if(input.jump && this.onGround){ this.vy=this.jumpV; this.onGround=false; }
    if(input.attack && (!this.current || this.current.done ||
        this.current===this.anims.get('idle') || this.current===this.anims.get('run') || this.current===this.anims.get('walk'))) {
      this.play('attack', true);
    }
    this.x+=this.vx*dt; this.vy+=this.gravity*dt; this.y+=this.vy*dt;
    if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
    const attacking=this.current===this.anims.get('attack') && !this.current.done;
    if(!attacking){
      if(!this.onGround) this.play('jump');
      else if (Math.abs(this.vx) > this.speed*0.75) this.play('run');
      else if (Math.abs(this.vx) > 0) this.play('walk');
      else this.play('idle');
    }
  }
  draw(ctx){
    if(!this.current) return;
    const {sx,sy,sw,sh}=this.sheet.srcRect(this.current.currentFrame());
    const dw=this.sheet.fw*this.scale, dh=this.sheet.fh*this.scale;
    if(this.shadow){ const shw=ipx(dw*0.6), shh=ipx(dh*0.15); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(ipx(this.x-shw/2), ipx(this.y-2), shw, shh); }
    ctx.save(); ctx.translate(ipx(this.x), ipx(this.y)); if(this.flipX) ctx.scale(-1,1);
    ctx.drawImage(this.sheet.img, sx,sy,sw,sh, ipx(-this.anchorX*dw), ipx(-this.anchorY*dh), dw, dh);
    ctx.restore();
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
  if(k==='KeyN' && down) nextLevel();
  if(k==='KeyP' && down) prevLevel();
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
  enemy: null,
  // Background/level data
  levels: [],
  levelIndex: 0,
  scrollX: 0,
  comboLatch: false // for mobile: hold Jump+Attack to change level
};

// -------------------- Frame maps ------------------------
const U = { idle:[0,1,2], walk:[3,4,5,6,7,8], run:[9,10,11,12,13,14,15], attack:[16,17,18,19,20,21], jump:[22,23], hurt:[24] };
const N = { idle:[0], walk:[1,2,6,7], attack:[3,4], hurt:[5] };

let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

// -------------------- Boot ------------------------------
async function boot(){
  try{
    // Load sprites
    const [uimg, nimg] = await Promise.all([
      loadImage(ASSETS.usagi),
      loadImage(ASSETS.ninjas)
    ]);
    const usagiSheet = new SpriteSheet(uimg,128,128,8);
    const ninjaSheet = new SpriteSheet(nimg,128,128,8);

    // Player
    const p = new Sprite(usagiSheet);
    p.addAnim('idle',   new Animation(U.idle,6,true));
    p.addAnim('walk',   new Animation(U.walk,8,true));
    p.addAnim('run',    new Animation(U.run,12,true));
    p.addAnim('attack', new Animation(U.attack,12,false,true));
    p.addAnim('jump',   new Animation(U.jump,6,false,true));
    p.addAnim('hurt',   new Animation(U.hurt,4,false,true));
    p.play('idle', true);
    GAME.player = p;

    // Enemy (demo)
    const e = new Sprite(ninjaSheet);
    e.x=200; e.y=180;
    e.addAnim('idle',   new Animation(N.idle,4,true));
    e.addAnim('walk',   new Animation(N.walk,6,true));
    e.addAnim('attack', new Animation(N.attack,8,false,true));
    e.addAnim('hurt',   new Animation(N.hurt,4,false,true));
    e.play('idle', true);
    GAME.enemy = e;

    // Load backgrounds (6 levels)
    const bgImgs = await Promise.all(ASSETS.backgrounds.map(loadImage));
    GAME.levels = bgImgs.map((img, i) => ({ name: `Stage ${i+1}`, img, speed: 18 + i*4 }));
    GAME.levelIndex = 0;

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

// -------------------- Level helpers ---------------------
function currentLevel(){ return GAME.levels[GAME.levelIndex] || null; }
function nextLevel(){ GAME.levelIndex = (GAME.levelIndex + 1) % GAME.levels.length; }
function prevLevel(){ GAME.levelIndex = (GAME.levelIndex - 1 + GAME.levels.length) % GAME.levels.length; }

// -------------------- Update/Render ---------------------
function update(dt){
  if(GAME.state!=='play') return;

  // mobile combo: hold jump+attack to switch level
  if (input.jump && input.attack) {
    if (!GAME.comboLatch) {
      GAME.comboLatch = true;
      nextLevel();
    }
  } else {
    GAME.comboLatch = false;
  }

  // Scroll background
  const lv = currentLevel();
  if (lv) GAME.scrollX = (GAME.scrollX + dt * lv.speed) % lv.img.width;

  if(GAME.player) GAME.player.update(dt, input);
  if(GAME.enemy)  GAME.enemy.update(dt, {left:false,right:false,jump:false,attack:false});
}

function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  // Title just shows current level background (index 0) if loaded
  if(GAME.state==='title'){
    const lv0 = GAME.levels[0];
    if (lv0) drawTiled(lv0.img, 0);
    return;
  }

  // Draw active level background (tiled horizontally)
  const lv = currentLevel();
  if (lv) drawTiled(lv.img, GAME.scrollX);

  // Ground strip (kept for readability)
  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  if(GAME.player) GAME.player.draw(ctx);
  if(GAME.enemy)  GAME.enemy.draw(ctx);
}

// Tile background image across the width with an x-offset (scroll)
function drawTiled(img, scroll){
  if(!img) return;
  // Scale image to canvas height, preserve aspect
  const scale = BASE_H / img.height;
  const drawW = Math.ceil(img.width * scale);
  const drawH = BASE_H;

  // Compute x offset
  const offset = -Math.floor((scroll * scale) % drawW);
  for (let x = offset; x < BASE_W; x += drawW) {
    ctx.drawImage(img, 0,0,img.width,img.height, x, 0, drawW, drawH);
  }
}

// -------------------- Go -------------------------------
boot();
