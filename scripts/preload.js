// Loads sprite sheets or generates safe placeholders if files are missing.
const FRAME_W = 96, FRAME_H = 96;

export const AnimDefs = {
  meta: { frameW: FRAME_W, frameH: FRAME_H, groundY: 420, scale: 2.5 },
  usagi: {
    idle:   { path: "assets/sprites/usagi/idle.png",   frames: 4, fps: 8,  loop: true },
    walk:   { path: "assets/sprites/usagi/walk.png",   frames: 8, fps: 12, loop: true },
    attack: { path: "assets/sprites/usagi/attack.png", frames: 8, fps: 18, loop: false, hitFrames: [3,4,5] },
    jump:   { path: "assets/sprites/usagi/jump.png",   frames: 4, fps: 9,  loop: false },
    hurt:   { path: "assets/sprites/usagi/hurt.png",   frames: 4, fps: 10, loop: false },
    death:  { path: "assets/sprites/usagi/death.png",  frames: 6, fps: 8,  loop: false }
  },
  ninja: {
    idle:   { path: "assets/sprites/ninja/idle.png",   frames: 4, fps: 8,  loop: true },
    walk:   { path: "assets/sprites/ninja/walk.png",   frames: 8, fps: 12, loop: true },
    attack: { path: "assets/sprites/ninja/attack.png", frames: 6, fps: 16, loop: false, hitFrames: [2,3] },
    jump:   { path: "assets/sprites/ninja/jump.png",   frames: 4, fps: 9,  loop: false },
    hurt:   { path: "assets/sprites/ninja/hurt.png",   frames: 4, fps: 10, loop: false },
    death:  { path: "assets/sprites/ninja/death.png",  frames: 6, fps: 8,  loop: false }
  }
};

function placeholder(label, w=FRAME_W, h=FRAME_H){
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1220"; g.fillRect(0,0,w,h);
  g.strokeStyle = "#ef4444"; g.strokeRect(1,1,w-2,h-2);
  g.fillStyle="#ef4444"; g.font="12px monospace"; g.textAlign="center";
  g.fillText(label, w/2, h/2);
  return c;
}

function loadImage(path){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error("404 "+path));
    img.src = path;
  });
}

export async function loadSheets(){
  const cache = {};
  const groups = [["usagi", AnimDefs.usagi], ["ninja", AnimDefs.ninja]];
  for (const [who, def] of groups){
    cache[who] = {};
    for (const [state, meta] of Object.entries(def)){
      try {
        const img = await loadImage(meta.path);
        cache[who][state] = { img, ...meta };
      } catch (e) {
        console.warn("Missing sprite, using placeholder:", meta.path);
        const frames = meta.frames || 1;
        const pimg = placeholder(`${who}:${state}`, FRAME_W*frames, FRAME_H);
        cache[who][state] = { img: pimg, frames, fps: meta.fps, loop: meta.loop, hitFrames: meta.hitFrames||[] };
      }
    }
  }
  return cache;
}
