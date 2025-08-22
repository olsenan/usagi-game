(async function () {
  const canvas = document.getElementById("game");

  // Load assets + manifest
  await Loader.init();

  const game = new Game(canvas);

  // UI wiring
  UI.show("title");

  document.getElementById("btn-start").addEventListener("click", () => {
    UI.hideAll();
    game.start("story");
  });

  document.getElementById("btn-challenge").addEventListener("click", () => {
    UI.hideAll();
    game.start("challenge");
  });

  document.getElementById("btn-resume").addEventListener("click", () => {
    game.resume();
  });

  document.getElementById("btn-quit").addEventListener("click", () => {
    game.quitToMenu();
  });

  document.getElementById("btn-retry").addEventListener("click", () => {
    UI.hideAll();
    game.start(game.mode);
  });

  document.getElementById("btn-menu").addEventListener("click", () => {
    game.quitToMenu();
  });

  const saveBtn = document.getElementById("btn-save-score");
  const initialsInput = document.getElementById("initials");
  saveBtn.addEventListener("click", () => {
    const val = (initialsInput.value || "AAA").toUpperCase().slice(0,3);
    const scoreText = document.getElementById("final-score").textContent;
    const score = parseInt(scoreText.replace(/\D+/g, ""), 10) || 0;
    UIStorage.saveScore(val, score);
    UI.refreshScores();
  });

  // Escape from overlays on Enter
  window.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      const titleVisible = document.getElementById("title-screen").classList.contains("visible");
      const pauseVisible = document.getElementById("pause-screen").classList.contains("visible");
      const overVisible = document.getElementById("gameover-screen").classList.contains("visible");
      if (titleVisible) document.getElementById("btn-start").click();
      else if (pauseVisible) document.getElementById("btn-resume").click();
      else if (overVisible) document.getElementById("btn-retry").click();
    }
  });
})();
