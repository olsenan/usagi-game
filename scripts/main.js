(async function () {
  const canvas = document.getElementById("game");

  try {
    await Loader.init();
  } catch (e) {
    console.error(e);
    alert("Failed to initialize assets. If you opened the file directly, use the inline manifest or run a local server.");
  }

  const game = new Game(canvas);

  UI.show("title");

  document.getElementById("btn-start").addEventListener("click", () => {
    UI.hideAll(); game.start("story");
  });
  document.getElementById("btn-challenge").addEventListener("click", () => {
    UI.hideAll(); game.start("challenge");
  });
  document.getElementById("btn-resume").addEventListener("click", () => game.resume());
  document.getElementById("btn-quit").addEventListener("click", () => game.quitToMenu());
  document.getElementById("btn-retry").addEventListener("click", () => { UI.hideAll(); game.start(game.mode); });
  document.getElementById("btn-menu").addEventListener("click", () => game.quitToMenu());

  document.getElementById("btn-save-score").addEventListener("click", () => {
    const val = (document.getElementById("initials").value || "AAA").toUpperCase().slice(0,3);
    const scoreText = document.getElementById("final-score").textContent;
    const score = parseInt(scoreText.replace(/\D+/g, ""), 10) || 0;
    UIStorage.saveScore(val, score);
    UI.refreshScores();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      const vis = s => document.querySelector(s).classList.contains("visible");
      if (vis("#title-screen")) document.getElementById("btn-start").click();
      else if (vis("#pause-screen")) document.getElementById("btn-resume").click();
      else if (vis("#gameover-screen")) document.getElementById("btn-retry").click();
    }
  });
})();
