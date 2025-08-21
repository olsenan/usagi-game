/* =========================================================
   Usagi Prototype – Mobile start + Loader + Debug HUD
   - Loads backgrounds from assets/background/
   - Loads sprite sheets via manifests
   - On-screen HUD log for mobile debugging
   - Touch controls + simple AI
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const BASE_W = 256, BASE_H = 224;

  const root   = document.getElementById('game-root');
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d', { alpha: true });
  const overlay = document.getElementById('title-overlay');
  const startBtn = document.getElementById('start-btn');
  const touchLayer = document.getElementById('touch-controls');
  const report = document.getElementById('load-report');
  const hudLog = document.getElementById('hud-log');

  const log = (...a)=>{ const s=a.join(' '); console.log(s); hudLog.textContent = (hudLog.textContent+'\n'+s).trim().slice(-800); };

  // probe CSS
  report.textContent = `CSS: ${getComputedStyle(document.body).backgroundColor} • JS: OK`;

  // prevent browser gestures eating taps
  ['touchstart','touchmove','gesturestart'].forEach(evt=>{
    root.addEventListener(evt, (e)=>e.preventDefault(), {passive:false});
  });

  // sizing
  function resizeCanvas() {
    canvas.width = BASE_W; canvas.height = BASE_H;
    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth  / BASE_W,
      window.innerHeight / BASE_H
    )));
    const w = BASE_W * scale, h = BASE_H * scale;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    root.style.width    = canvas.style.width;
    root.style.height   = canvas.style.height;

    const shortest = Math.min(w, h);
    const btn = Math.max(48, Math.min(96, Math.floor(shortest / 6)));
    const gap = Math.max(10, Math.floor(btn * 0.25));
    root.style.setProperty('--btn', `${btn}px`);
    root.style.setProperty('--gap', `${gap}px`);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // paths
  const PATHS = {
    usagi:  'assets/sprites/usagi/manifest.json',
    ninja:  'assets/sprites/ninja/manifest.json',
    bgs: [
      'assets/background/background1.png',
      'assets/background/background2.png',
      'assets/background/background3.png',
      'assets/background/background4.png',
      'assets/background/background5.png',
      'assets/background/background6.png'
    ],
  };

  // helpers
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = ()=>resolve({ok:true, img});
      img.onerror = ()=>{ log('ERR img:', src); resolve({ok:false}); };
      img.src = src;
    });
  }
  async function loadJSON(src) {
    try {
      const res = await fetch(src, { cache:'no-store' });
      if(!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      log('ERR json:', src);
      return null;
    }
  }

  // sprite system
  class StripSheet {
    constructor(img, fw, fh, frames){ this.img=img; this.fw=fw; this.fh=fh; this.frames=frames||1; }
    srcRect(i){ const j=Math.max(0, Math.min(this.frames-1, i|0)); return { sx:j*this.fw+0.01, sy:0.01, sw:this.fw-0.02, sh:this.fh-0.02 }; }
  }
  class Animation {
    constructor(frames, fps=8, loop=true){ this.frames=frames; this.fps=fps; this.loop=loop; this.t=0; this.i=0; this.done=false; }
    update(dt){ if(this.done) return; this.t+=dt; const adv=Math.floor(this.t*this.fps); if(adv>0){ this.t-=adv/this.fps; this.i+=adv; if(this.i>=this.frames.length){ if(this.loop) this.i%=this.frames.length; else { this.i=this.frames.length-1; this.done=true; } } } }
    cur(){ return this.frames[Math.min(this.i,this.frames.length-1)]; }
    reset(){ this.t=0; this.i=0; this.done=false; }
  }
  class Actor {
    constructor(){ this.x=80; this.y=180; this.vx=0; this.vy=0; this.onGround=true; this.flip=false; this.scale=1; this.speed=46; this.jumpV=-130; this.gravity=340; this.anims=new Map(); this.current=null; this.shadow=true; }
    add(name, sheet, fps=8, loop=true){ const frames = Array.from({length:sheet.frames}, (_,i)=>i); this.anims.set(name, {sheet, anim:new Animation(frames, fps, loop)}); }
    has(name){ return this.anims.has(name); }
    play(name, restart=false){ if(!this.has(name)) return; if(this.current!==name||restart){ this.anims.get(name).anim.reset(); this.current=name; } }
    update(dt){
      this.x += this.vx*dt; this.vy += this.gravity*dt; this.y += this.vy*dt;
      if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
      if(this.current) this.anims.get(this.current).anim.update(dt);
    }
    draw(ctx){
      if(!this.current){ // fallback placeholder
        ctx.fillStyle='#7cf'; ctx.fillRect(this.x-8, this.y-28, 16, 28);
        return;
      }
      const {sheet, anim} = this.anims.get(this.current);
      const f = anim.cur(); const r = sheet.srcRect(f);
      const dw=sheet.fw*this.scale, dh=sheet.fh*this.scale;
      if(this.shadow){ const shw=Math.round(dw*0.55), shh=Math.round(dh*0.15); ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect(Math.round(this.x-shw/2), Math.round(this.y-2), shw, shh); }
      ctx.save(); ctx.translate(Math.round(this.x), Math.round(this.y)); if(this.flip) ctx.scale(-1,1);
      ctx.drawImage(sheet.img, r.sx,r.sy,r.sw,r.sh, Math.round(-dw*0.5), Math.round(-dh), Math.round(dw), Math.round(dh));
      ctx.restore();
    }
  }

  // input
  const input = { left:false, right:false, jump:false, attack:false };
  function bindHold(id, setFlag){
    const el=document.getElementById(id); if(!el) return;
    const on =(e)=>{ e.preventDefault(); setFlag(true); };
    const off=(e)=>{ e.preventDefault(); setFlag(false); };
    el.addEventListener('pointerdown', on, {passive:false});
    el.addEventListener('pointerup', off, {passive:false});
    el.addEventListener('pointercancel', off, {passive:false});
    el.addEventListener('pointerleave', off, {passive:false});
  }
  bindHold('btn-left',  v=>input.left=v);
  bindHold('btn-right', v=>input.right=v);
  bindHold('btn-jump',  v=>input.jump=v);
  bindHold('btn-attack',v=>input.attack=v);
  window.addEventListener('keydown', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=true;
    if(k==='ArrowRight'||k==='KeyD') input.right=true;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=true;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=true;
    if(k==='Enter' && !overlay.classList.contains('hidden')) startGame(e);
  }, {passive:false});
  window.addEventListener('keyup', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=false;
    if(k==='ArrowRight'||k==='KeyD') input.right=false;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=false;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=false;
  }, {passive:false});

  // start wiring
  const opts = { passive:false };
  const startGame = (e)=>{ e?.preventDefault?.(); overlay.classList.remove('visible'); overlay.classList.add('hidden'); touchLayer.classList.remove('hidden'); state='play'; };
  ['click','pointerup','touchend'].forEach(ev=>{
    startBtn.addEventListener(ev, startGame, opts);
    overlay.addEventListener(ev, startGame, opts);
  });

  // global state
  let state='title';
  let last=0, scrollX=0;
  const player = new Actor();
  const enemies = [];
  const sheets = { usagi:{}, ninja:{} };
  const bgs = [];

  // boot
  (async function boot(){
    // backgrounds
    for (const p of PATHS.bgs) {
      const r = await loadImage(p);
      if (r.ok) { bgs.push(r.img); } else { bgs.push(null); }
    }
    log('BGs loaded:', bgs.filter(Boolean).length, '/', PATHS.bgs.length);

    // manifests
    const maniUsagi = await loadJSON(PATHS.usagi);
    const maniNinja = await loadJSON(PATHS.ninja);

    async function loadSheets(manifest, bucket){
      if(!manifest){ log('No manifest for', bucket); return; }
      const entries = Object.entries(manifest);
      for (const [name, meta] of entries) {
        const imgRes = await loadImage(meta.path);
        if (imgRes.ok) {
          bucket[name] = new StripSheet(imgRes.img, meta.frameSize[0], meta.frameSize[1], meta.frames);
        } else {
          log('Missing image for', bucket, name, meta.path);
        }
      }
      log('Loaded', Object.keys(bucket).length, 'anims for', bucket===sheets.usagi?'usagi':'ninja');
    }

    await loadSheets(maniUsagi, sheets.usagi);
    await loadSheets(maniNinja, sheets.ninja);

    // attach anims
    for (const [name, sheet] of Object.entries(sheets.usagi)) player.add(name, sheet, 8, true);
    player.play(player.has('idle')?'idle':(player.has('walk')?'walk':(player.has('run')?'run':null)), true);

    const nin = new Actor();
    for (const [name, sheet] of Object.entries(sheets.ninja)) nin.add(name, sheet, 8, true);
    nin.x = 180; nin.y = 180; nin.play(nin.has('idle')?'idle':(nin.has('walk')?'walk':'run'), true);
    enemies.push(nin);

    log('BOOT OK');
  })();

  // loop
  function loop(t){
    const dt = Math.min(0.05, (t-last)/1000)||0.0167; last = t;
    if(state==='play') update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt){
    // movement
    if(input.left){ player.vx = -player.speed; player.flip = true; } else
    if(input.right){ player.vx =  player.speed; player.flip = false; } else player.vx = 0;

    if(input.jump && player.onGround){ player.vy = player.jumpV; player.onGround=false; }

    // choose anims if present
    const busy = player.current && !player.anims.get(player.current).anim.loop;
    if(input.attack && player.has('attack1') && !busy){ player.play('attack1', true); }
    if(!busy){
      if(!player.onGround && player.has('jump')) player.play('jump');
      else if (Math.abs(player.vx) > player.speed*0.75 && player.has('run')) player.play('run');
      else if (Math.abs(player.vx) > 0 && player.has('walk')) player.play('walk');
      else if (player.has('idle')) player.play('idle');
    }

    player.update(dt);
    for(const e of enemies){
      const dist = player.x - e.x;
      e.flip = dist < 0;
      e.vx = Math.sign(dist) * 24;
      if (e.has('walk')) e.play('walk');
      e.update(dt);
    }

    // scroll bg
    if (bgs[0] && bgs[0].width) scrollX = (scrollX + dt * 18) % (bgs[0].width||BASE_W);
  }

  function render(){
    ctx.clearRect(0,0,BASE_W,BASE_H);

    // BG
    const bg = bgs[0];
    if(bg){
      const scale = BASE_H / bg.height;
      const tileW = Math.ceil(bg.width*scale);
      const offset = -Math.floor((scrollX*scale)%tileW);
      for(let x=offset; x<BASE_W; x+=tileW) ctx.drawImage(bg, 0,0,bg.width,bg.height, x, 0, tileW, BASE_H);
    } else {
      ctx.fillStyle='#203529'; ctx.fillRect(0,0,BASE_W,BASE_H);
    }
    // ground strip
    ctx.fillStyle='#2e2e2e'; ctx.fillRect(0, 182, BASE_W, BASE_H-182);

    // draw
    player.draw(ctx);
    enemies.forEach(e=>e.draw(ctx));
  }
});
