// scripts/ui.js
import { setPaused, isRunning } from "./game.js";

export function bootUI(actions){
  const $ = (id) => document.getElementById(id);

  $("#btnStart").onclick = () => actions.start();
  $("#btnEndless").onclick = () => actions.endless();
  $("#btnResume").onclick = () => setPaused(false);
  $("#btnQuit").onclick = () => actions.quit();

  // click canvas to focus
  document.getElementById("game").addEventListener("click", ()=> {
    if (isRunning()) document.body.focus();
  });

  return actions;
}
