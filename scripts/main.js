import {
  initGame, startGame, startEndless, togglePause,
  resumeGame, quitToTitle,
  pressLeft, releaseLeft, pressRight, releaseRight, pressAttack, releaseAttack
} from './game.js';
import { bindUI, showTitle } from './ui.js';
import { attachTouch } from './touch.js';

function enableFirstTouch(){
  // A no-op first user gesture helps iOS unlock some APIs and focuses the canvas.
  const onFirst = () => {
    window.removeEventListener('touchstart', onFirst, {capture:true});
    window.removeEventListener('pointerdown', onFirst, {capture:true});
    // Place any future audio unlock hooks here
  };
  window.addEventListener('touchstart', onFirst, {capture:true, passive:false});
  window.addEventListener('pointerdown', onFirst, {capture:true});
}

async function boot(){
  bindUI({
    onStart:   ()=> startGame(),
    onEndless: ()=> startEndless(),
    onResume:  ()=> resumeGame(),
    onQuit:    ()=> quitToTitle(),
  });
  attachTouch({ pressLeft, releaseLeft, pressRight, releaseRight, pressAttack, releaseAttack, togglePause });
  enableFirstTouch();
  showTitle();
  await initGame();
}
boot();
