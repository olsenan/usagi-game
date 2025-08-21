/* =========================================================
   Usagi Prototype – Mobile-safe Start + Sizing
   - Works on Android/iOS: click + touchend + pointerup
   - Tapping anywhere on the overlay starts the game
   - Prevents touch scrolling from swallowing taps
   - Shows quick CSS/JS load probe
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const BASE_W = 256, BASE_H = 224;

  const root   = document.getElementById('game-root');
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d', { alpha: true });

  const titleOverlay = document.getElementById('title-overlay');
  const startBtn     = document.getElementById('start-btn');
  const touchLayer   = document.getElementById('touch-controls');
  const loadReport   = document.getElementById('load-report');

  // Simple diagnostic so you can see if CSS is applied
  const cssProbe = getComputedStyle(document.body).backgroundColor;
  loadReport.textContent = `CSS: ${cssProbe} • JS: OK`;

  // Prevent default gestures so taps don't get swallowed
  ['touchstart','touchmove','gesturestart'].forEach(evt=>{
    root.addEventListener(evt, (e)=>e.preventDefault(), {passive:false});
  });

  function resizeCanvas() {
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

  function startGame(e){
    e?.preventDefault?.();
    // Hide overlay (remove visible, add hidden)
    titleOverlay.classList.remove('visible');
    titleOverlay.classList.add('hidden');
    touchLayer.classList.remove('hidden');

    // Visual confirmation that game has started
    ctx.fillStyle = '#102020';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('Game Started (mobile tap working)', 10, 20);

    // TODO: from here, init your real game loop/loader
  }

  const opts = { passive:false };
  const bindStart = (el) => {
    if (!el) return;
    el.addEventListener('click',     startGame, opts);
    el.addEventListener('pointerup', startGame, opts);
    el.addEventListener('touchend',  startGame, opts);
  };
  bindStart(startBtn);
  bindStart(titleOverlay); // tap anywhere

  // Keyboard start (desktop)
  window.addEventListener('keydown', (e)=>{
    if ((e.code === 'Enter' || e.key === 'Enter') && !titleOverlay.classList.contains('hidden')) {
      startGame(e);
    }
  }, {passive:false});
});
