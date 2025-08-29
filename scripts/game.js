import { AnimDefs, loadSheets } from './preload.js';
import { SpriteSheet } from './spriteRenderer.js';
import { showTitle, showHUD, showPaused, setHealth, setScore } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const GROUND_Y = AnimDefs.meta.groundY;
const SCALE = AnimDefs.meta.scale;
const FW = AnimDefs.meta.frameW, FH = AnimDefs.meta.frameH;

let RAF = 0, last=0, running=false, paused=false;
let sheets=null;
let player=null;
let score=0, hp=100;

class Animated {
  constructor(sheet){
    this.sheet = new SpriteSheet(sheet);
  }
  reset(){ this.sheet.reset(); }
  update(dt){ this.sheet.update(dt); }
  draw(x,y,{flipX=false}={}){ this.sheet.draw(ctx, x, y, {flipX, scale:SCALE}); }
}

function drawBackground(){
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = '#0e1726';
  ctx.fillRect(0, GROUND_Y + 20, canvas.width, canvas.height - (GROUND_Y + 20));
}

function makePlayer(){
  const idle   = new Animated({ image: sheets.usagi.idle.img,   frames:sheets.usagi.idle.frames,   fps:sheets.usagi.idle.fps,   frameWidth:FW, frameHeight:FH, loop:true });
  const walk   = new Animated({ image: sheets.usagi.walk.img,   frames:sheets.usagi.walk.frames,   fps:sheets.usagi.walk.fps,   frameWidth:FW, frameHeight:FH, loop:true });
  const attack = new Animated({ image: sheets.usagi.attack.img, frames:sheets.usagi.attack.frames, fps:sheets.usagi.attack.fps, frameWidth:FW, frameHeight:FH, loop:false });

  return {
    x: 120, y: GROUND_Y - FH*SCALE, vx: 0, facingLeft:false,
    state: 'idle',
    anims: { idle, walk, attack },
    get anim(){ return this.anims[this.state] || idle; },
  };
}

function update(dt){
  // basic input (arrow keys / AD) for desktop testing; mobile tap could be added later
  const k = input;
  player.vx = (k.right? 120 : 0) - (k.left? 120 : 0);
  if(k.attack){ player.state = 'attack'; } else if(player.vx !== 0){ player.state = 'walk'; } else { player.state = 'idle'; }
  player.facingLeft = player.vx < 0;
  player.x += player.vx * dt;
  player.x = Math.max(0, Math.min(canvas.width - FW*SCALE, player.x));

  // animate
  player.anim.update(dt);
  if(player.state === 'attack' && player.anim.sheet.frame === player.anims.attack.sheet.frames-1 && !k.attack){
    player.state = 'idle';
    player.anims.attack.sheet.reset();
  }
}

function render(){
  drawBackground();
  player.anim.draw(player.x, player.y, { flipX: player.facingLeft });
}

function loop(ts){
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  if(!paused){ update(dt); }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  render();
  RAF = requestAnimationFrame(loop);
}

const input = { left:false, right:false, attack:false };
window.addEventListener('keydown', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') input.left = true;
  if(e.key === 'ArrowRight'|| e.key==='d') input.right = true;
  if(e.key.toLowerCase() === 'j' || e.key===' ') input.attack = true;
  if(e.key.toLowerCase() === 'p'){ togglePause(); }
});
window.addEventListener('keyup', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') input.left = false;
  if(e.key === 'ArrowRight'|| e.key==='d') input.right = false;
  if(e.key.toLowerCase() === 'j' || e.key===' ') input.attack = false;
});

export async function initGame(){
  sheets = await loadSheets();
  player = makePlayer();
  score = 0; hp = 100;
  setHealth(hp); setScore(score);
}

export function startGame(){
  if(running) return;
  showHUD(); paused=false; running=true; last = performance.now();
  RAF = requestAnimationFrame(loop);
}
export function startEndless(){
  // same for now; later: spawn waves + scoring
  startGame();
}
export function togglePause(){
  if(!running) return;
  paused = !paused;
  if(paused) showPaused(); else showHUD();
}
export function resumeGame(){
  if(!running) return;
  paused=false; showHUD();
}
export function quitToTitle(){
  running=false; paused=false;
  cancelAnimationFrame(RAF);
  showTitle();
  ctx.clearRect(0,0,canvas.width,canvas.height);
}
