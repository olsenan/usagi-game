/* =========================================================
   Usagi Prototype – Per-Animation Sheets + Debug Arena
   - Normal play: title → stages with backgrounds and enemies
   - Debug arena: load test/test_moves_level.json
       * Enable via ?debug=1 in URL OR press F1 on title
   - Per-animation loaders (reads assets/sprites/{usagi|ninja}/manifest.json)
   - Air attacks for Usagi (if sheets exist): jump_slash, down_slash, jump_kick
   - Ninja AI for debug loops aerial attacks if available
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
  ],
  testConfig: 'test/test_moves_level.json'
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
function urlHasDebug() {
  try {
    const p = new URLSearchParams(location.search);
    return p.get('debug') === '1';
  } catch { return false; }
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
    // tiny inset to avoid bleeding
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

    this.anims = new Map();  // name -> { sheet:StripSheet, anim:Animation }
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
const input = { left:false, right:false, up:false, down:false, jump:false, attack:false, debug:false };
function handleKey(e, down){
  const k=e.code;
  if(k==='ArrowLeft'||k==='KeyA'){ input.left=down; e.preventDefault(); }
  if(k==='ArrowRight'||k==='KeyD'){ input.right=down; e.preventDefault(); }
  if(k==='ArrowUp'||k==='KeyW'){ input.up=down; e.preventDefault(); }
  if(k==='ArrowDown'||k==='KeyS'){ input.down=down; e.preventDefault(); }
  if(k==='Space'){ input.jump=down; e.preventDefault(); }
  if(['KeyJ','KeyK','KeyF','KeyH','KeyZ','KeyX'].includes(k)){ input.attack=down; e.preventDefault(); }
  if(k==='Enter' && down) startGame();
  if(k==='Backquote') input.debug=down;
  if(k==='F1' && down && GAME.state==='title'){ startDebugArena(); }
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
  enemies: [],
  // assets
  usagiSheets: null,
  ninjaSheets: null,
  // debug
  debugRequested: urlHasDebug(),
  inDebugArena: false,
  testConfig: null
};

// -------------------- Boot ------------------------------
let lastTime=0;
function loop(now){
  const dt=Math.min(0.05,(now-lastTime)/1000)||0.0167; lastTime=now;
  update(dt); render(); requestAnimationFrame(loop);
}

async function boot(){
  try{
    // Load manifests (if missing, engine still runs, just with fewer anims)
    let maniUsagi = {}, maniNinja = {};
    try { maniUsagi = await loadJSON(PATHS.usagi); } catch(e){ console.warn(e.message); }
    try { maniNinja = await loadJSON(PATHS.ninja); } catch(e){ console.warn(e.message); }

    // Load sheets referenced by manifests
    const loadSheets = async (manifest) => {
      const out = {};
      const entries = Object.entries(manifest);
      await Promise.all(entries.map(async ([name, meta]) => {
        const img = await loadImage(meta.path);
        out[name] = new StripSheet(img, meta.frameSize[0], meta.frameSize[1], meta.frames);
      }));
      return out;
    };
    GAME.usagiSheets = await loadSheets(maniUsagi);
    GAME.ninjaSheets = await loadSheets(maniNinja);

    // Backgrounds
    GAME.bgs = await Promise.all(PATHS.bgs.map(loadImage));

    // Build player
    const p = new Actor();
    p.x = 80; p.y = 180; p.scale = 1;
    // Add anims defensively (only if available)
    addUsagiAnims(p, GAME.usagiSheets);
    p.play(p.hasAnim('idle') ? 'idle' : firstAnimName(p), true);
    p.maxHp = 6; p.hp = 6;
    GAME.player = p;

    // Build default enemies for main game (not debug)
    GAME.enemies.length = 0;
    for (let i=0;i<3;i++){
      const e = new Actor();
      e.x = 160 + i*30; e.y = 180; e.scale=1;
      e.speed = 30; e.maxHp = 3; e.hp = 3;
      addNinjaAnims(e, GAME.ninjaSheets);
      e.play(e.hasAnim('idle') ? 'idle' : firstAnimName(e), true);
      e.ai = { state:'approach', timer: 0 };
      GAME.enemies.push(e);
    }

    // If ?debug=1, start straight into arena
    if (GAME.debugRequested) {
      await startDebugArena(true);
    } else {
      GAME.state='title';
      titleOverlay?.classList.remove('hidden');
    }
  } catch (e) {
    GAME.report.push('Fatal load error: ' + e.message);
    reportLogEl.textContent = GAME.report.join('\n');
    reportOverlay.classList.remove('hidden');
    GAME.state = 'title';
  }
  requestAnimationFrame(loop);
}

function addUsagiAnims(p, sheets){
  // Grounded
  if(sheets.idle)    p.addAnim('idle',    sheets.idle,    6, true);
  if(sheets.walk)    p.addAnim('walk',    sheets.walk,    8, true);
  if(sheets.run)     p.addAnim('run',     sheets.run,     12,true);
  if(sheets.attack1) p.addAnim('attack1', sheets.attack1, 12,false,true);
  if(sheets.attack2) p.addAnim('attack2', sheets.attack2, 12,false,true);
  if(sheets.hurt)    p.addAnim('hurt',    sheets.hurt,    6, false, true);
  if(sheets.death)   p.addAnim('death',   sheets.death,   6, false, true);
  // Air
  if(sheets.jump)        p.addAnim('jump',        sheets.jump,        8, false, true);
  if(sheets.jump_slash)  p.addAnim('jump_slash',  sheets.jump_slash,  12,false,true);
  if(sheets.down_slash)  p.addAnim('down_slash',  sheets.down_slash,  12,false,true);
  if(sheets.jump_kick)   p.addAnim('jump_kick',   sheets.jump_kick,   12,false,true);
}

function addNinjaAnims(e, sheets){
  // Grounded
  if(sheets.idle)   e.addAnim('idle',   sheets.idle,   5, true);
  if(sheets.walk)   e.addAnim('walk',   sheets.walk,   7, true);
  if(sheets.run)    e.addAnim('run',    sheets.run,    10, true);
  if(sheets.attack) e.addAnim('attack', sheets.attack, 9, false, true);
  if(sheets.hurt)   e.addAnim('hurt',   sheets.hurt,   6, false, true);
  if(sheets.death)  e.addAnim('death',  sheets.death,  6, false, true);
  // Air (optional)
  if(sheets.jump)           e.addAnim('jump',           sheets.jump,           8, false, true);
  if(sheets.jump_slash)     e.addAnim('jump_slash',     sheets.jump_slash,     12,false,true);
  if(sheets.down_slash)     e.addAnim('down_slash',     sheets.down_slash,     12,false,true);
  if(sheets.jump_kick)      e.addAnim('jump_kick',      sheets.jump_kick,      12,false,true);
}

function firstAnimName(actor){
  for (const k of actor.anims.keys()) return k;
  return null;
}

// -------------------- Start states ----------------------
function startGame(){
  if(GAME.state!=='play'){
    GAME.state='play';
    GAME.inDebugArena = false;
    titleOverlay?.classList.add('hidden');
    document.getElementById('touch-controls')?.classList.remove('hidden');
  }
}

async function startDebugArena(skipTitle=false){
  try {
    const cfg = await loadJSON(PATHS.testConfig);
    GAME.testConfig = cfg;
    GAME.inDebugArena = true;

    // Reset positions
    const p = GAME.player;
    if (cfg.player_spawn){
      p.x = cfg.player_spawn.x ?? 80;
      p.y = cfg.player_spawn.y ?? 180;
      p.vx = 0; p.vy = 0; p.onGround = true;
    }

    // One enemy that loops aerial moves
    GAME.enemies.length = 0;
    const e = new Actor();
    e.scale = 1;
    addNinjaAnims(e, GAME.ninjaSheets);
    const ex = (cfg.enemies && cfg.enemies[0] && cfg.enemies[0].x) ?? 180;
    const ey = (cfg.enemies && cfg.enemies[0] && cfg.enemies[0].y) ?? 180;
    e.x = ex; e.y = ey; e.speed = 0; e.hp = 99; e.maxHp = 99;
    e.play(e.hasAnim('idle') ? 'idle' : firstAnimName(e), true);
    e.ai = { state: 'air_loop', t: 0, seq: ['jump_slash','down_slash','jump_kick'].filter(n=>e.hasAnim(n)), i: 0 };
    GAME.enemies.push(e);

    if (skipTitle || GAME.state!=='play') {
      GAME.state = 'play';
      titleOverlay?.classList.add('hidden');
      document.getElementById('touch-controls')?.classList.remove('hidden');
    }
  } catch (err){
    GAME.report.push('Debug arena load error: ' + err.message);
    reportLogEl.textContent = GAME.report.join('\n');
    reportOverlay.classList.remove('hidden');
  }
}

// -------------------- Update/Render ---------------------
function currentBg(){
  if (GAME.inDebugArena && GAME.testConfig && GAME.testConfig.bg) return GAME.testConfig.bgImg || null;
  return GAME.bgs[(GAME.levelIndex%GAME.bgs.length+GAME.bgs.length)%GAME.bgs.length] || null;
}

function wantAirAttack(player){
  // Pick air attack by context (simple rules):
  // - Descending: down_slash (if available)
  // - Moving horizontally: jump_slash (if available)
  // - Otherwise: jump_kick (if available) as fallback
  const descending = player.vy > 10;
  const moving = Math.abs(player.vx) > 1;

  if (descending && player.hasAnim('down_slash')) return 'down_slash';
  if (moving && player.hasAnim('jump_slash')) return 'jump_slash';
  if (player.hasAnim('jump_kick')) return 'jump_kick';
  // fallback to plain jump if nothing
  return player.hasAnim('jump') ? 'jump' : null;
}

function update(dt){
  if(GAME.state!=='play') return;

  // Lazy-load debug bg image if path string provided
  if (GAME.inDebugArena && GAME.testConfig && typeof GAME.testConfig.bg === 'string' && !GAME.testConfig.bgImg){
    loadImage(GAME.testConfig.bg).then(img => { GAME.testConfig.bgImg = img; }).catch(()=>{});
  }

  // Scroll bg
  const bg = currentBg();
  if (bg && bg.width) GAME.scrollX = (GAME.scrollX + dt * 18) % (bg.width||BASE_W);

  const p = GAME.player;
  if(p){
    // movement
    if(input.left){ p.vx=-p.speed; p.flipX=true; }
    else if(input.right){ p.vx=p.speed; p.flipX=false; }
    else p.vx=0;

    if(input.jump && p.onGround){ p.vy=p.jumpV; p.onGround=false; }

    // attack logic
    const busy = (n)=> p.currentName===n && !p.anims.get(n).anim.done;
    const attacking = busy('attack1') || busy('attack2') || busy('jump_slash') || busy('down_slash') || busy('jump_kick');

    if(input.attack && !attacking){
      if(!p.onGround){
        const air = wantAirAttack(p);
        if (air) p.play(air, true);
      } else {
        // alternate between attack1/attack2 if both exist
        const pick = (p._lastAtk === 1 && p.hasAnim('attack2')) ? 'attack2'
                    : p.hasAnim('attack1') ? 'attack1'
                    : p.hasAnim('attack2') ? 'attack2'
                    : (p.hasAnim('attack') ? 'attack' : null);
        if (pick){ p.play(pick, true); p._lastAtk = (pick==='attack1') ? 1 : 2; }
      }
    }

    // auto state when not attacking
    if(!attacking){
      if(!p.onGround && p.hasAnim('jump')) p.play('jump');
      else if (Math.abs(p.vx) > p.speed*0.75 && p.hasAnim('run')) p.play('run');
      else if (Math.abs(p.vx) > 0 && p.hasAnim('walk')) p.play('walk');
      else if (p.hasAnim('idle')) p.play('idle');
    }

    p.updatePhysics(dt);
  }

  // Enemy logic
  for(const e of GAME.enemies){
    if(e.hp<=0) continue;

    if (!GAME.inDebugArena) {
      // Normal simple AI
      const dist = (GAME.player.x - e.x);
      e.flipX = dist < 0;
      e.ai.timer = (e.ai.timer || 0) - dt;
      const close = Math.abs(dist) < 22;

      if(e.invulnT>0){
        e.vx = (e.flipX ? -1 : 1) * -30;
        if(e.hasAnim('hurt')) e.play('hurt');
      } else if(close && e.ai.timer <= 0){
        if(e.hasAnim('attack')) e.play('attack', true);
        e.vx = 0; e.ai.timer = 0.8;
      } else if (!close){
        if(e.hasAnim('walk')) e.play('walk');
        e.vx = Math.sign(dist) * (e.speed||28);
      } else {
        e.vx = 0;
        if(e.currentName!=='attack' && e.hasAnim('idle')) e.play('idle');
      }
    } else {
      // Debug arena: loop aerial moves
      const seq = e.ai.seq || [];
      if (seq.length > 0) {
        e.ai.t = (e.ai.t || 0) - dt;
        if (e.ai.t <= 0) {
          const name = seq[e.ai.i % seq.length];
          if (e.hasAnim(name)) {
            e.play(name, true);
            e.vy = -80; // hop slightly for air moves
            e.onGround = false;
          }
          e.ai.i = (e.ai.i + 1) % seq.length;
          e.ai.t = 0.9;
        }
      } else {
        if(e.hasAnim('idle')) e.play('idle');
      }
      e.vx = 0;
    }

    e.updatePhysics(dt);
  }

  // Minimal collision demo (optional): sword hitbox
  // (Left out in debug arena to keep focus on visuals)
}

function render(){
  ctx.clearRect(0,0,BASE_W,BASE_H);

  if(GAME.state==='title'){
    const bg0 = GAME.bgs[0];
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

  drawUI();
}

function drawTitleHint(){
  // Tiny overlay hint: Press F1 for Debug Arena
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(6, BASE_H-18, 170, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.fillText('Press F1 for Debug Arena', 10, BASE_H-9);
}

// -------------------- UI -------------------------------
function drawUI(){
  // In main mode show health bars; in debug keep it clean
  if (GAME.inDebugArena) return;
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
    ctx.drawImage(img, 0,0,img.width,img.height, x, 0, draw
