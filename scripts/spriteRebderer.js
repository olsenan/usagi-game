// Lightweight sprite renderer with flip support and safe margins
// Assumes each sprite sheet is a single horizontal strip with fixed frame size (96x96 by default)
(function(global){
  class SpriteSheet {
    constructor({image, frameWidth=96, frameHeight=96, frames=1, fps=8}) {
      this.img = image;
      this.fw = frameWidth;
      this.fh = frameHeight;
      this.frames = frames;
      this.fps = fps;
      this.time = 0;
      this.index = 0;
    }
    update(dt){
      this.time += dt;
      const frameTime = 1/this.fps;
      while(this.time >= frameTime){
        this.time -= frameTime;
        this.index = (this.index + 1) % this.frames;
      }
    }
    draw(ctx, x, y, {flipX=false, alpha=1.0, scale=1.0}={}){
      if(!this.img) return;
      const sx = this.index * this.fw;
      const sy = 0;
      const dw = this.fw * scale, dh = this.fh * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      if(flipX){
        ctx.translate(x + dw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(this.img, sx, sy, this.fw, this.fh, 0, 0, dw, dh);
      } else {
        ctx.drawImage(this.img, sx, sy, this.fw, this.fh, x, y, dw, dh);
      }
      ctx.restore();
    }
  }
  function loadImage(src){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  global.SpriteRenderer = { SpriteSheet, loadImage };
})(window);
