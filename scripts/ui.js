// scripts/ui.js
// Robust UI bootstrap: waits for DOM and tolerates either kebab-case or camelCase IDs.
export function bootUI(actions) {
  const init = () => {
    const $ = (id) => document.getElementById(id);
    const pick = (...ids) => ids.map($).find(Boolean);
    const req = (el, ...names) => {
      if (!el) console.error("Missing UI element with id:", names.join(" or "));
      return el;
    };

    // Accept both naming schemes
    const btnStart    = req(pick("btnStart",   "btn-start"),   "btnStart",   "btn-start");
    const btnEndless  = req(pick("btnEndless", "btn-challenge"), "btnEndless","btn-challenge");
    const btnResume   = req(pick("btnResume",  "btn-resume"),  "btnResume",  "btn-resume");
    const btnQuit     = req(pick("btnQuit",    "btn-quit"),    "btnQuit",    "btn-quit");

    // Optional panels/HUD (don’t fail if your HTML names differ)
    const titlePanel  = pick("title", "title-screen");
    const pausedPanel = pick("paused", "pause-screen");
    const hud         = $("hud");

    if (btnStart)   btnStart.onclick   = () => actions.start && actions.start();
    if (btnEndless) btnEndless.onclick = () => actions.endless && actions.endless();
    if (btnResume)  btnResume.onclick  = () => actions.resume && actions.resume();
    if (btnQuit)    btnQuit.onclick    = () => actions.quit && actions.quit();

    // A couple helpers you may call from game code if you want
    window.__UI = {
      showTitle(show=true){ if (titlePanel) titlePanel.classList.toggle("hidden", !show); },
      showPaused(show=true){ if (pausedPanel) pausedPanel.classList.toggle("hidden", !show); },
      showHUD(show=true){ if (hud) hud.classList.toggle("hidden", !show); },
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return actions || {};
}
