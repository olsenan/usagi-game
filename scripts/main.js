// App entry (module)
import { initGame, startGame, startEndless, togglePause, resumeGame, quitToTitle } from './game.js';
import { bindUI, showTitle } from './ui.js';

async function boot(){
  bindUI({
    onStart:   ()=> startGame(),
    onEndless: ()=> startEndless(),
    onResume:  ()=> resumeGame(),
    onQuit:    ()=> quitToTitle(),
  });
  showTitle();
  await initGame();
}
boot();
