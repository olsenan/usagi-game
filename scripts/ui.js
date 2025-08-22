// scripts/ui.js
// Event delegation so we never touch null elements; supports kebab/camel IDs.

export function bootUI(actions = {}) {
  const map = {
    "btnStart": "start", "btn-start": "start",
    "btnEndless": "endless", "btn-challenge": "endless",
    "btnResume": "resume", "btn-resume": "resume",
    "btnQuit": "quit", "btn-quit": "quit"
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = map[btn.id];
    if (act && typeof actions[act] === "function") actions[act]();
  });

  const $ = (sel) => document.querySelector(sel);
  window.__UI = {
    showTitle(show=true){
      const el = $("#title") || $("#title-screen");
      if (el) { el.classList.toggle("hidden", !show); el.classList.toggle("visible", show); }
    },
    showPaused(show=true){
      const el = $("#paused") || $("#pause-screen");
      if (el) { el.classList.toggle("hidden", !show); el.classList.toggle("visible", show); }
    },
    showHUD(show=true){
      const el = $("#hud");
      if (el) el.classList.toggle("hidden", !show);
    }
  };
}
