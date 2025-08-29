// scripts/game.js
"use strict";

import { bootUI } from "./ui.js";
import { loadSheets, AnimDefs } from "./preload.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const K = { GRAV: 1500, SPEED: 240, JUMP: 520 };

let world = null;

// WebAudio beeps (no external audio files needed)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq = 440, dur = 0.08, gain = 0.03) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

class Animated {
  constructor(sheet){
    Object.assign(this, sheet);
    this.time = 0;
    this.frame = 0;
  }
  reset(){ this.time = 0; this.frame = 0; }
  update(dt){
    const n = Math.max(1, this.frames|0);
    this.time += dt * (this.fps || 1);
    const f = this.time;
    this.frame = this.loop ? Math.floor(f) % n : Math.min(n-1, Math.floor(f));
  }
}

const hitbox = e => ({ x:e.x-20, y:e.y-64, w:40, h:60 });
const intersects = (a,b)=>{const A=hitbox(a),B=hitbox(b);return A.x<B.x+B.w&&A.x+A.w>B.x&&A.y<B.y+B.h&&A.y+A.h>B.y;};
const onGround = e => e.y >= (world?.groundY ?? 420);
const floorSnap = e => { if (e.y > world.groundY){ e.y = world.groundY; e.vy = 0; } };

function mkEntity(kind, sheets, x, y){
  const anims={}; for(const [s,m] of Object.entries(sheets[kind])) anims[s]=new Animated(m);
  return { kind, x, y, vx:0, vy:0, dir:1, hp:kind==="usagi"?100:30, maxHp:kind==="usagi"?100:30, state:"idle", anims, inv:0, atkLock:0 };
}
const cur = e => e.anims[e.state] || e.anims.idle;
const hitFrame = (who,state,frame)=>((who==="usagi"?AnimDefs.usagi:AnimDefs.ninja)[state].hitFrames||[]).includes(frame);

export const isRunning = ()=>!!(world&&world.running);
export function setPaused(p){ if(!world) return; world.paused=!!p; window.__UI?.showPaused(!!p); }
export function quitGame(){ if(!world) return; world.running=false; window.__UI?.showTitle(true); window.__UI?.showHUD(false); }

export async function startGame({ mode }){
  if (world?.running) return;
  window.__UI?.showTitle(false); window.__UI?.showHUD(true);

  const sheets = await loadSheets();
  world = {
    running:true, paused:false, mode:mode||"story", sheets,
    player: mkEntity("usagi", sheets, 120, AnimDefs.meta.groundY),
    enemies: [], groundY: AnimDefs.meta.groundY, scale: AnimDefs.meta.scale||2.5,
    last: performance.now(), lastSpawn: 0, score:0,
    input: { left:false, right:false, up:false, atk:false }
  };

  setupInput(world.input);
  requestAnimationFrame(loop);
}

function setupInput(k){
  const set=(c,v)=>k[c]=v;
  addEventListener("keydown",e=>{ if(e.repeat) return;
    const q=e.key;
    if(q==="ArrowLeft"||q==="a") set("left",true);
    if(q==="ArrowRight"||q==="d") set("right",true);
    if(q==="ArrowUp"||q==="w"||q===" ") set("up",true);
    if(q==="j"||q==="k"||q==="Enter") set("atk",true);
    if(q==="Escape"&&isRunning()) setPaused(true);
  });
  addEventListener("keyup",e=>{
    const q=e.key;
    if(q==="ArrowLeft"||q==="a") set("left",false);
    if(q==="ArrowRight"||q==="d") set("right",false);
    if(q==="ArrowUp"||q==="w"||q===" ") set("up",false);
    if(q==="j"||q==="k"||q==="Enter") set("atk",false);
  });
}

function loop(t){
  if(!world?.running) return;
  const now = t ?? performance.now();
  const dt = Math.min(33, now - world.last) / 1000; world.last = now;
  if(!world.paused) update(dt, now);
  draw();
  requestAnimationFrame(loop);
}

