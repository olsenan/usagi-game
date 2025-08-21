// Usagi Prototype — Title -> Loading -> Play
// Robust loader (allSettled), progress bar, always-running loop.
// Mobile-friendly input, fallback sprites, no animation clipping.

document.addEventListener('DOMContentLoaded', () => {
  const BASE_W = 256, BASE_H = 224;

  // DOM
  const root = document.getElementById('root');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });

  const uiTitle   = document.getElementById('ui-title');
  const btnStart  = document.getElementById('btn-start');

  const uiLoading = document.getElementById('ui-loading');
  const barFill   = document.getElementById('bar-fill');
  const loadText  = document.getElementById('load-text');

  const touchUI   = document.getElementById('touch');
  const hud       = document.getElementById('hud');
  const log = (...a)=>{ const s=a.join(' '); console.log(s); hud.textContent = (hud.textContent+'\n'+s).trim().slice(-900); };

  // Sizes
  function resize() {
    canvas.width = BASE_W; canvas.height = BASE_H;
    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth / BASE_W,
      window.innerHeight / BASE_H
    )));
    const w = BASE_W*scale, h = BASE_H*scale;
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    root.style.width = canvas.style.width; root.style.height = canvas.style.height;

    const shortest = Math.min(w,h);
    const btn = Math.max(48, Math.min(96, Math.floor(shortest/6)));
    const gap = Math.max(10, Math.floor(btn*0.25));
    root.style.setProperty('--btn', `${btn}px`);
    root.style.setProperty('--gap', `${gap}px`);
  }
  window.addEventListener('resize', resize, {passive:true});
  resize();

  // State machine
  let state = 'TITLE';   // 'TITLE' | 'LOADING' | 'PLAY'
  let last = 0;

  // Input
  const input = { left:false, right:false, jump:false, attack:false };
  function bindHold(id, setter){
    const el = document.getElementById(id); if(!el) return;
    const down = e=>{e.preventDefault(); setter(true);};
    const up   = e=>{e.preventDefault(); setter(false);};
    el.addEventListener('pointerdown',down,{passive:false});
    el.addEventListener('pointerup',up,{passive:false});
    el.addEventListener('pointercancel',up,{passive:false});
    el.addEventListener('pointerleave',up,{passive:false});
  }
  bindHold('left',  v=>input.left=v);
  bindHold('right', v=>input.right=v);
  bindHold('jump',  v=>input.jump=v);
  bindHold('attack',v=>input.attack=v);
  window.addEventListener('keydown', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=true;
    if(k==='ArrowRight'||k==='KeyD') input.right=true;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=true;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=true;
    if((k==='Enter'||k==='NumpadEnter') && state==='TITLE') startFromTitle(e);
  }, {passive:false});
  window.addEventListener('keyup', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=false;
    if(k==='ArrowRight'||k==='KeyD') input.right=false;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=false;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=false;
  }, {passive:false});

  // Title -> Loading
  const startFromTitle = (e)=>{
    e?.preventDefault?.();
    if(state!=='TITLE') return;
    uiTitle.classList.remove('visible');
    uiLoading.classList.add('visible');
    state='LOADING';
    bootstrap();
  };
  ['click','pointerup','touchend'].forEach(ev=>{
    btnStart.addEventListener(ev, startFromTitle, {passive:false});
    uiTitle.addEventListener(ev, startFromTitle, {passive:false}); // tap anywhere
  });

  // Loader
  const MANIFEST_PATH = 'assets/manifest/manifest.json';
  let manifest = null;
  const images = new Map();

  function loadImage(path){
    return new Promise(resolve=>{
      const img = new Image();
      img.onload = ()=>resolve({ok:true, path, img});
      img.onerror = ()=>resolve({ok:false, path, img:null});
      img.src = path;
    });
  }

  async function bootstrap(){
    // Fetch manifest (non-blocking fallback if missing)
    try {
      const res = await fetch(MANIFEST_PATH, { cache:'no-store' });
      manifest = res.ok ? await res.json() : null;
      if(!manifest) log('WARN: manifest missing, using placeholders only.');
    } catch {
      log('WARN: manifest fetch failed, using placeholders only.');
    }

    // Build a flat list of image paths to load
    const paths = [];
    if (manifest) {
      for (const char of Object.keys(manifest)) {
        for (const key of Object.keys(manifest[char])) {
          const p = manifest[char][key].src;
          if (p) paths.push(p);
        }
      }
    }
    // Backgrounds (optional, won’t block)
    const bgPaths = [
      'assets/background/background1.png',
      'assets/background/background2.png',
      'assets/background/background3.png',
      'assets/background/background4.png',
      'assets/background/background5.png',
      'assets/background/background6.png'
    ];
    for (const p of bgPaths) paths.push(p);

    // Progress
    const total = paths.length;
    let done = 0;
    const updateBar = ()=>{
      const pct = total ? Math.round((done/total)*100) : 100;
      barFill.style.width = pct+'%';
      loadText.textContent = `${done} / ${total}`;
    };
    updateBar();

    // Load all with allSettled (no freeze on 404)
    const results = await Promise.allSettled(paths.map(p=>loadImage(p).then(r=>{ done++; updateBar(); return r; })));
    for (const r of results) {
      if (r.status==='fulfilled' && r.value.ok) images.set(r.value.path, r.value.img);
    }
    log('Loaded images:', images.size, '/', total);

    // Enter play regardless of load success
    uiLoading.classList.remove('visible');
    touchUI.classList.remove('hidden');
    state='PLAY';
  }

  // Simple sprite system (strip sheet)
  class StripSheet {
    constructor(img, fw, fh, frames){ this.img=img; this.fw=fw; this.fh=fh; this.frames=frames||1; }
    rect(i){ const j=Math.max(0, Math.min(this.frames-1, i|0)); return {sx:j*this.fw+0.01, sy:0.01, sw:this.fw-0.02, sh:this.fh-0.02}; }
  }
  class Animation {
    constructor(frames,fps=8,loop=true){ this.frames=frames; this.fps=fps; this.loop=loop; this.t=0; this.i=0; this.done=false; }
    step(dt){ if(this.done) return; this.t+=dt; const adv=(this.t*this.fps)|0; if(adv>0){ this.t-=adv/this.fps; this.i+=adv; if(this.i>=this.frames.length){ if(this.loop) this.i%=this.frames.length; else { this.i=this.frames.length-1; this.done=true; } } } }
    cur(){ return this.frames[Math.min(this.i,this.frames.length-1)]; }
    reset(){ this.t=0; this.i=0; this.done=false; }
  }
  class Actor {
    constructor(){ this.x=80; this.y=180; this.vx=0; this.vy=0; this.onGround=true; this.flip=false; this.scale=1; this.speed=46; this.jumpV=-130; this.gravity=340; this.anims=new Map(); this.cur=null; this.shadow=true; }
    add(name, sheet, fps=8, loop=true){ const frames=Array.from({length:sheet.frames},(_,i)=>i); this.anims.set(name,{sheet,anim:new Animation(frames,fps,loop)}); }
    has(name){ return this.anims.has(name); }
    play(name,restart=false){ if(!this.has(name)) return; if(this.cur!==name||restart){ this.anims.get(name).anim.reset(); this.cur=name; } }
    update(dt){
      this.x += this.vx*dt; this.vy += this.gravity*dt; this.y += this.vy*dt;
      if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
      if(this.cur) this.anims.get(this.cur).anim.step(dt);
    }
    draw(ctx){
      if(!this.cur){ // placeholder box
        ctx.fillStyle='#7cf'; ctx.fillRect(this.x-8, this.y-28, 16, 28); return;
      }
      const {sheet,anim}=this.anims.get(this.cur); const f=anim.cur(); const r=sheet.rect(f);
      const dw=sheet.fw*this.scale, dh=sheet.fh*this.scale;
      if(this.shadow){ const shw=(dw*0.55)|0, shh=(dh*0.15)|0; ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect((this.x-(shw>>1))|0, (this.y-2)|0, shw, shh); }
      ctx.save(); ctx.translate(this.x|0, this.y|0); if(this.flip) ctx.scale(-1,1);
      ctx.drawImage(sheet.img, r.sx,r.sy,r.sw,r.sh, (-dw*0.5)|0, (-dh)|0, dw|0, dh|0);
      ctx.restore();
    }
  }

  // Build sheets from manifest if present
  function buildSheets(charKey){
    const out = {};
    if(!manifest || !manifest[charKey]) return out;

    for(const [name, meta] of Object.entries(manifest[charKey])){
      const img = images.get(meta.src);
      if(!img) continue;
      out[name] = new StripSheet(img, meta.frameWidth, meta.frameHeight, meta.frames);
    }
    // aliases to avoid missing anims freezing logic
    out.walk  = out.walk  || out.run || out.idle || Object.values(out)[0];
    out.idle  = out.idle  || out.walk || Object.values(out)[0];
    out.jump  = out.jump  || out.run  || out.walk || out.idle;
    return out;
  }

  // Scene objects
  const player = new Actor();
  const enemies = [];

  // Loop
  let scroll=0;
  function update(dt){
    if(state==='PLAY'){
      // Once manifest is ready, attach anims exactly once
      if(player.anims.size===0){
        const usagi = buildSheets('usagi');
        for(const [name,sheet] of Object.entries(usagi||{})) player.add(name,sheet,8,true);
        if(player.has('idle')) player.play('idle'); else if(player.has('walk')) player.play('walk'); else if(player.has('run')) player.play('run');
        // One test enemy
        const e = new Actor(); const nin = buildSheets('ninja');
        for(const [name,sheet] of Object.entries(nin||{})) e.add(name,sheet,8,true);
        e.x=180; e.y=180; if(e.has('idle')) e.play('idle'); else if(e.has('walk')) e.play('walk'); else if(e.has('run')) e.play('run');
        enemies.push(e);
      }

      // simple input
      if(input.left){ player.vx=-player.speed; player.flip=true; }
      else if(input.right){ player.vx=player.speed; player.flip=false; }
      else player.vx=0;

      if(input.jump && player.onGround){ player.vy=player.jumpV; player.onGround=false; }

      const busy = player.cur && !player.anims.get(player.cur).anim.loop;
      if(input.attack && player.has('attack') && !busy) player.play('attack',true);
      if(!busy){
        if(!player.onGround && player.has('jump')) player.play('jump');
        else if(Math.abs(player.vx)>player.speed*0.75 && player.has('run')) player.play('run');
        else if(Math.abs(player.vx)>0 && player.has('walk')) player.play('walk');
        else if(player.has('idle')) player.play('idle');
      }

      player.update(dt);
      enemies.forEach(e=>{
        const d = player.x - e.x; e.flip = d<0; e.vx = Math.sign(d)*24;
        if(e.has('walk')) e.play('walk'); e.update(dt);
      });

      scroll = (scroll + dt*18) % 512;
    }
  }

  function render(){
    // BG (tile any first background found)
    ctx.clearRect(0,0,BASE_W,BASE_H);
    let bgImg = null;
    for (let i=1;i<=6;i++){ const p=`assets/background/background${i}.png`; if(images.get(p)){ bgImg=images.get(p); break; } }
    if(bgImg){
      const scale = BASE_H / bgImg.height;
      const tw = Math.ceil(bgImg.width*scale);
      const off = -((scroll*scale)|0)%tw;
      for(let x=off; x<BASE_W; x+=tw) ctx.drawImage(bgImg,0,0,bgImg.width,bgImg.height,x,0,tw,BASE_H);
    } else { ctx.fillStyle='#203529'; ctx.fillRect(0,0,BASE_W,BASE_H); }
    ctx.fillStyle='#2e2e2e'; ctx.fillRect(0,182,BASE_W,BASE_H-182);

    // Actors
    player.draw(ctx);
    enemies.forEach(e=>e.draw(ctx));
  }

  function loop(t){
    const dt = Math.min(0.05, (t-last)/1000)||0.0167; last=t;
    update(dt); render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
