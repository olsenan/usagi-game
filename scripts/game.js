// scripts/game.js
"use strict";

import { bootUI } from "./ui.js";
import { loadSheets, AnimDefs } from "./preload.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Tunables
const K = { GRAV: 1500, SPEED: 240, JUMP: 520 };

let world = null;

// Tiny WebAudio beeps so we don't need audio files yet
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
  constructor(sheet) {
    Object.assign(this, sheet); // img, frames, fps, loop, hitFrames
    this.time = 0;
    this.frame = 0;
  }
  reset() { this.time = 0; this.frame = 0; }
  update(dt) {
    const total = Math.max(1, this.frames | 0);
    const f = (this.fps || 8) * (this.time += dt);
    this.frame = this.loop ? Math.floor(f) % total : Math.min(total - 1, Math.floor(f));
  }
}

function makeEntity(kind, sheets, x, y) {
  const anims = {};
  for (const [state, meta] of Object.entries(sheets[kind])) {
    anims[state] = new Animated(meta);
  }
  return {
    kind, x, y,
    vx: 0, vy: 0,
    dir: 1,
    hp: kind === "usagi" ? 100 : 30,
    maxHp: kind === "usagi" ? 100 : 30,
    state: "idle",
    anims,
    inv: 0,
    atkLock: 0
  };
}

function current(e) { return e.anims[e.state] || e.anims.idle; }

function hitbox(e) { // rectangular hitbox tuned for 96x96 frames
  return { x: e.x - 20, y: e.y - 64, w: 40, h: 60 };
}
function intersects(a, b) {
  const A = hitbox(a), B = hitbox(b);
  return A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y;
}

export function isRunning() { return !!(world && world.running); }
export function setPaused(p) {
  if (!world) return;
  world.paused = !!p;
  window.__UI?.showPaused(!!p);
}
export function quitGame() {
  if (!world) return;
  world.running = false;
  window.__UI?.showTitle(true);
  window.__UI?.showHUD(false);
}

export async function startGame({ mode }) {
  if (world?.running) return;

  // Show HUD, hide title
  window.__UI?.showTitle(false);
  window.__UI?.showHUD(true);

  const sheets = await loadSheets();

  world = {
    running: true,
    paused: false,
    mode: mode || "story",
    sheets,
    player: makeEntity("usagi", sheets, 120, AnimDefs.meta.groundY),
    enemies: [],
    groundY: AnimDefs.meta.groundY,
    scale: AnimDefs.meta.scale || 2.5,
    last: performance.now(),
    lastSpawn: 0,
    score: 0,
    input: { left: false, right: false, up: false, atk: false }
  };

  setupInput(world.input);
  requestAnimationFrame(loop);
}

function setupInput(k) {
  const set = (c, v) => { k[c] = v; };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const key = e.key;
    if (key === "ArrowLeft" || key === "a") set("left", true);
    if (key === "ArrowRight" || key === "d") set("right", true);
    if (key === "ArrowUp" || key === "w" || key === " ") set("up", true);
    if (key === "j" || key === "k" || key === "Enter") set("atk", true);
    if (key === "Escape" && isRunning()) setPaused(true);
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key;
    if (key === "ArrowLeft" || key === "a") set("left", false);
    if (key === "ArrowRight" || key === "d") set("right", false);
    if (key === "ArrowUp" || key === "w" || key === " ") set("up", false);
    if (key === "j" || key === "k" || key === "Enter") set("atk", false);
  });
}

function loop(now) {
  if (!world?.running) return;
  const t = now ?? performance.now();
  const dt = Math.min(33, t - world.last) / 1000;
  world.last = t;

  if (!world.paused) update(dt, t);
  draw();

  requestAnimationFrame(loop);
}

