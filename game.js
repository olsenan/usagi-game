/* =========================================================
   Usagi Prototype – Mobile-safe Start + Per-Anim Sheets
   - Start works on mobile: click, touchend, pointerup
   - Title overlay itself is tappable
   - Prevents default scrolling/zoom on touch
   - Same animation/loader architecture
   ========================================================= */

const BASE_W = 256, BASE_H = 224;

const root   = document.getElementById('game-root');
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d', { alpha: true, desynchronized: true });

const titleOverlay  = document.getElementById('title-overlay');
const reportOverlay = document.getElementById('report-overlay');
const reportLogEl   = document.getElementById('report-log');
const startBtn      = document.getElementById('start-btn');
const touchLayer    = document.getElementById('touch-controls');

document.getElementById('report-close')?.addEventListener('click', () => {
  reportOverlay.classList.add('hidden');
});

canvas.width = BASE_W;
canvas.height = BASE_H;
ctx.imageSmoothingEnabled = false;
ctx.imageSmoothingQuality = 'low';

// --- MOBILE START: wire multiple reliable events ---
function clicky(el, fn) {
  if (!el) return;
  const opts = { passive: false };
  el.addEventListener('click', fn, opts);
  el.addEventListener('pointerup', fn, opts);
  el.addEventListener('touchend', (e)=>{ e.preventDefault(); fn(e); }, opts);
}

function startFromTitle(e){
  e?.preventDefault?.();
  if (GAME.state !== 'play') startGame();
}

clicky(startBtn, startFromTitle);
// Also allow tapping anywhere on the overlay to start
clicky(titleOverlay, (e) => {
  // Ignore if you tapped the panel but not the overlay backdrop
  // Still start—mobile users expect anywhere to work.
  startFromTitle(e);
});

// Safety: block default gestures in root (prevents scroll)
['touchstart','touchmove','gesturestart'].forEach(evt=>{
  root.addEventListener(evt, (e)=>e.preventDefault(), {passive:false});
});

// --- Responsive sizing ---
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
  const btn = Math.max(48, Math.min(96, Math.floor(shortest / 6)));
  const gap = Math.max(10, Math.floor(btn * 0.25));
  root.style.setProperty('--btn', `${btn}px`);
  root.style.setProperty('--gap', `${gap}px`);
}
addEventListener('resize', resizeCanvas);
resizeCanvas();

const ipx = n => Math.round(n);

// -------------------- Paths ----------------------------
const PATHS = {
  usagi:  'assets/sprites/usagi/manifest.json',
  ninja:  'assets/sprites/ninja/manifest.json',
  bgs: [
    'assets/background/background1.png',
    'assets/background/background2.png',
    'assets/background/background3.png',
    'assets/background/background4.png',
    'assets/background/background5.png',
    'assets/background/background6.png',
  ]
};

