// Debug overlay for FPS, frame index, and flip toggle.
// Toggle: ` (backtick) or F1. Flip: F. Facing state at window.FACING_LEFT.
(function(global){
  const state = {
    enabled: false,
    facingLeft: false,
    sprites: new Map(),
    fps: 0, _lastTs: performance.now(), _acc: 0, _frames: 0,
  };
  function registerSprite(name, sprite){ state.sprites.set(name, sprite); }
  function toggle(){ state.enabled = !state.enabled; }
  function toggleFacing(){ state.facingLeft = !state.facingLeft; global.FACING_LEFT = state.facingLeft; }
  function onKey(e){
    if(e.key === '`' || e.key === 'F1'){ e.preventDefault(); toggle(); }
    if(e.key.toLowerCase() === 'f'){ toggleFacing(); }
  }
  window.addEventListener('keydown', onKey);
  function tick(){
    const now = performance.now();
    const dt = (now - state._lastTs) / 1000;
    state._lastTs = now; state._acc += dt; state._frames++;
    if(state._acc >= 0.5){
      state.fps = Math.round(state._frames / state._acc);
      state._acc = 0; state._frames = 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function drawOverlay(ctx){
    if(!state.enabled || !ctx) return;
    const pad = 8;
    const lines = [
      'DEBUG OVERLAY (toggle: ` or F1)',
      `FPS: ${state.fps}`,
      `Facing Left (F): ${state.facingLeft ? 'YES' : 'NO'}`
    ];
    for(const [name, spr] of state.sprites.entries()){
      const idx = (spr && typeof spr.index === 'number') ? spr.index : '?';
      const fps = (spr && spr.fps) ? spr.fps : '?';
      lines.push(`${name}: frame ${idx}/${spr?.frames ?? '?'}, anim ${fps} fps`);
    }
    ctx.save();
    ctx.font = '12px monospace';
    const w = 260, h = pad + lines.length*16 + pad;
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#000'; ctx.fillRect(pad, pad, w, h);
    ctx.globalAlpha = 1.0; ctx.fillStyle = '#0f0';
    for(let i=0;i<lines.length;i++){ ctx.fillText(lines[i], pad+8, pad+16*(i+1)); }
    ctx.restore();
  }
  global.DebugOverlay = { registerSprite, drawOverlay, toggle, toggleFacing, state };
  global.FACING_LEFT = state.facingLeft;
})(window);