function update(dt, now) {
  const p = world.player;
  const k = world.input;

  // Gravity
  p.vy += K.GRAV * dt;

  // Movement
  if (k.left) { p.vx = -K.SPEED; p.dir = -1; }
  else if (k.right) { p.vx = K.SPEED; p.dir = 1; }
  else p.vx *= 0.82;

  // Jump
  if (k.up && onGround(p)) { p.vy = -K.JUMP; beep(660); }

  // Attack
  if (k.atk && p.atkLock <= 0) { p.state = "attack"; p.atkLock = 0.35; beep(880, 0.06, 0.04); }
  if (p.atkLock > 0) p.atkLock -= dt;

  // Integrate
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  floorSnap(p);

  // State machine
  if (p.atkLock > 0) {
    // stay in attack
  } else if (!onGround(p)) {
    p.state = "jump";
  } else if (Math.abs(p.vx) > 20) {
    p.state = "walk";
  } else {
    p.state = "idle";
  }

  // Spawning
  const gap = world.mode === "endless" ? 900 : 1400;
  if (now - world.lastSpawn > gap) {
    world.lastSpawn = now;
    const side = Math.random() < 0.5 ? -1 : 1;
    const e = makeEntity("ninja", world.sheets, side < 0 ? canvas.width - 120 : 40, world.groundY);
    e.vx = side * 60;
    e.state = "walk";
    world.enemies.push(e);
  }

  // Enemies
  for (const e of world.enemies) {
    if (e.inv > 0) e.inv -= dt;

    // Chase player
    e.vx = Math.sign(p.x - e.x) * 80;
    e.vy += K.GRAV * dt;

    // Attack if close and grounded
    if (Math.abs(p.x - e.x) < 70 && onGround(e)) {
      e.state = "attack";
      if (e.inv <= 0 && intersects(e, p) && p.atkLock <= 0) {
        p.hp = Math.max(0, p.hp - 8);
        document.getElementById("hpFill").style.width = `${p.hp}%`;
        beep(220, 0.06, 0.05);
        if (p.hp <= 0) { world.running = false; setPaused(true); }
      }
    } else {
      e.state = Math.abs(e.vx) > 10 ? "walk" : "idle";
    }

    // Player hit window
    const pAnim = current(p);
    if (p.state === "attack" && hitFrame("usagi", "attack", pAnim.frame)) {
      const inFront = p.dir === 1 ? (e.x > p.x && e.x - p.x < 80) : (e.x < p.x && p.x - e.x < 80);
      if (inFront && intersects(p, e)) {
        if (e.inv <= 0) { e.hp -= 10; e.inv = 0.2; beep(520, 0.05, 0.04); }
      }
    }

    // Integrate enemy & clamp to floor
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    floorSnap(e);
  }

  // Remove dead enemies, add score
  world.enemies = world.enemies.filter(e => {
    if (e.hp <= 0) {
      world.score += 50;
      document.getElementById("scoreNum").textContent = world.score;
      return false;
    }
    return true;
  });

  // Advance animations
  current(p).update(dt);
  for (const e of world.enemies) current(e).update(dt);
}

function hitFrame(who, state, frame) {
  const def = (who === "usagi" ? AnimDefs.usagi : AnimDefs.ninja)[state];
  return (def.hitFrames || []).includes(frame);
}

function onGround(e) { return e.y >= world.groundY; }
function floorSnap(e) {
  if (e.y > world.groundY) { e.y = world.groundY; e.vy = 0; }
}

function draw() {
  const w = canvas.width, h = canvas.height;

  // Background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b1324"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0a0f18"; ctx.fillRect(0, h * 0.55, w, h * 0.45);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.beginPath(); ctx.moveTo(0, (world?.groundY ?? 420) + 1); ctx.lineTo(w, (world?.groundY ?? 420) + 1); ctx.stroke();

  if (!world) return;

  // Player + enemies
  drawEntity(world.player);
  for (const e of world.enemies) drawEntity(e);
}

function drawEntity(e) {
  const fw = AnimDefs.meta.frameW, fh = AnimDefs.meta.frameH;
  const scale = AnimDefs.meta.scale || 2.5;
  const sheet = world.sheets[e.kind][e.state] || world.sheets[e.kind].idle;
  const anim = current(e);
  const sx = Math.min((sheet.frames || 1) - 1, anim.frame) * fw;

  ctx.save();
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.scale(e.dir, 1);
  ctx.translate(-Math.round(fw * scale * 0.5), -Math.round(fh * scale));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.img, sx, 0, fw, fh, 0, 0, Math.round(fw * scale), Math.round(fh * scale));
  ctx.restore();
}

// Wire UI (safe even if IDs differ; ui.js uses delegation)
bootUI({
  start:   () => startGame({ mode: "story" }),
  endless: () => startGame({ mode: "endless" }),
  resume:  () => setPaused(false),
  quit:    () => quitGame()
});