// -------------------- Utils ----------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load: ' + src));
    img.src = src;
  });
}
async function loadJSON(src) {
  const res = await fetch(src, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load JSON: ${src}`);
  return res.json();
}

// -------------------- Sprite System --------------------
class StripSheet {
  constructor(img, frameW, frameH, frames) {
    this.img = img;
    this.fw = frameW;
    this.fh = frameH;
    this.frames = Math.max(1, frames);
  }
  srcRect(i) {
    const clamped = Math.max(0, Math.min(this.frames - 1, i|0));
    const sx = clamped * this.fw + 0.01;
    return { sx, sy: 0.01, sw: this.fw - 0.02, sh: this.fh - 0.02 };
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
  constructor(){
    this.x=128; this.y=180;
    this.anchorX=0.5; this.anchorY=1.0; this.flipX=false; this.scale=1;
    this.vx=0; this.vy=0; this.onGround=true;
    this.speed=45; this.jumpV=-130; this.gravity=340;
    this.shadow=true;

    this.anims = new Map();
    this.currentName = null;
    this.invulnT = 0;

    this.hp = 5; this.maxHp = 5;
  }
  hasAnim(name){ return this.anims.has(name); }
  addAnim(name, sheet, fps=8, loop=true, holdLast=false) {
    const frames = Array.from({length: sheet.frames}, (_,i)=>i);
    this.anims.set(name, { sheet, anim: new Animation(frames, fps, loop, holdLast) });
  }
  play(name, restart=false) {
    if (!this.anims.has(name)) return;
    if (this.currentName !== name || restart) {
      this.anims.get(name).anim.reset();
      this.currentName = name;
    }
  }
  updatePhysics(dt){
    this.x+=this.vx*dt; this.vy+=this.gravity*dt; this.y+=this.vy*dt;
    if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
    if (this.currentName) this.anims.get(this.currentName).anim.update(dt);
    if(this.invulnT>0) this.invulnT = Math.max(0, this.invulnT - dt);
  }
  draw(ctx){
    if(!this.currentName) return;
    const {sheet, anim} = this.anims.get(this.currentName);
    const frame = anim.currentFrame();
    const {sx,sy,sw,sh}=sheet.srcRect(frame);
    const dw=sheet.fw*this.scale, dh=sheet.fh*this.scale;

    if(this.shadow){ const shw=ipx(dw*0.6), shh=ipx(dh*0.15); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(ipx(this.x-shw/2), ipx(this.y-2), shw, shh); }

    ctx.save(); ctx.translate(ipx(this.x), ipx(this.y)); if(this.flipX) ctx.scale(-1,1);
    if(this.invulnT>0 && (Math.floor(performance.now()/50)%2)===0) ctx.globalAlpha = 0.5;
    ctx.drawImage(sheet.img, sx,sy,sw,sh, ipx(-this.anchorX*dw), ipx(-this.anchorY*dh), dw, dh);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  rect(w=22,h=40){ return { x: this.x - w/2, y: this.y - h, w, h }; }
}

// -------------------- Input -----------------------------
const input = { left:false, right:false, jump:false, attack:false };
function handleKey(e, down){
  const k=e.code;
  if(k==='ArrowLeft'||k==='KeyA'){ input.left=down; e.preventDefault(); }
  if(k==='ArrowRight'||k==='KeyD'){ input.right=down; e.preventDefault(); }
  if(k==='ArrowUp'||k==='KeyW'||k==='Space'){ input.jump=down; e.preventDefault(); }
  if(['KeyJ','KeyK','KeyF','KeyH','KeyZ','KeyX'].includes(k)){ input.attack=down; e.preventDefault(); }
  if(k==='Enter' && down) startFromTitle(e);
}
addEventListener('keydown', e=>handleKey(e,true), {passive:false});
addEventListener('keyup',   e=>handleKey(e,false),{passive:false});

// Touch buttons (hold)
function bindHold(id, setFlag){
  const el=document.getElementById(id); if(!el) return;
  const on = e=>{ e.preventDefault(); setFlag(true); };
  const off= e=>{ e.preventDefault(); setFlag(false); };
  el.addEventListener('pointerdown', on, {passive:false});
  el.addEventListener('pointerup', off, {passive:false});
  el.addEventListener('pointercancel', off, {passive:false});
  el.addEventListener('pointerleave', off, {passive:false});
}
bindHold('btn-left',  v=>input.left=v);
bindHold('btn-right', v=>input.right=v);
bindHold('btn-jump',  v=>input.jump=v);
bindHold('btn-attack',v=>input.attack=v);

// -------------------- Game State ------------------------
const GAME = {
  state: 'boot',
  report: [],
  bgs: [],
  levelIndex: 0,
  scrollX: 0,
  player: null,
  enemies: []
};

// -------------------- Boot ------------------------------
let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

async function boot(){
  try{
    const [maniUsagi, maniNinja] = await Promise.all([
      loadJSON('assets/sprites/usagi/manifest.json').catch(()=> ({})),
      loadJSON('assets/sprites/ninja/manifest.json').catch(()=> ({}))
    ]);

    const loadSheets = async (manifest) => {
      const out = {};
      await Promise.all(Object.entries(manifest).map(async ([name, meta]) => {
        const img = await loadImage(meta.path);
        out[name] = new StripSheet(img, meta.frameSize[0], meta.frameSize[1], meta.frames);
      }));
      return out;
    };
    const usagiSheets = await loadSheets(maniUsagi);
    const ninjaSheets = await loadSheets(maniNinja);

    GAME.bgs = await Promise.all(PATHS.bgs.map(loadImage).map(p=>p.catch(()=>null)));

    // Player
    const p = new Actor();
    p.x = 80; p.y = 180; p.scale = 1;
    // Attach whichever anims are present
    const attach = (actor, sheets, spec) => {
      for (const [name, conf] of Object.entries(sheets)) {
        actor.addAnim(name, conf, 8, true);
      }
    };
    attach(p, usagiSheets);
    p.play(p.hasAnim('idle') ? 'idle' : (p.hasAnim('walk') ? 'walk' : [...p.anims.keys()][0] || null), true);
    GAME.player = p;

    // Enemies
    GAME.enemies.length = 0;
    const e = new Actor();
    e.x = 180; e.y = 180; e.scale=1;
    attach(e, ninjaSheets);
    e.play(e.hasAnim('idle') ? 'idle' : (e.hasAnim('walk')?'walk':[...e.anims.keys()][0]||null), true);
    e.ai = { state:'approach', timer: 0 };
    GAME.enemies.push(e);

    GAME.state='title';
    titleOverlay?.classList.add('visible');
    titleOverlay?.classList.remove('hidden');
  } catch (e) {
    GAME.report.push('Fatal load error: ' + e.message);
    reportLogEl.textContent = GAME.report.join('\n');
    reportOverlay.classList.remove('hidden');
    GAME.state = 'title';
  }
  requestAnimationFrame(loop);
}

// -------------------- Update/Render ---------------------
function currentBg(){ return GAME.bgs.find(Boolean) || null; }

function update(dt){
  if(GAME.state!=='play') return;

  const bg = currentBg();
  if (bg && bg.width) GAME.scrollX = (GAME.scrollX + dt * 18) % (bg.width||BASE_W);

  const p = GAME.player;
  if(p){
    if(input.left){ p.vx=-p.speed; p.flipX=true; }
    else if(input.right){ p.vx=p.speed; p.flipX=false; }
    else p.vx=0;

    if(input.jump && p.onGround){ p.vy=-130; p.onGround=false; }

    const busyName = p.currentName;
    const busy = busyName && !p.anims.get(busyName).anim.loop && !p.anims.get(busyName).anim.done;

    if(input.attack && !busy){
      const pick = p.hasAnim('attack1') ? 'attack1' : (p.hasAnim('attack') ? 'attack' : null);
      if(pick) p.play(pick, true);
    }

    if(!busy){
      if(!p.onGround && p.hasAnim('jump')) p.play('jump');
      else if (Math.abs(p.vx) > p.speed*0.75 && p.hasAnim('run')) p.play('run');
      else if (Math.abs(p.vx) > 0 && p.hasAnim('walk')) p.play('walk');
      else if (p.hasAnim('idle')) p.play('idle');
    }

    p.updatePhysics(dt);
  }

  for(const e of GAME.enemies){
    if(e.hp<=0) continue;
    const dist = (GAME.player.x - e.x);
    e.flipX = dist < 0;
    e.ai.timer = (e.ai.timer || 0) - dt;
    const close = Math.abs(dist) < 22;

    if(close && e.ai.timer <= 0){
      if(e.hasAnim('attack')) e.play('attack', true);
      e.vx = 0; e.ai.timer = 0.9;
    } else if (!close){
      if(e.hasAnim('walk')) e.play('walk');
      e.vx = Math.sign(dist) * (e.speed||28);
    } else {
      e.vx = 0;
      if(e.currentName!=='attack' && e.hasAnim('idle')) e.play('idle');
    }
    e.updatePhysics(dt);
  }
}

function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  if(GAME.state==='title'){
    const bg0 = currentBg();
    if(bg0) drawTiled(bg0, 0);
    drawTitleHint();
    return;
  }

  const bg = currentBg();
  if (bg) drawTiled(bg, GAME.scrollX);

  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  if(GAME.player) GAME.player.draw(ctx);
  for(const e of GAME.enemies){ if(e.hp>0) e.draw(ctx); }
}

function drawTitleHint() {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(4, BASE_H-18, 158, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.fillText('Tap anywhere to start', 8, BASE_H-9);
}

// -------------------- BG tiling ------------------------
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

// -------------------- Start ----------------------------
function startGame(){
  GAME.state='play';
  titleOverlay?.classList.remove('visible');
  titleOverlay?.classList.add('hidden');
  touchLayer?.classList.remove('hidden');
}

let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

boot();
requestAnimationFrame(loop);
