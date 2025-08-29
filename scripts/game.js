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

const input = { left:false, right:false, attack:false };

// Exported control functions (used by touch.js)
export function pressLeft(){ input.left = true; }
export function releaseLeft(){ input.left = false; }
export function pressRight(){ input.right = true; }
export function releaseRight(){ input.right = false; }
export function pressAttack(){ input.attack = true; }
export function releaseAttack(){ input.attack = false; }

function update(dt){
  // Movement & state
  player.vx = (input.right? 120 : 0) - (input.left? 120 : 0);
  if(input.attack){ player.state = 'attack'; } else if(player.vx !== 0){ player.state = 'walk'; } else { player.state = 'idle'; }
  player.facingLeft = player.vx < 0;
  player.x += player.vx * dt;
  player.x = Math.max(0, Math.min(canvas.width - FW*SCALE, player.x));

  // animate
  player.anim.update(dt);
  if(player.state === 'attack' && player.anim.sheet.frame === player.anims.attack.sheet.frames-1 && !input.attack){
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

// Desktop keyboard (still supported)
window.addEventListener('keydown', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') pressLeft();
  if(e.key === 'ArrowRight'|| e.key==='d') pressRight();
  if(e.key.toLowerCase() === 'j' || e.key===' ') pressAttack();
  if(e.key.toLowerCase() === 'p'){ togglePause(); }
});
window.addEventListener('keyup', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') releaseLeft();
  if(e.key === 'ArrowRight'|| e.key==='d') releaseRight();
  if(e.key.toLowerCase() === 'j' || e.key===' ') releaseAttack();
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
