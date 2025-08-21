/* =========================================================
   Minimal boot to guarantee Start works on mobile
   - Uses defer script loading (index.html), plus DOMContentLoaded guard
   - Binds click, touchend, pointerup to both button AND overlay
   - Prevents default touch scrolling
   - Draws a background color to prove JS is running
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const root   = document.getElementById('game-root');
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d', { alpha: true });

  const titleOverlay = document.getElementById('title-overlay');
  const startBtn     = document.getElementById('start-btn');
  const touchLayer   = document.getElementById('touch-controls');
  const loadReport   = document.getElementById('load-report');

  // Quick diagnostics so you can see if CSS/JS are active
  const cssProbe = getComputedStyle(document.body).backgroundColor;
  const jsOk = true;
  loadReport.textContent = `CSS: ${cssProbe} • JS: ${jsOk ? 'OK' : 'ERR'}`;

  // Prevent default gestures on the root to stop scrolling swallowing taps
  ['touchstart','touchmove','gesturestart'].forEach(evt=>{
    root.addEventListener(evt, (e)=>e.preventDefault(), {passive:false});
  });

  function startGame(e){
    e?.preventDefault?.();
    titleOverlay.classList.add('hidden');
    touchLayer.classList.remove('hidden');
    // For now, just paint a color so you can confirm it started.
    ctx.fillStyle = '#102020';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('Game Started (mobile tap working)', 10, 20);
  }

  // Attach robust start handlers
  const opts = { passive:false };
  const bindStart = (el) => {
    if (!el) return;
    el.addEventListener('click',     startGame, opts);
    el.addEventListener('pointerup', startGame, opts);
    el.addEventListener('touchend',  startGame, opts);
  };
  bindStart(startBtn);
  bindStart(titleOverlay); // tap anywhere on overlay

  // Also allow Enter on desktop
  window.addEventListener('keydown', (e)=>{
    if ((e.code === 'Enter' || e.key === 'Enter') && !titleOverlay.classList.contains('hidden')) {
      startGame(e);
    }
  }, {passive:false});

  // Basic responsive sizing
  function resizeCanvas() {
    const BASE_W = 256, BASE_H = 224;
    canvas.width = BASE_W; canvas.height = BASE_H;

    const scale = Math.max(1, Math.floor(Math.min(
      window.innerWidth  / BASE_W,
      window.innerHeight / BASE_H
    )));
    const w = BASE_W * scale, h = BASE_H * scale;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    root.style.width  = canvas.style.width;
    root.style.height = canvas.style.height;

    const shortest = Math.min(w, h);
    const btn = Math.max(48, Math.min(96, Math.floor(shortest / 6)));
    const gap = Math.max(10, Math.floor(btn * 0.25));
    root.style.setProperty('--btn', `${btn}px`);
    root.style.setProperty('--gap', `${gap}px`);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
});
