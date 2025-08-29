// Minimal sprite-strip renderer with flip support (96x96 frames by default)
export class SpriteSheet {
  constructor({ image, frames=1, fps=8, frameWidth=96, frameHeight=96, loop=true }){
    this.img = image; this.frames=frames; this.fps=fps; this.fw=frameWidth; this.fh=frameHeight; this.loop=loop;
    this.time=0; this.frame=0;
  }
  reset(){ this.time=0; this.frame=0; }
  update(dt){
    const n = Math.max(1, this.frames|0);
    this.time += dt * (this.fps || 1);
    const f = this.time;
    this.frame = this.loop ? Math.floor(f)%n : Math.min(n-1, Math.floor(f));
  }
  draw(ctx, x, y, {flipX=false, scale=1, alpha=1}={}){
    const sx = (this.frame|0) * this.fw, sy = 0, dw=this.fw*scale, dh=this.fh*scale;
    ctx.save(); ctx.globalAlpha = alpha;
    if(flipX){ ctx.translate(x+dw, y); ctx.scale(-1,1); ctx.drawImage(this.img, sx, sy, this.fw, this.fh, 0, 0, dw, dh); }
    else     { ctx.drawImage(this.img, sx, sy, this.fw, this.fh, x, y, dw, dh); }
    ctx.restore();
  }
}

export function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error("img load: "+src));
    img.src = src;
  });
}
