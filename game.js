/* =========================================================
   Usagi Prototype – Per-Animation Sprite Sheets Loader
   - Uses assets/sprites/usagi/*.png with manifest.json
   - Uses assets/sprites/ninja/*.png with manifest.json
   - Keeps backgrounds, enemies, combat, health bars, mobile UI
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

  // Touch controls responsive sizing
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
  // Horizontal strip: index 0..frames-1
  srcRect(i) {
    const clamped = Math.max(0, Math.min(this.frames - 1, i|0));
    const sx = clamped * this.fw + 0.01; // bleed guard
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

    this.anims = new Map();  // name -> { sheet:StripSheet, frames:number, anim:Animation }
    this.currentName = null;
    this.invulnT = 0;

    this.hp = 5; this.maxHp = 5;
  }

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
    // Load manifests
    const [maniUsagi, maniNinja] = await Promise.all([
      loadJSON(PATHS.usagi),
      loadJSON(PATHS.ninja)
    ]);

    // Load sheets referenced by manifests
    const loadSheets = async (manifest) => {
      const entries = Object.entries(manifest); // {name:{frameSize:[w,h], frames, path}}
      const out = {};
      await Promise.all(entries.map(async ([name, meta]) => {
        const img = await loadImage(meta.path);
        out[name] = new StripSheet(img, meta.frameSize[0], meta.frameSize[1], meta.frames);
      }));
      return out;
    };
    const usagiSheets = await loadSheets(maniUsagi);
    const ninjaSheets = await loadSheets(maniNinja);

    // Backgrounds
    GAME.bgs = await Promise.all(PATHS.bgs.map(loadImage));

    // Build player from usagi sheets
    const p = new Actor();
    p.x = 80; p.y = 180; p.scale = 1;
    // animation speeds (tweak to taste)
    p.addAnim('idle',    usagiSheets.idle,    6, true);
    p.addAnim('walk',    usagiSheets.walk,    8, true);
    p.addAnim('run',     usagiSheets.run,     12,true);
    p.addAnim('attack',  usagiSheets.attack1, 12,false,true);
    p.addAnim('attack2', usagiSheets.attack2, 12,false,true);
    p.addAnim('jump',    usagiSheets.jump,    6, false, true);
    p.addAnim('hurt',    usagiSheets.hurt,    6, false, true);
    p.addAnim('death',   usagiSheets.death,   6, false, true);
    p.play('idle', true);
    p.maxHp = 6; p.hp = 6;
    GAME.player = p;

    // Build enemies (a few ninjas)
    GAME.enemies.length = 0;
    for (let i=0;i<3;i++){
      const e = new Actor();
      e.x = 160 + i*30; e.y = 180; e.scale=1;
      e.speed = 30;
      e.maxHp = 3; e.hp = 3;
      e.addAnim('idle',   ninjaSheets.idle,   5, true);
      e.addAnim('walk',   ninjaSheets.walk,   7, true);
      e.addAnim('attack', ninjaSheets.attack, 9, false, true);
      e.addAnim('hurt',   ninjaSheets.hurt,   6, false, true);
      e.addAnim('death',  ninjaSheets.death,  6, false, true);
      e.play('idle', true);
      e.ai = { state:'approach', timer: 0 };
      GAME.enemies.push(e);
    }

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

// -------------------- Update/Render ---------------------
function currentBg(){ return GAME.bgs[(GAME.levelIndex%GAME.bgs.length+GAME.bgs.length)%GAME.bgs.length] || null; }

function update(dt){
  if(GAME.state!=='play') return;

  // Scroll bg
  const bg = currentBg();
  if (bg) GAME.scrollX = (GAME.scrollX + dt * 18) % (bg.width||BASE_W);

  const p = GAME.player;
  if(p){
    // movement
    if(input.left){ p.vx=-p.speed; p.flipX=true; }
    else if(input.right){ p.vx=p.speed; p.flipX=false; }
    else p.vx=0;

    if(input.jump && p.onGround){ p.vy=p.jumpV; p.onGround=false; }

    // attack
    const busyAtk = (p.currentName==='attack' || p.currentName==='attack2') && !p.anims.get(p.currentName).anim.done;
    if(input.attack && !busyAtk){
      p.play(Math.random()<0.5?'attack':'attack2', true);
    }

    // auto state
    if(!busyAtk){
      if(!p.onGround) p.play('jump');
      else if (Math.abs(p.vx) > p.speed*0.75) p.play('run');
      else if (Math.abs(p.vx) > 0) p.play('walk');
      else p.play('idle');
    }

    p.updatePhysics(dt);
  }

  // Enemy AI & combat
  for(const e of GAME.enemies){
    if(e.hp<=0) continue;
    const dist = (GAME.player.x - e.x);
    e.flipX = dist < 0;

    e.ai.timer -= dt;
    const close = Math.abs(dist) < 22;

    if(e.invulnT>0){
      e.vx = (e.flipX ? -1 : 1) * -30;
      e.play('hurt');
    } else if(close && e.ai.timer <= 0){
      e.play('attack', true);
      e.vx = 0;
      e.ai.timer = 0.8;
    } else if (!close){
      e.play('walk');
      e.vx = Math.sign(dist) * e.speed;
    } else {
      e.vx = 0; if(e.currentName!=='attack') e.play('idle');
    }

    e.updatePhysics(dt);

    // Enemy hits player
    const atk = e.currentName==='attack' && !e.anims.get('attack').anim.done;
    if(atk && overlap(e.rect(20,36), p.rect(20,40)) && p.invulnT<=0){
      damageActor(p, 1, (p.x < e.x) ? -80 : 80);
    }
  }

  // Player sword hits enemies
  if(p){
    const atk1 = p.currentName==='attack'  && !p.anims.get('attack').anim.done;
    const atk2 = p.currentName==='attack2' && !p.anims.get('attack2').anim.done;
    const active = atk1 || atk2;
    if(active){
      const hit = playerSwordHitbox(p);
      for(const e of GAME.enemies){
        if(e.hp>0 && e.invulnT<=0 && overlap(hit, e.rect(20,40))){
          damageActor(e, 1, (e.x < p.x) ? -90 : 90);
        }
      }
    }
  }

  // Simple cleanup / respawn logic
  let living = 0; for(const e of GAME.enemies) if(e.hp>0) living++;
  if(living===0){
    // advance stage and respawn
    GAME.levelIndex = (GAME.levelIndex + 1) % GAME.bgs.length;
    for (const e of GAME.enemies) { e.hp = e.maxHp; e.x = 160 + Math.random()*40; }
  }

  if(p && p.hp<=0){
    p.hp = p.maxHp; p.x = 80; p.y = 180; // quick respawn
  }
}

function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  // Title shows first bg
  if(GAME.state==='title'){
    const bg0 = GAME.bgs[0];
    if(bg0) drawTiled(bg0, 0);
    drawUI();
    return;
  }

  const bg = currentBg();
  if (bg) drawTiled(bg, GAME.scrollX);

  // Ground
  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(0, ipx(182), BASE_W, BASE_H - 182);

  // Draw actors
  if(GAME.player) GAME.player.draw(ctx);
  for(const e of GAME.enemies){ if(e.hp>0) e.draw(ctx); }

  drawUI();
}

// -------------------- Combat helpers -------------------
function playerSwordHitbox(p){
  const reach = 30, height = 18;
  if(!p.flipX){
    return { x: p.x + 6, y: p.y - 36, w: reach, h: height };
  } else {
    return { x: p.x - 6 - reach, y: p.y - 36, w: reach, h: height };
  }
}
function overlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function damageActor(a, dmg, knockVx){
  a.hp = Math.max(0, a.hp - dmg);
  a.invulnT = 0.35;
  a.vx = knockVx;
  a.vy = -60;
  a.onGround = false;
  if (a.anims.has('hurt')) a.play('hurt', true);
}

// -------------------- UI -------------------------------
function drawUI(){
  drawHealthBar(10, 10, 80, 8, GAME.player ? GAME.player.hp : 0, GAME.player ? GAME.player.maxHp : 1);
  let alive = 0; for(const e of GAME.enemies) if(e.hp>0) alive++;
  drawHealthBar(BASE_W-90, 10, 80, 8, alive, Math.max(alive, 1));
}
function drawHealthBar(x,y,w,h,hp,maxHp){
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = '#111'; ctx.fillRect(ipx(x-1), ipx(y-1), w+2, h+2);
  ctx.fillStyle = '#4a0'; ctx.fillRect(ipx(x), ipx(y), Math.floor(w*pct), h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(ipx(x), ipx(y), w, h);
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
  if(GAME.state!=='play'){
    GAME.state='play';
    titleOverlay.classList.add('hidden');
    document.getElementById('touch-controls')?.classList.remove('hidden');
  }
}

boot();
requestAnimationFrame(loop);