function update(dt, now){
  const p = world.player, k = world.input;

  // physics
  p.vy += K.GRAV*dt;
  if(k.left){ p.vx=-K.SPEED; p.dir=-1; } else if(k.right){ p.vx=K.SPEED; p.dir=1; } else p.vx *= 0.82;
  if(k.up && onGround(p)){ p.vy=-K.JUMP; beep(660); }
  if(k.atk && p.atkLock<=0){ p.state="attack"; p.atkLock=.35; beep(880,.06,.04); }
  if(p.atkLock>0) p.atkLock-=dt;

  p.x += p.vx*dt; p.y += p.vy*dt; floorSnap(p);
  if(p.atkLock>0){} else if(!onGround(p)) p.state="jump"; else if(Math.abs(p.vx)>20) p.state="walk"; else p.state="idle";

  // spawn
  const gap = world.mode==="endless" ? 900 : 1400;
  if(now - world.lastSpawn > gap){ world.lastSpawn=now;
    const side=Math.random()<.5?-1:1;
    const e=mkEntity("ninja", world.sheets, side<0?canvas.width-120:40, world.groundY);
    e.vx=side*60; e.state="walk"; world.enemies.push(e);
  }

  // enemies
  for(const e of world.enemies){
    if(e.inv>0) e.inv-=dt;
    e.vx = Math.sign(p.x - e.x) * 80;
    e.vy += K.GRAV*dt;

    if(Math.abs(p.x - e.x)<70 && onGround(e)){
      e.state="attack";
      if(e.inv<=0 && intersects(e,p) && p.atkLock<=0){
        p.hp=Math.max(0, p.hp-8);
        const hp = document.getElementById("hpFill"); if (hp) hp.style.width = `${p.hp}%`;
        beep(220,.06,.05);
        if(p.hp<=0){ world.running=false; setPaused(true); }
      }
    } else e.state = Math.abs(e.vx)>10 ? "walk" : "idle";

    if(p.state==="attack" && hitFrame("usagi","attack",cur(p).frame)){
      const inFront = p.dir===1 ? (e.x>p.x && e.x-p.x<80) : (e.x<p.x && p.x-e.x<80);
      if(inFront && intersects(p,e) && e.inv<=0){ e.hp-=10; e.inv=.2; beep(520,.05,.04); }
    }

    e.x+=e.vx*dt; e.y+=e.vy*dt; floorSnap(e);
  }

  // cleanup + score
  world.enemies = world.enemies.filter(e => {
    if(e.hp<=0){
      world.score+=50;
      const n = document.getElementById("scoreNum"); if (n) n.textContent = world.score;
      return false;
    }
    return true;
  });

  // anims
  cur(p).update(dt); for(const e of world.enemies) cur(e).update(dt);
}

function draw(){
  const w=canvas.width,h=canvas.height, gy=(world?.groundY ?? 420);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#0b1324"; ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#0a0f18"; ctx.fillRect(0,h*0.55,w,h*0.45);
  ctx.strokeStyle="rgba(255,255,255,.08)"; ctx.beginPath(); ctx.moveTo(0,gy+1); ctx.lineTo(w,gy+1); ctx.stroke();

  if(!world) return;
  drawEntity(world.player); for(const e of world.enemies) drawEntity(e);
}

function drawEntity(e){
  const fw=AnimDefs.meta.frameW, fh=AnimDefs.meta.frameH, scale=AnimDefs.meta.scale||2.5;
  const sheet = world.sheets[e.kind][e.state] || world.sheets[e.kind].idle;
  const sx = Math.min((sheet.frames||1)-1, cur(e).frame) * fw;
  ctx.save();
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.scale(e.dir,1);
  ctx.translate(-Math.round(fw*scale*.5), -Math.round(fh*scale));
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sheet.img, sx,0, fw,fh, 0,0, Math.round(fw*scale), Math.round(fh*scale));
  ctx.restore();
}

// Wire UI (delegation in ui.js tolerates either btn IDs)
bootUI({
  start:   () => startGame({ mode:"story" }),
  endless: () => startGame({ mode:"endless" }),
  resume:  () => setPaused(false),
  quit:    () => quitGame()
});
