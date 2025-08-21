// scripts/game.js

// ----------------- Config -----------------
const CONFIG = {
  VIRTUAL_W: 320,
  VIRTUAL_H: 180,
  FRAME_W: 96,
  FRAME_H: 96,
  FLOOR_Y: 150,
  PIXEL_PERFECT: true
};

// Main canvas & contexts
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Backbuffer for virtual resolution
const back = document.createElement('canvas');
back.width = CONFIG.VIRTUAL_W;
back.height = CONFIG.VIRTUAL_H;
const bctx = back.getContext('2d');
bctx.imageSmoothingEnabled = false;

// Handle resizing
function fitCanvasToScreen() {
  const root = document.getElementById('game-root');
  const rw = root.clientWidth, rh = root.clientHeight;
  const ar = CONFIG.VIRTUAL_W / CONFIG.VIRTUAL_H;
  let dw = rw, dh = Math.round(rw / ar);
  if (dh > rh) { dh = rh; dw = Math.round(rh * ar); }

  const scale = CONFIG.PIXEL_PERFECT
    ? Math.max(1, Math.floor(dw / CONFIG.VIRTUAL_W))
    : dw / CONFIG.VIRTUAL_W;

  canvas.width = CONFIG.VIRTUAL_W * scale;
  canvas.height = CONFIG.VIRTUAL_H * scale;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
}
window.addEventListener('resize', fitCanvasToScreen);
fitCanvasToScreen();

// Sprite strip loader
class SpriteStrip {
  constructor(src, frames, frameW = CONFIG.FRAME_W, frameH = CONFIG.FRAME_H, fps = 8) {
    this.src = src; this.frames = frames;
    this.frameW = frameW; this.frameH = frameH; this.fps = fps;
    this.time = 0; this.img = new Image(); this.loaded = false;

    this.img.onload = () => { this.loaded = true; };
    this.img.onerror = () => { console.warn('Missing sprite:', src); };
    this.img.src = src;
  }
  tick(dt) { this.time += dt; }
  draw(g, dx, dy, flip=false) {
    const cf = Math.floor((this.time * this.fps)) % this.frames;
    const sx = cf * this.frameW + 0.01; // inset avoids bleed
    const sy = 0.01;
    const sw = this.frameW - 0.02, sh = this.frameH - 0.02;

    const dw = this.frameW, dh = this.frameH;
    const x = CONFIG.PIXEL_PERFECT ? Math.round(dx) : dx;
    const y = CONFIG.PIXEL_PERFECT ? Math.round(dy) : dy;

    g.save();
    if (flip) { g.translate(x+dw,y); g.scale(-1,1); }
    else { g.translate(x,y); }

    if (this.loaded) {
      g.drawImage(this.img, sx, sy, sw, sh, 0, 0, dw, dh);
    } else {
      g.fillStyle = '#55b6ff';
      g.fillRect(0, 0, dw, dh);
    }
    g.restore();
  }
}

// Example usage
const usagiIdle = new SpriteStrip('assets/sprites/usagi/idle.png', 4);

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000; last = now;
  usagiIdle.tick(dt);

  // draw to backbuffer
  bctx.clearRect(0,0,back.width,back.height);
  usagiIdle.draw(bctx, 100, CONFIG.FLOOR_Y - CONFIG.FRAME_H);

  // blit to screen
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(back, 0,0, back.width, back.height, 0,0, canvas.width, canvas.height);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
