// scripts/game.js
import { preloadImages } from "./preload.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let state = {
  running: false,
  paused: false,
  mode: "story",
  assets: null,
  player: null,
  enemies: [],
  lastSpawn: 0,
  score: 0,
  input: { left:false, right:false, up:false, attack:false }
};

// Simple WebAudio pips so we don't need audio files
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const beep = (freq=440, dur=0.08, gain=0.03) => {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.value = freq; osc.type = "square";
  g.gain.value = gain;
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
};

export const isRunning = () => state.running;
export function setPaused(p) {
  state.paused = p;
  document.getElementById("paused").classList.toggle("hidden", !p);
}
export function quitGame() {
  state.running = false;
  document.getElementById("title").classList.remove("hidden");
  document.getElementById("hud").classList.add("hidden");
}

export async function startGame({ mode }) {
  if (state.running) return;
  state = { ...state, running:true, paused:false, mode, enemies:[], score:0 };
  document.getElementById("title").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  document.getElementById("scoreNum").textContent = "0";
  document.getElementById("hpFill").style.width = "100%";

  // Load images
  state.assets = await preloadImages();

  // Player
  state.player = {
    x: 120, y: 420, w: 64, h: 64,
    vx:0, vy:0, grounded:true, hp:100,
    facing: 1, anim:"idle", cooldown:0
  };

  // Input
  setupInput();

  // Start loop
  let last = performance.now();
  const loop = (now) => {
    if (!state.running) return;
    const dt = Math.min(33, now - last) / 1000; last = now;
    if (!state.paused) update(dt, now);
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setupInput() {
  const k = state.input;
  const down = (c,v) => (k[c]=v);
  window.onkeydown = (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft" || e.key === "a") down("left",true);
    if (e.key === "ArrowRight"|| e.key === "d") down("right",true);
    if (e.key === "ArrowUp"   || e.key === "w" || e.key===" ") down("up",true);
    if (e.key === "j" || e.key === "k") down("attack",true);
  };
  window.onkeyup = (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") down("left",false);
    if (e.key === "ArrowRight"|| e.key === "d") down("right",false);
    if (e.key === "ArrowUp"   || e.key === "w" || e.key===" ") down("up",false);
    if (e.key === "j" || e.key === "k") down("attack",false);
  };
}

function update(dt, now) {
  const p = state.player;
  const k = state.input;

  // gravity
  p.vy += 1500 * dt;

  // move
  let accel = 800;
  if (k.left)  { p.vx = Math.max(p.vx - accel*dt, -240); p.facing = -1; }
  if (k.right) { p.vx = Math.min(p.vx + accel*dt,  240); p.facing = 1; }
  if (!k.left && !k.right) p.vx *= 0.82;

  // jump
  if (k.up && p.grounded) { p.vy = -520; p.grounded=false; beep(660); }

  // attack
  if (k.attack && p.cooldown<=0) { p.anim="attack"; p.cooldown = .35; beep(880,.06,.04); }
  if (p.cooldown>0) p.cooldown -= dt;

  // integrate
  p.x += p.vx*dt;
  p.y += p.vy*dt;

  // floor
  if (p.y >= 420) { p.y = 420; p.vy = 0; p.grounded = true; }

  // walls
  p.x = Math.max(16, Math.min(p.x, canvas.width - p.w - 16));

  // anim
  if (p.anim !== "attack") {
    if (!p.grounded) p.anim = "jump";
    else if (Math.abs(p.vx)>20) p.anim="walk";
    else p.anim="idle";
  } else if (p.cooldown<=0) {
    p.anim = "idle";
  }

  // spawn enemies
  const spawnGap = (state.mode === "endless") ? 850 : 1200;
  if (now - state.lastSpawn > spawnGap) {
    state.lastSpawn = now;
    const side = Math.random()<.5 ? -1 : 1;
    state.enemies.push({
      x: side<0 ? canvas.width-120 : 40, y: 420, w:64, h:64,
      vx: side * 40, hp: 20, anim:"walk", hitlock:0
    });
  }

  // update enemies
  state.enemies.forEach(e=>{
    if (e.hitlock>0){ e.hitlock-=dt; e.anim="hurt"; return; }
    e.x += e.vx*dt * (1+Math.random()*0.2);
    if (Math.random()<0.01) e.vx*=-1;

    // simple chase
    e.vx = Math.sign((p.x+32) - (e.x+32)) * 60;

    // collision with player (damage)
    if (rectHit(e, p) && p.anim!=="attack"){
      p.hp = Math.max(0, p.hp - 8);
      document.getElementById("hpFill").style.width = `${p.hp}%`;
      p.anim="hurt"; beep(220,.06,.05);
      if (p.hp<=0){ endRound(false); }
    }

    // player attack hits
    if (p.anim==="attack" && rectHit({x:p.x + p.facing*30, y:p.y, w:50, h:40}, e)){
      e.hp -= 10; e.hitlock=.2; beep(520,.05,.04);
      if (e.hp<=0){ e.anim="death"; e.vx=0; state.score+=50; document.getElementById("scoreNum").textContent = state.score; }
    }

    // keep on floor
    e.y=420;
  });

  // remove dead
  state.enemies = state.enemies.filter(e=>!(e.anim==="death" && (e._deadTime=(e._deadTime||0)+dt)>0.4));
}

function endRound(win){
  state.running=false;
  setPaused(true);
}

function rectHit(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function draw() {
  // backdrop
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackdrop();
  const p = state.player;

  // player
  if (p) drawSprite(p.x, p.y, p.anim, p.facing);

  // enemies
  state.enemies.forEach(e => drawSprite(e.x, e.y, e.anim, Math.sign(e.vx)||1));
}

function imgFor(anim, faction="usagi") {
  const A = state.assets;
  const key = `${faction}_${anim}`;
  return A[key] || A[`${faction}_idle`];
}

function drawSprite(x,y,anim,facing){
  const faction = (anim==="hurt"||anim==="death") ? "usagi" : undefined;
  // Player uses 'usagi_*', enemies 'ninja_*'
  let img;
  if (faction) img = imgFor(anim,"usagi");
  else img = state.assets[`ninja_${anim}`] ? undefined : null; // no-op

  // Decide whether we’re drawing player or enemy by checking hit list in update()
  // Safer approach: look up both
  const pImg = imgFor(anim,"usagi");
  const nImg = imgFor(anim,"ninja");

  // If very near left/right we choose based on y baseline (hack: player y < enemy y usually equal)
  // For clarity in this sample, we just draw both callers explicitly:
  // Draw 'anim' for caller by width heuristic (player uses pImg when the function invoked for player)

  ctx.save();
  ctx.translate(x + 32, y + 32);
  ctx.scale(facing<0 ? -1 : 1, 1);

  // Choose image based on bounding box (player call passes anim for player; enemies handled in draw() above)
  // We detect "is player" via presence in state.player position match:
  if (Math.abs(state.player.x - x)<1 && Math.abs(state.player.y - y)<1) {
    const imgP = pImg;
    ctx.drawImage(imgP, -imgP.width/2, -imgP.height/2);
  } else {
    const imgN = nImg;
    ctx.drawImage(imgN, -imgN.width/2, -imgN.height/2);
  }

  ctx.restore();
}

function drawBackdrop(){
  // simple parallax stripes
  const w = canvas.width, h = canvas.height;
  const g = ctx.createLinearGradient(0, h*0.2, 0, h);
  g.addColorStop(0, "#0b1324"); g.addColorStop(1, "#0a0f18");
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);

  // floor line
  ctx.fillStyle="#0e1726";
  ctx.fillRect(0, 484, w, 4);
  ctx.fillStyle="rgba(255,255,255,.04)";
  for(let i=0;i<40;i++){
    const x = (i*64 + (performance.now()/20)%64)%w;
    ctx.fillRect(x, 490, 32, 3);
  }
}
