window.addEventListener("DOMContentLoaded", () => {
  const titleScreen = document.getElementById("title-screen");
  const startButton = document.getElementById("start-button");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  let gameStarted = false;
  let sprites = {};

  // --- Load assets safely ---
  function loadSprite(name, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        sprites[name] = img;
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`⚠️ Failed to load ${src}`);
        resolve(null);
      };
    });
  }

  async function preloadAssets() {
    await Promise.all([
      loadSprite("usagi", "assets/usagi_walk.png"),
      loadSprite("ninja", "assets/ninja_walk.png"),
      loadSprite("bg", "assets/background.png")
    ]);
  }

  // --- Start game ---
  function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    titleScreen.style.display = "none";
    canvas.style.display = "block";

    preloadAssets().then(() => {
      initGameLoop();
    });
  }

  // --- Input bindings ---
  startButton.addEventListener("click", startGame);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame();
  });
  document.addEventListener("touchstart", () => {
    if (!gameStarted) startGame();
  });

  // --- Game loop ---
  let frame = 0;
  function initGameLoop() {
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // background
      if (sprites.bg) ctx.drawImage(sprites.bg, 0, 0, canvas.width, canvas.height);

      // test draw usagi
      if (sprites.usagi) {
        let sx = (frame % 5) * 64; // 64px frame width
        ctx.drawImage(sprites.usagi, sx, 0, 64, 64, 100, 300, 64, 64);
      }

      // test draw ninja
      if (sprites.ninja) {
        let sx = (frame % 5) * 64;
        ctx.drawImage(sprites.ninja, sx, 0, 64, 64, 600, 300, 64, 64);
      }

      frame++;
      requestAnimationFrame(loop);
    }
    loop();
  }
});
