// App entry (module)
import {
  initGame, startGame, startEndless, togglePause,
  resumeGame, quitToTitle,
  pressLeft, releaseLeft, pressRight, releaseRight, pressAttack, releaseAttack
} from './game.js';
import { bindUI, showTitle } from './ui.js';
import { attachTouch } from './touch.js';

async function boot(){
  bindUI({
    onStart:   ()=> startGame(),
    onEndless: ()=> startEndless(),
    onResume:  ()=> resumeGame(),
    onQuit:    ()=> quitToTitle(),
  });

  // On-screen touch controls for mobile
  attachTouch({
    pressLeft, releaseLeft, pressRight, releaseRight, pressAttack, releaseAttack, togglePause
  });

  showTitle();
  await initGame();
}
boot();
