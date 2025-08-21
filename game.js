/* Usagi Arcade Brawler – minimal debug runner with robust sprite scaling
   Key goals:
   - Pixel-perfect rendering (no blur/bleed)
   - Works even when some sprite files are missing
   - SpriteStrip supports any frame size & count
*/

(() => {
  // ----------------- Config -----------------
  const CONFIG = {
    VIRTUAL_W: 320,          // internal playfield width
    VIRTUAL_H: 180,          // internal playfield height (16:9)
    FLOOR_Y: 150,            // ground line in virtual space
    PIXEL_PERFECT: true,     // snap to integer pixels
    BG_COLOR: '#d9d9df',
    // Default sprite sheet assumptions (can be overridden per sheet)
    FRAME_W: 96,
    FRAME_H: 96,
    FPS_IDLE: 6,
    FPS_WALK: 10,
    FPS_ATTACK: 14,
    FPS_JUMP: 8,
  };

  // Paths expected by your project structure.
  // Missing files are ok—placeholders will render until art is added.
  const SPRITES = {
    usagi: {
      idle:   { src: 'assets/sprites/usagi/idle.png',   frames: 4 },
      walk:   { src: 'assets/sprites/usagi/walk.png',   frames: 8 },
      attack: { src: 'assets/sprites/usagi/attack.png', frames: 8 },
      jump:   { src: 'assets/sprites/usagi/jump.png',   frames: 4 },
    },
    ninja: {
      idle:   { src: 'assets/sprites/ninja/idle.png',   frames: 4 },
      walk:   { src: 'assets/sprites/ninja/walk.png',   frames: 8 },
      attack: { src: 'assets/sprites/ninja/attack.png', frames: 8 },
      jump:   { src: 'assets/sprites/ninja/jump.png',   frames: 4 },
    }
  };

  // ----------------- Canvas / Scaling -----------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const overlay = document.getElementById('overlay');

  // Backing store for crisp scaling (we draw at virtual size, then the CSS scales)
  const back = document.createElement('canvas');
  back.width = CONFIG.VIRTUAL_W;
  back.height = CONFIG.VIRTUAL_H;
  const bctx = back.getContext('2d');

  function applySmoothing(context, enabled) {
    context.imageSmoothingEnabled = !!enabled;
    context.webkitImageSmoothingEnabled = !!enabled;
    context.mozImageSmoothingEnabled = !!enabled;
    context.msImageSmoothingEnabled = !!enabled;
  }
  applySmoothing(ctx, false);
  applySmoothing(bctx, false);

  function fitCanvasToScreen() {
    // Maintain aspect ratio with integer scaling when possible
    const root = document.getElementById('game-root');
    const rw = root.clientWidth, rh = root.clientHeight;
    const ar = CONFIG.VIRTUAL_W / CONFIG.VIRTUAL_H;
    let dw = rw, dh = Math.round(rw / ar);
    if (dh > rh) { dh = rh; dw = Math.round(rh * ar); }

    // Prefer integer scale for pixel-perfect look
    const scale = Math.max(1, CONFIG.PIXEL_PERFECT ? Math.floor(dw / CONFIG.VIRTUAL_W) : (dw / CONFIG.VIRTUAL_W));
    const cssW = Math.round(CONFIG.VIRTUAL_W * scale);
    const cssH = Math.round(CONFIG.VIRTUAL_H * scale);

    canvas.width = cssW;   // device pixels
    canvas.height = cssH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // Clear after resize
    ctx.setTransform(1,0,0,1,0,0);
    applySmoothing(ctx, false);
  }
  window.addEventListener('resize', fitCanvasToScreen, { passive: true });
  fitCanvasToScreen();

  // ----------------- Loader -----------------
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, img });
      img.onerror = () => {
        console.warn('Missing sprite:', src);
        resolve({ ok: false, img: null, src });
      };
      img.src = src;
    });
  }

  class SpriteStrip {
    constructor({ src, frames, frameW = CONFIG.FRAME_W, frameH = CONFIG.FRAME_H, fps = 8 }) {
      this.src = src; this.frames = frames; this.frameW = frameW; this.frameH = frameH; this.fps = fps;
      this.loaded = false; this.ok = false; this.time = 0; this.img = null;
    }
    async load() {
      const res = await loadImage(this.src);
      this.ok = res.ok; this.img = res.img; this.loaded = true;
      return this;
    }
    tick(dt) { this.time += dt; }
    draw(g, dx, dy, flip=false, scale=1) {
      // Current frame
      const cf = Math.floor((this.time * this.fps)) % this.frames;
      // Source rect — inset by 0.01px to avoid bleeding on tightly packed strips
      const sx = cf * this.frameW + 0.01;
      const sy = 0.01;
      const sw = this.frameW - 0.02;
      const sh = this.frameH - 0.02;

      const dw = Math.round(this.frameW * scale);
      const dh = Math.round(this.frameH * scale);

      // Snap destination to whole pixels to prevent seams
      const x = CONFIG.PIXEL_PERFECT ? Math.round(dx) : dx;
      const y = CONFIG.PIXEL_PERFECT ? Math.round(dy) : dy;

      g.save();
      if (flip) {
        g.translate(x + dw, y);
        g.scale(-1, 1);
      } else {
        g.translate(x, y);
      }

      if (this.ok) {
        g.drawImage(this.img, sx, sy, sw, sh, 0, 0, dw, dh);
      } else {
        // Placeholder: blue box with baseline to show feet at FLOOR_Y
        g.fillStyle = '#55b6ff';
        g.fillRect(0, 0, dw, dh);
        g.fillStyle = '#0d5ea6';
        g.fillRect(0, dh-4, dw, 4);
      }
      g.restore();
    }
  }

  // ----------------- Animations & Entities -----------------
  function makeAnimSet(def, speeds){
    return {
      idle:   new SpriteStrip({ src: def.idle.src,   frames: def.idle.frames,   fps: speeds.idle }),
      walk:   new SpriteStrip({ src: def.walk.src,   frames: def.walk.frames,   fps: speeds.walk }),
      attack: new SpriteStrip({ src: def.attack.src, frames: def.attack.frames, fps: speeds.attack }),
      jump:   new SpriteStrip({ src: def.jump.src,   frames: def.jump.frames,   fps: speeds.jump }),
    };
  }

  const usagi = {
    x: 80, y: CONFIG.FLOOR_Y, vx: 0, facing: 1, jumping:false, vy:0, state:'idle', scale: 1,
    anim: makeAnimSet(SPRITES.usagi, {
      idle: CONFIG.FPS_IDLE, walk: CONFIG.FPS_WALK, attack: CONFIG.FPS_ATTACK, jump: CONFIG.FPS_JUMP
    })
  };

  const input = { left:false, right:false, jump:false, attack:false };

  async function loadAll() {
    const missing = [];
    const all = [usagi].flatMap(e => Object.values(e.anim));
    await Promise.all(all.map(async a => {
      await a.load();
      if (!a.ok) missing.push(a.src);
    }));

    overlay.textContent =
      `Build: debug\nMissing: ${missing.length}\n` +
      (missing.length ? missing.map(s => '  ' + s).join('\n') + '\n' : '') +
      `Sprites: strips runtime\n` +
      `Virtual: ${CONFIG.VIRTUAL_W}x${CONFIG.VIRTUAL_H}\n`;
  }

  // ----------------- Input -----------------
  const KEY = { ArrowLeft:'left', ArrowRight:'right', KeyA:'attack', KeyJ:'jump', Space:'jump' };
  window.addEventListener('keydown', (e)=>{ const k = KEY[e.code]; if(k){ input[k]=true; e.preventDefault(); }}, {passive:false});
  window.addEventListener('keyup',   (e)=>{ const k = KEY[e.code]; if(k){ input[k]=false; e.preventDefault(); }}, {passive:false});

  function bindBtn(id, prop){
    const el = document.getElementById(id);
    if(!el) return;
    const set = (v)=>{ input[prop]=v; };
    el.addEventListener('pointerdown', (e)=>{ set(true); e.preventDefault(); el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointerup',   (e)=>{ set(false); e.preventDefault(); });
    el.addEventListener('pointercancel', ()=> set(false));
    el.addEventListener('pointerleave',  ()=> set(false));
  }
  bindBtn('btn-left','left');
  bindBtn('btn-right','right');
  bindBtn('btn-jump','jump');
  bindBtn('btn-attack','attack');

  // ----------------- Game Update/Draw -----------------
  let last = performance.now();

  function step(now){
    const dt = Math.min(0.033, (now - last)/1000); // clamp dt
    last = now;

    // Physics & state
    const speed = 60;  // px/s in virtual space
    usagi.vx = (input.left ? -speed : 0) + (input.right ? speed : 0);
    if (usagi.vx !== 0) usagi.facing = Math.sign(usagi.vx);

    // Jump
    if (!usagi.jumping && input.jump){
      usagi.jumping = true; usagi.vy = -160;
    }
    if (usagi.jumping){
      usagi.vy += 360 * dt; // gravity
      usagi.y += usagi.vy * dt;
      if (usagi.y >= CONFIG.FLOOR_Y){
        usagi.y = CONFIG.FLOOR_Y; usagi.vy = 0; usagi.jumping = false;
      }
    }

    usagi.x += usagi.vx * dt;

    // Choose state
    let nextState = 'idle';
    if (input.attack) nextState = 'attack';
    else if (usagi.jumping) nextState = 'jump';
    else if (usagi.vx !== 0) nextState = 'walk';
    usagi.state = nextState;

    // Tick anims
    Object.values(usagi.anim).forEach(a => a.tick(dt));

    // ----------------- Render to backbuffer -----------------
    bctx.setTransform(1,0,0,1,0,0);
    applySmoothing(bctx, false);
    bctx.clearRect(0,0,back.width, back.height);

    // Ground line
    bctx.fillStyle = '#c8c8cd';
    bctx.fillRect(0, CONFIG.FLOOR_Y+CONFIG.FRAME_H*usagi.scale-2, back.width, 2);

    // Draw character with feet aligned to FLOOR_Y
    const active = usagi.anim[usagi.state];
    const dx = usagi.x;
    const dy = usagi.y - Math.round(CONFIG.FRAME_H * usagi.scale);
    active.draw(bctx, dx, dy, usagi.facing < 0, usagi.scale);

    // ----------------- Blit backbuffer to display canvas -----------------
    ctx.setTransform(1,0,0,1,0,0);
    applySmoothing(ctx, false);

    // Compute integer scale to avoid sampling issues
    const scaleX = canvas.width / back.width;
    const scaleY = canvas.height / back.height;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(back, 0, 0);
    ctx.restore();

    requestAnimationFrame(step);
  }

  // Kickoff
  loadAll().then(() => requestAnimationFrame(step));
})();
