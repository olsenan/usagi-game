/* Title page hookup + mobile start + keeps your existing loop intact */
document.addEventListener('DOMContentLoaded', () => {
  const BASE_W = 256, BASE_H = 224;

  const root   = document.getElementById('game-root');
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d', { alpha: true });

  const overlay   = document.getElementById('title-overlay');
  const startBtn  = document.getElementById('start-btn');
  const touchUI   = document.getElementById('touch-controls');
  const hudLog    = document.getElementById('hud-log');

  const log = (...a)=>{ const s=a.join(' '); console.log(s); hudLog.textContent = (hudLog.textContent+'\n'+s).trim().slice(-900); };

  // Prevent browser gestures
  ['touchstart','touchmove','gesturestart'].forEach(evt=>{
    root.addEventListener(evt, (e)=>e.preventDefault(), {passive:false});
  });

  // Sizing
  function resizeCanvas() {
    canvas.width = BASE_W; canvas.height = BASE_H;
    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth  / BASE_W,
      window.innerHeight / BASE_H
    )));
    const w = BASE_W * scale, h = BASE_H * scale;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    root.style.width    = canvas.style.width;
    root.style.height   = canvas.style.height;

    const shortest = Math.min(w, h);
    const btn = Math.max(48, Math.min(96, Math.floor(shortest / 6)));
    const gap = Math.max(10, Math.floor(btn * 0.25));
    root.style.setProperty('--btn', `${btn}px`);
    root.style.setProperty('--gap', `${gap}px`);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Start -> hide title, show touch UI, kick game loop
  function startGame(e){
    e?.preventDefault?.();
    overlay.classList.add('hidden');
    overlay.classList.remove('visible');
    touchUI.classList.remove('hidden');

    // Quick visual confirmation (if you don't yet draw game world here)
    ctx.fillStyle = '#102020';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('Game Started', 10, 20);

    // TODO: call your real boot/init here if separate
    log('TITLE -> GAME');
  }

  const opts = { passive:false };
  ['click','pointerup','touchend'].forEach(ev=>{
    startBtn.addEventListener(ev, startGame, opts);
    overlay.addEventListener(ev, startGame, opts); // tap anywhere
  });
  window.addEventListener('keydown', e=>{
    if ((e.code === 'Enter' || e.key === 'Enter') && !overlay.classList.contains('hidden')) startGame(e);
  }, {passive:false});

  // Dummy loop so canvas always draws
  let last = 0;
  function loop(t){
    const dt = Math.min(0.05, (t-last)/1000)||0.0167; last = t;
    // Your existing update/render would live here
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
