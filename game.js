document.addEventListener('DOMContentLoaded', () => {
  const BASE_W = 256, BASE_H = 224;
  const VERSION = 'strip1';

  // DOM
  const root = document.getElementById('root');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const uiTitle   = document.getElementById('ui-title');
  const btnStart  = document.getElementById('btn-start');
  const uiLoading = document.getElementById('ui-loading');
  const barFill   = document.getElementById('bar-fill');
  const loadText  = document.getElementById('load-text');
  const touchUI   = document.getElementById('touch');
  const hud       = document.getElementById('hud');
  const log = (...a)=>{ const s=a.join(' '); console.log(s); hud.textContent=(hud.textContent+'\n'+s).trim().slice(-1400); };

  /* ---------- layout ---------- */
  function resize() {
    canvas.width = BASE_W; canvas.height = BASE_H;
    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth / BASE_W, window.innerHeight / BASE_H
    )));
    const w = BASE_W * scale, h = BASE_H * scale;
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    root.style.width = canvas.style.width; root.style.height = canvas.style.height;

    const shortest = Math.min(w,h);
    const btn = Math.max(48, Math.min(96, Math.floor(shortest/6)));
    const gap = Math.max(10, Math.floor(btn*0.25));
    root.style.setProperty('--btn', `${btn}px`);
    root.style.setProperty('--gap', `${gap}px`);
  }
  window.addEventListener('resize', resize, { passive:true });
  resize();

  /* ---------- input ---------- */
  const input = { left:false, right:false, jump:false, attack:false };
  function hold(id, setter){
    const el = document.getElementById(id); if(!el) return;
    const down = e=>{ e.preventDefault(); setter(true); };
    const up   = e=>{ e.preventDefault(); setter(false); };
    ['pointerdown','pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev, ev.includes('down')?down:up, {passive:false}));
  }
  hold('left', v=>input.left=v);
  hold('right',v=>input.right=v);
  hold('jump', v=>input.jump=v);
  hold('attack',v=>input.attack=v);
  window.addEventListener('keydown', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=true;
    if(k==='ArrowRight'||k==='KeyD') input.right=true;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=true;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=true;
    if((k==='Enter'||k==='NumpadEnter') && state==='TITLE') startRequest(e);
  }, { passive:false });
  window.addEventListener('keyup', e=>{
    const k=e.code;
    if(k==='ArrowLeft'||k==='KeyA') input.left=false;
    if(k==='ArrowRight'||k==='KeyD') input.right=false;
    if(k==='Space'||k==='ArrowUp'||k==='KeyW') input.jump=false;
    if(['KeyJ','KeyK','KeyZ','KeyX'].includes(k)) input.attack=false;
  }, { passive:false });

  /* ---------- title->loading ---------- */
  let state = 'TITLE';
  const startRequest = (e)=>{
    e?.preventDefault?.();
    if(state!=='TITLE') return;
    uiTitle.classList.remove('visible');
    uiTitle.style.pointerEvents='none';
    uiLoading.classList.add('visible');
    state='LOADING';
    bootstrap();
  };
  ['pointerdown','click','touchend'].forEach(ev=>{
    btnStart.addEventListener(ev,startRequest,{passive:false});
    uiTitle.addEventListener(ev,startRequest,{passive:false});
  });

  /* ---------- loader ---------- */
  const PATHS = {
    stripsManifest: 'assets/sprites/sprite_manifest.json',
    // atlas fallback
    usagiAtlas:  'assets/sprites/usagi.png',
    usagiMap:    'assets/sprites/usagi_map.json',
    ninjasAtlas: 'assets/sprites/ninjas.png',
    ninjasMap:   'assets/sprites/ninjas_map.json',
    ui: {
      left:  'assets/ui/ui_left.png',
      right: 'assets/ui/ui_right.png',
      jump:  'assets/ui/ui_jump.png',
      attack:'assets/ui/ui_attack.png'
    },
    backgrounds: Array.from({length:6}, (_,i)=>`assets/background/background${i+1}.png`)
  };

  const images = new Map();
  const jsons  = new Map();
  function cb(u){ return u + (u.includes('?')?'&':'?') + 'v=' + VERSION; }
  function loadImage(path){ return new Promise(res=>{ const img=new Image(); img.onload=()=>res({ok:true,path,img}); img.onerror=()=>res({ok:false,path}); img.src=cb(path); }); }
  async function loadJSON(path){ try{ const r=await fetch(cb(path),{cache:'no-store'}); if(!r.ok) return {ok:false,path}; const j=await r.json(); return {ok:true,path,json:j}; } catch{ return {ok:false,path}; } }

  async function bootstrap(){
    // Try strip manifest
    const manifestRes = await loadJSON(PATHS.stripsManifest);
    const usingStrips = manifestRes.ok && manifestRes.json && manifestRes.json.usagi && manifestRes.json.ninja;
    if(usingStrips) jsons.set(PATHS.stripsManifest, manifestRes.json);

    let queue = [
      ...Object.values(PATHS.ui).map(loadImage),
      ...PATHS.backgrounds.map(loadImage)
    ];

    if(usingStrips){
      const m = manifestRes.json;
      const allSpriteDefs = [
        ...Object.values(m.usagi),
        ...Object.values(m.ninja)
      ];
      queue = [
        ...queue,
        ...allSpriteDefs.map(def=>loadImage(def.path))
      ];
    }else{
      // Fallback to atlases
      queue = [
        ...queue,
        loadImage(PATHS.usagiAtlas), loadJSON(PATHS.usagiMap),
        loadImage(PATHS.ninjasAtlas), loadJSON(PATHS.ninjasMap)
      ];
    }

    let done=0,total=queue.length; const tick=()=>{ const pct = Math.round(done/total*100); barFill.style.width=pct+'%'; loadText.textContent=`Loaded: ${done} / ${total}`; };
    tick();
    const results = await Promise.all(queue.map(p=>p.then(r=>{done++;tick();return r;})));

    const missing=[];
    for(const r of results){
      if(!r.ok){ missing.push(r.path); continue; }
      if('img' in r) images.set(r.path, r.img);
      if('json' in r) jsons.set(r.path, r.json);
    }
    if(missing.length){ log('Missing:', missing.length); missing.forEach(p=>log('  ',p)); } else { log('All assets loaded'); }

    // Set touch icons/fallback glyphs
    const setIcon = (id, path, glyph)=>{
      const el = document.getElementById(id);
      if(images.has(path)) el.style.setProperty('--icon-url', `url("${cb(path)}")`);
      else { el.textContent=glyph; el.style.fontWeight='900'; el.style.fontSize=Math.floor(parseInt(getComputedStyle(el).width)*0.45)+'px'; }
    };
    setIcon('left',PATHS.ui.left,'◀'); setIcon('right',PATHS.ui.right,'▶');
    setIcon('jump',PATHS.ui.jump,'▲'); setIcon('attack',PATHS.ui.attack,'✕');

    // Build sprites
    if(usingStrips) {
      buildSpritesFromStrips(jsons.get(PATHS.stripsManifest));
      log('Sprites: strips manifest');
    } else {
      buildSpritesFromAtlas();
      log('Sprites: atlases (placeholder until you add strips)');
    }

    uiLoading.classList.remove('visible');
    touchUI.classList.remove('hidden');
    state='PLAY';
  }

  /* ---------- strips mode ---------- */
  function makeStripAnim(img, frames, fps=8, loop=true){
    const frameW = Math.floor(img.width / frames);
    const frameH = img.height;
    const rects = Array.from({length:frames}, (_,i)=>({x:i*frameW,y:0,w:frameW,h:frameH}));
    return new AtlasAnim(img, Object.fromEntries(rects.map((r,i)=>[i,r])), Array.from({length:frames}, (_,i)=>i), fps, loop);
  }
  function buildSpritesFromStrips(manifest){
    const u = manifest.usagi, n = manifest.ninja;

    const mk = def => images.has(def.path) ? makeStripAnim(images.get(def.path), def.frames, def.fps, !!def.loop) : null;

    const idle   = mk(u.idle);
    const walk   = mk(u.walk);
    const jump   = mk(u.jump);
    const attack = mk(u.attack);

    if(idle)   player.add('idle', idle);
    if(walk)   player.add('walk', walk);
    if(jump)   player.add('jump', jump);
    if(attack) player.add('attack', attack);
    player.play(player.has('idle')?'idle':'walk');

    const e = new Actor();
    const nIdle   = mk(n.idle);
    const nWalk   = mk(n.walk);
    const nJump   = mk(n.jump);
    const nAttack = mk(n.attack);
    if(nIdle)   e.add('idle', nIdle);
    if(nWalk)   e.add('walk', nWalk);
    if(nJump)   e.add('jump', nJump);
    if(nAttack) e.add('attack', nAttack);
    e.play(nIdle?'idle':'walk'); e.x=180; e.y=180; enemies.push(e);
  }

  /* ---------- atlas fallback ---------- */
  function buildFrameIndex(mapJson){
    const frames = mapJson?.frames || {};
    const idx = {};
    for(const [k,v] of Object.entries(frames)){ idx[k] = { x:v.x, y:v.y, w:v.w, h:v.h }; }
    return idx;
  }
  function buildSpritesFromAtlas(){
    const usagiAtlas = images.get('assets/sprites/usagi.png');
    const usagiMap   = jsons.get('assets/sprites/usagi_map.json');
    const ninAtlas   = images.get('assets/sprites/ninjas.png');
    const ninMap     = jsons.get('assets/sprites/ninjas_map.json');

    if(usagiAtlas && usagiMap){
      const idx = buildFrameIndex(usagiMap);
      const mk = (names, fps, loop)=> new AtlasAnim(usagiAtlas, idx, names.filter(n=>idx[n]), fps, loop);
      const idle  = mk(['idle0','idle1','idle2','idle1'], 6, true);
      const walk  = mk(['walk0','walk1','walk2','walk3','walk4','walk5'], 10, true);
      const jump  = mk(['jump0','jump1'], 10, false) || idle;
      const atk   = mk(['attack0','attack1','attack2','attack3','attack4','attack5'], 12, false) || walk;
      if(idle) player.add('idle', idle);
      if(walk) player.add('walk', walk);
      if(jump) player.add('jump', jump);
      if(atk)  player.add('attack', atk);
      player.play(player.has('idle')?'idle':'walk');
    }
    if(ninAtlas && ninMap){
      const idx = buildFrameIndex(ninMap);
      const mk = (names,fps,loop)=> new AtlasAnim(ninAtlas, idx, names.filter(n=>idx[n]), fps, loop);
      const nIdle = mk(['black_idle_0'], 4, true);
      const nWalk = mk(['black_walk1_1','black_walk2_2','black_walk1_6','black_walk2_7'], 8, true);
      const nAtk  = mk(['black_attack1_3','black_attack2_4'], 10, true);
      const e = new Actor();
      if(nIdle) e.add('idle',nIdle);
      if(nWalk) e.add('walk',nWalk);
      if(nAtk)  e.add('attack',nAtk);
      e.play(nIdle?'idle':'walk'); e.x=180; e.y=180; enemies.push(e);
    }
  }

  /* ---------- animation/actor ---------- */
  class AtlasAnim {
    constructor(atlas, frameRects, order, fps=8, loop=true){
      this.atlas=atlas; this.frameRects=frameRects; this.order=order; this.fps=fps; this.loop=loop;
      this.t=0; this.i=0; this.done=false;
    }
    step(dt){ if(this.done) return; this.t+=dt; const adv=(this.t*this.fps)|0; if(adv>0){ this.t-=adv/this.fps; this.i+=adv; if(this.i>=this.order.length){ if(this.loop) this.i%=this.order.length; else { this.i=this.order.length-1; this.done=true; } } } }
    curRect(){ return this.frameRects[this.order[this.i]]; }
  }

  class Actor{
    constructor(){ this.x=80; this.y=180; this.vx=0; this.vy=0; this.onGround=true; this.flip=false; this.scale=0.9; this.speed=46; this.jumpV=-130; this.gravity=340; this.anims={}; this.cur=null; this.shadow=true; }
    add(name,anim){ this.anims[name]=anim; }
    has(name){ return !!this.anims[name]; }
    play(name,restart=false){ if(!this.has(name)) return; if(this.cur!==name||restart){ this.anims[name].t=0; this.anims[name].i=0; this.anims[name].done=false; this.cur=name; } }
    update(dt){
      this.x+=this.vx*dt; this.vy+=this.gravity*dt; this.y+=this.vy*dt;
      if(this.y>=180){ this.y=180; this.vy=0; this.onGround=true; }
      if(this.cur) this.anims[this.cur].step(dt);
    }
    draw(ctx){
      if(!this.cur){ ctx.fillStyle='#7cf'; ctx.fillRect(this.x-8,this.y-28,16,28); return; }
      const a=this.anims[this.cur]; const r=a.curRect();
      const dw=r.w*this.scale, dh=r.h*this.scale;
      if(this.shadow){ const shw=(dw*0.55)|0, shh=(dh*0.15)|0; ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect((this.x-(shw>>1))|0,(this.y-2)|0,shw,shh); }
      ctx.save(); ctx.translate(this.x|0,this.y|0); if(this.flip) ctx.scale(-1,1);
      ctx.drawImage(a.atlas, r.x+0.01, r.y+0.01, r.w-0.02, r.h-0.02, (-dw*0.5)|0, (-dh)|0, dw|0, dh|0);
      ctx.restore();
    }
  }

  const player=new Actor(); const enemies=[];
  /* ---------- game loop ---------- */
  let last=0, scroll=0;
  function update(dt){
    if(state!=='PLAY') return;

    if(input.left){ player.vx=-player.speed; player.flip=true; }
    else if(input.right){ player.vx=player.speed; player.flip=false; }
    else player.vx=0;

    if(input.jump && player.onGround){ player.vy=-130; player.onGround=false; player.play('jump',true); }
    if(input.attack && player.has('attack')) player.play('attack',true);

    const busy = player.cur && !player.anims[player.cur].loop;
    if(!busy){
      if(!player.onGround && player.has('jump')) player.play('jump');
      else if(Math.abs(player.vx)>0 && player.has('walk')) player.play('walk');
      else if(player.has('idle')) player.play('idle');
    }

    player.update(dt);
    enemies.forEach(e=>e.update(dt));
    scroll = (scroll + dt*18) % 512;
  }

  function render(){
    ctx.clearRect(0,0,BASE_W,BASE_H);

    let bgImg=null;
    for(let i=1;i<=6;i++){ const p=`assets/background/background${i}.png`; if(images.get(p)){ bgImg=images.get(p); break; } }
    if(bgImg){
      const scale = BASE_H / bgImg.height;
      const tw = Math.ceil(bgImg.width*scale);
      const off = -((scroll*scale)|0)%tw;
      for(let x=off;x<BASE_W;x+=tw) ctx.drawImage(bgImg,0,0,bgImg.width,bgImg.height,x,0,tw,BASE_H);
    }else{ ctx.fillStyle='#203529'; ctx.fillRect(0,0,BASE_W,BASE_H); }
    ctx.fillStyle='#2e2e2e'; ctx.fillRect(0,182,BASE_W,BASE_H-182);

    player.draw(ctx); enemies.forEach(e=>e.draw(ctx));
  }

  function loop(t){ const dt=Math.min(0.05,(t-last)/1000)||0.0167; last=t; update(dt); render(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
});
