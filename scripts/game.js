// scripts/game.js
import { bootUI } from "./ui.js";
import { loadSheets, AnimDefs } from "./preload.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const K = { GRAV: 1500, SPEED: 240, JUMP: 520 };
let world;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const beep = (f=440,d=.08,g=.03)=>{const o=audioCtx.createOscillator(),u=audioCtx.createGain();o.type="square";o.frequency.value=f;u.gain.value=g;o.connect(u);u.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+d);};

class Animated {
  constructor(sheet){ Object.assign(this, sheet); this.time=0; this.frame=0; }
  reset(){ this.time=0; this.frame=0; }
  update(dt){ this.time+=dt; const total=this.frames||1; const f=this.time*(this.fps||8); this.frame = this.loop? Math.floor(f)%total : Math.min(total-1, Math.floor(f)); }
}

function makeEntity(kind, sheets, x, y){
  const anims = {};
  for (const [state, meta] of Object.entries(sheets[kind])) anims[state] = new Animated(meta);
  return {
    kind, x, y, vx:0, vy:0, dir:1, hp: kind==="usagi"?100:30, maxHp: kind==="usagi"?100:30,
    state:"idle", anims, inv:0, atkLock:0
  };
}

function current(e){ return e.anims[e.state]; }

function intersects(a,b){ const hbA=hitbox(a), hbB=hitbox(b); return hbA.x < hbB.x+hbB.w && hbA.x+hbA.w > hbB.x && hbA.y < hbB.y+hbB.h && hbA.y+hbA.h > hbB.y; }
function hitbox(e){ // centered around sprite; tuned for 96x96
  return { x:e.x-20, y:e.y-64, w:40, h:60 };
}

export function isRunning(){ return world?.running; }
export function setPaused(p){ world.paused=p; window.__UI.showPaused(p); }
export function quitGame(){ world.running=false; window.__UI.showTitle(true); window.__UI.showHUD(false); }

export async function startGame({ mode }){
  if (world?.running) return;
  window.__UI.showTitle(false); window.__UI.showHUD(true);

  const sheets = await loadSheets();
  world = {
    running:true, paused:false, mode: mode||"story", sheets,
    player: makeEntity("usagi", sheets, 120, AnimDefs.meta.groundY),
    enemies: [],
    groundY: AnimDefs.meta.groundY,
    scale: AnimDefs.meta.scale || 2.5,
    last: performance.now(), lastSpawn: 0, score: 0,
    input: { left:false, right:false, up:false, atk:false }
  };

  setupInput(world.input);
  loop();
}

function setupInput(k){
  const set=(c,v)=>k[c]=v;
  window.addEventListener("keydown",(e)=>{
    if (e.repeat) return;
    if (e.key==="ArrowLeft"||e.key==="a") set("left",true);
    if (e.key==="ArrowRight"||e.key==="d") set("right",true);
    if (e.key==="ArrowUp"||e.key==="w"||e.key===" ") set("up",true);
    if (e.key==="j"||e.key==="k"||e.key==="Enter") set("atk",true);
    if (e.key==="Escape" && world.running) setPaused(true);
  });
  window.addEventListener("keyup",(e)=>{
    if (e.key==="ArrowLeft"||e.key==="a") set("left",false);
    if (e.key==="ArrowRight"||e.key==="d") set("right",false);
    if (e.key==="ArrowUp"||e.key==="w"||e.key===" ") set("up",false);
    if (e.key==="j"||e.key==="k"||e.key==="Enter") set("atk",false);
  });
}

function loop(){
  if (!world?.running) return;
  const now = performance.now();
  const dt = Math.min(33, now - world.last) / 1000; world.last = now;
  if (!world.paused) update(dt, now);
  draw();
  requestAnimationFrame(loop);
}

function update(dt, now){
  const p = world.player;
  const k = world.input;

  // physics
  p.vy += K.GRAV * dt;

  // move
  if (k.left)  { p.vx = -K.SPEED; p.dir=-1; }
  else if (k.right) { p.vx = K.SPEED; p.dir=1; }
  else p.vx *= 0.82;

  // jump
  if (k.up && onGround(p)) { p.vy = -K.JUMP; beep(660); }

  // attack
  if (k.atk && p.atkLock<=0) { p.state="attack"; p.atkLock=0.35; beep(880,.06,.04); }
  if (p.atkLock>0) p.atkLock-=dt;

  // integrate
  p.x += p.vx*dt; p.y += p.vy*dt;
  floorSnap(p);

  // state
  if (p.atkLock>0) {/*stay attack*/}
  else if (!onGround(p)) p.state="jump";
  else if (Math.abs(p.vx)>20) p.state="walk";
  else p.state="idle";

  // spawn enemies
  const gap = world.mode==="endless" ? 900 : 1400;
  if (now - world.lastSpawn > gap) {
    world.lastSpawn = now;
    const side = Math.random()<.5 ? -1 : 1;
    const e = makeEntity("ninja", world.sheets, side<0 ? canvas.width-120 : 40, world.groundY);
    e.vx = side*60; e.state="walk";
    world.enemies.push(e);
  }

  // enemies AI + combat
  for (const e of world.enemies){
    if (e.inv>0) e.inv-=dt;

    // chase
    e.vx = Math.sign((p.x) - (e.x)) * 80;
    e.vy += K.GRAV * dt;

    // simple attack window
    if (Math.abs(p.x - e.x) < 70 && onGround(e)){
      e.state="attack";
      if (e.inv<=0 && intersects(e,p) && p.atkLock<=0){
        p.hp = Math.max(0, p.hp-8);
        document.getElementById("hpFill").style.width = `${p.hp}%`;
        beep(220,.06,.05);
        if (p.hp<=0){ world.running=false; setPaused(true); }
      }
    } else {
      e.state = Math.abs(e.vx)>10 ? "walk" : "idle";
    }

    // player hitbox during attack
    if (p.state==="attack" && hitFrame("usagi","attack", current(p).frame)){
      const inFront = p.dir===1 ? (e.x>p.x && e.x-p.x<80) : (e.x<p.x && p.x-e.x<80);
      if (inFront && intersects(p,e)){
        if (e.inv<=0){ e.hp-=10; e.inv=.2; beep(520,.05,.04); }
      }
    }

    e.x += e.vx*dt; e.y += e.vy*dt; floorSnap(e);
  }

  // remove dead
  world.enemies = world.enemies.filter(e=>{
    if (e.hp<=0){ world.score+=50; document.getElementById("scoreNum").textContent = world.score; return false; }
    return true;
  });

  // update animations
  current(p).update(dt);
  for (const e of world.enemies) current(e).update(dt);
}

function hitFrame(who, state, frame){
  const def = (who==="usagi"?AnimDefs.usagi:AnimDefs.ninja)[state];
  return (def.hitFrames||[]).includes(frame);
}

function onGround(e){ return e.y >= world.groundY; }
function floorSnap(e){ if (e.y > world.groundY){ e.y = world.groundY; e.vy=0;
