/* =========================================================
   Usagi Prototype – Mobile-friendly Start + Touch Controls
   - Pixel-perfect sprite rendering (no halos/jitter)
   - Integer canvas scaling; smoothing disabled
   - Start screen that accepts tap ANYWHERE or Start button
   - Report overlay only appears on real errors
   ========================================================= */

const BASE_W = 256, BASE_H = 224;

const root = document.getElementById('game-root');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

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
  root.style.width = canvas.style.width;
  root.style.height = canvas.style.height;
}
addEventListener('resize', resizeCanvas);
resizeCanvas();

const ipx = n => Math.round(n);

// -------------------------------- Assets ----------------
const ASSETS = {
  backgrounds: [
    'assets/background1.png',
    'assets/background2.png',
    'assets/background3.png',
    'assets/background_stage1.png',
    'assets/background_stage2.png',
    'assets/background_stage3.png'
  ],
  usagiSheets: [
    'assets/snes_usagi_sprite_sheet.png',       // 1024x1536 (64x64)
    'assets/usagi_snes_sheet.png',              // 1024x1536 (64x64)
    'assets/snes_usagi_sprite_sheet (1).png',   // 768x1152  (48x48)
    'assets/usagi_debug_sheet.png',             // 768x1152  (48x48)
    'assets/spritesheet.png'                    // 256x256   (32x32)
  ],
  enemySheet: 'assets/enemy_sprites.png'
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
async function loadFirstAvailableImage(list, report) {
  let lastErr = null;
  for (const src of list) {
    try {
      const img = await loadImage(src);
      report.push(`OK   ${src} (${img.width}x${img.height})`);
      return img;
    } catch (e) {
      report.push(`MISS ${src}`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('No candidate image could be loaded.');
}
function detectGrid(img) {
  const candidates = [64, 48, 32];
  for (const fw of candidates) {
    if (img.width % fw === 0 && img.height % fw === 0) {
      return { frameW: fw, frameH: fw, columns: img.width / fw, rows: img.height / fw, spacing: 0, margin: 0 };
    }
  }
  if (img.width % 16 === 0) {
    const fw = img.width / 16;
    if (img.height % fw === 0) return { frameW: fw, frameH: fw, columns: 16, rows: img.height / fw, spacing: 0, margin: 0 };
  }
  throw new Error(`Unable to detect grid for ${img.width}x${img.height}`);
}

// -------------------------------- Sprites ---------------
class SpriteSheet {
  constructor(img, fw, fh, cols, margin=0, spacing=0) {
    this.img = img; this.fw = fw; this.fh = fh; this.cols = cols;
    this.margin = margin; this.spacing = spacing;
    this.safeInset = 0.01; // bleed guard
  }
  srcRect(i) {
    const col = i % this.cols, row = Math.floor(i / this.cols);
    const s = this.spacing, m = this.margin, inset = this.safeInset;
    let sx = m + col * (this.fw + s) + inset;
    let sy = m + row * (this.fh + s) + inset;
    return { sx, sy, sw: this.fw - inset*2, sh: this.fh - inset*2 };
  }
}
class Animation {
  constructor(frames, fps=8, loop=true, holdLast=false) {
    this.frames = frames; this.fps=fps; this.loop=loop; this.holdLast=holdLast;
    this.t=0; this.i=0; this.done=false;
  }
  update(dt){
    if(this.done) return;
    this.t += dt;
    const adv = Math.floor(this.t*this.fps);
    if(adv>0){
      this.t -= adv/this.fps; this.i += adv;
      if(this.i >= this.frames.length){
        if(this.loop) this.i %= this.frames.length;
        else { this.i=this.frames.length-1; this.done=true; }
      }
    }
  }
  currentFrame(){ return this.frames[Math.min(this.i, this.frames.length-1)]; }
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
    if(input.left) { this.vx=-this.speed; this.flipX=true; }
    else if(input.right){ this.vx=this.speed; this.flipX=false; }
    else this.vx=0;
    if(input.jump && this.onGround){ this.vy=this.jumpV; this.onGround=false; }
    if(input.attack && (!this.current || this.current.done ||
      this.current===this.anims.get('idle') || this.current===this.anims.get('run'))) {
      this.play('attack', true);
    }
    this.x+=this.vx*dt; this.vy+=this.gravity*dt; this.y+=this.vy*dt;
    if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
    const attacking = this.current===this.anims.get('attack') && !this.current.done;
    if(!attacking){
      if(!this.onGround) this.play('jump');
      else if(this.vx!==0) this.play('run');
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

// -------------------------------- Input -----------------
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

// Tap ANYWHERE (root or overlay) to start
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

// -------------------------------- Game State ------------
const GAME = {
  state: 'boot', // 'boot' | 'title' | 'play'
  report: [],
  bgImg: null,
  player: null,
  enemy: null
};

const ANIMS = {
  idle:   { frames:[0,1,2,3], fps:6,  loop:true },
  run:    { frames:[8,9,10,11,12,13], fps:10, loop:true },
  jump:   { frames:[16,17,18,19], fps:8,  loop:false },
  attack: { frames:[24,25,26,27], fps:12, loop:false, holdLast:true }
};

let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

// -------------------------------- Boot ------------------
async function boot(){
  try{
    try{ GAME.bgImg = await loadFirstAvailableImage(ASSETS.backgrounds, GAME.report); }
    catch{ GAME.report.push('No background loaded.'); GAME.bgImg=null; }

    const uimg = await loadFirstAvailableImage(ASSETS.usagiSheets, GAME.report);
    const ugrid = detectGrid(uimg);
    const usagiSheet = new SpriteSheet(uimg, ugrid.frameW, ugrid.frameH, ugrid.columns);

    const p = new Sprite(usagiSheet);
    p.addAnim('idle',   new Animation(ANIMS.idle.frames,   ANIMS.idle.fps,   ANIMS.idle.loop));
    p.addAnim('run',    new Animation(ANIMS.run.frames,    ANIMS.run.fps,    ANIMS.run.loop));
    p.addAnim('jump',   new Animation(ANIMS.jump.frames,   ANIMS.jump.fps,   ANIMS.jump.loop));
    p.addAnim('attack', new Animation(ANIMS.attack.frames, ANIMS.attack.fps, ANIMS.attack.loop, ANIMS.attack.holdLast));
    p.play('idle', true);
    GAME.player = p;

    // Enemy (optional) — register anim BEFORE play
    try{
      const eimg = await loadImage(ASSETS.enemySheet);
      GAME.report.push(`OK   ${ASSETS.enemySheet} (${eimg.width}x${eimg.height})`);
      const egrid = detectGrid(eimg);
      const es = new SpriteSheet(eimg, egrid.frameW, egrid.frameH, egrid.columns);
      const e = new Sprite(es); e.x=200; e.y=180;
      e.addAnim('idle', new Animation([0,1,2,3], 4, true));
      e.play('idle', true);
      GAME.enemy = e;
    } catch { GAME.report.push(`MISS ${ASSETS.enemySheet}`); }

    // Only show report overlay if there were any MISS entries
    const hadMiss = GAME.report.some(r=>r.startsWith('MISS') || r.startsWith('Fatal'));
    if (hadMiss) {
      reportLogEl.textContent = GAME.report.join('\n');
      reportOverlay.classList.remove('hidden');
    } else {
      reportOverlay.classList.add('hidden');
    }

    GAME.state = 'title';
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

// -------------------------------- Update/Render ---------
function update(dt){
  if(GAME.state!=='play') return;
  if(GAME.player) GAME.player.update(dt, input);
  if(GAME.enemy)  GAME.enemy.update(dt, {left:false,right:false,jump:false,attack:false});
}
function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  if(GAME.bgImg){
    const tiles=Math.ceil(BASE_W/GAME.bgImg.width);
    for(let i=0;i<tiles;i++){
      ctx.drawImage(GAME.bgImg, i*GAME.bgImg.width, ipx(BASE_H - GAME.bgImg.height));
    }
  } else {
    ctx.fillStyle='#1b1f2a'; ctx.fillRect(0,0,BASE_W,BASE_H);
  }

  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  if(GAME.player) GAME.player.draw(ctx);
  if(GAME.enemy)  GAME.enemy.draw(ctx);
}

// -------------------------------- Start -----------------
boot();
