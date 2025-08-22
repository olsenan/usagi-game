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
    vx:
