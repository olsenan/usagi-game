// scripts/ui.js
const $ = sel => document.querySelector(sel);
const show = el => el.classList.add('visible');
const hide = el => el.classList.remove('visible');
const hideEl = el => el.classList.add('hidden');
const showEl = el => el.classList.remove('hidden');

function bind(btn, handler){
  if(!btn || !handler) return;
  // Make taps always fire:
  btn.addEventListener('pointerup', e => { e.preventDefault(); handler(); }, { passive:false });
  btn.addEventListener('click',     e => { e.preventDefault(); handler(); });
}

export function bindUI({ onStart, onEndless, onResume, onQuit }){
  bind($('#btnStart'),   onStart);
  bind($('#btnEndless'), onEndless);
  bind($('#btnResume'),  onResume);
  bind($('#btnQuit'),    onQuit);
}

export function showTitle(){
  show($('#title')); hide($('#paused')); hideEl($('#hud'));
}
export function showHUD(){
  hide($('#title')); hide($('#paused')); showEl($('#hud'));
}
export function showPaused(){
  hide($('#title')); show($('#paused')); showEl($('#hud'));
}

export function setHealth(pct){
  $('#hpFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
export function setScore(n){
  $('#scoreNum').textContent = String(n|0);
}
