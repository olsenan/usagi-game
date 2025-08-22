const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Resize canvas to full screen
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let gameRunning = false;
let spriteManifest = null;
let loadedImages = {};
let player = { x: 100, y: 100, frame: 0, anim: "idle", frameTime: 0 };

// Load sprite manifest
fetch("assets/sprites/sprite_manifest.json")
  .then(res => res.json())
  .then(data => {
    spriteManifest = data;
    preloadSprites();
  });

function preloadSprites() {
  Object.values(spriteManifest.usagi).forEach(anim => {
    const img = new Image();
    img.src = anim.path;
    loadedImages[anim.path] = img;
  });
  Object.values(spriteManifest.ninja).forEach(anim => {
    const img = new Image();
    img.src = anim.path;
    loadedImages[anim.path] = img;
  });
}

// Start game
document.getElementById("start-button").addEventListener("click", () => {
  document.getElementById("title-screen").style.display = "none";
  canvas.style.display = "block";
  document.getElementById("controls").style.display = "block";
  gameRunning = true;
  gameLoop();
});

function gameLoop(timestamp) {
  if (!gameRunning) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw player
  drawPlayer();

  requestAnimationFrame(gameLoop);
}

function drawPlayer() {
  if (!spriteManifest) return;
  const anim = spriteManifest.usagi[player.anim];
  const img = loadedImages[anim.path];
  if (!img) return;

  const frameWidth = img.width / anim.frames;
  const frameHeight = img.height;
  ctx.drawImage(
    img,
    frameWidth * player.frame,
    0,
    frameWidth,
    frameHeight,
    player.x,
    player.y,
    frameWidth,
    frameHeight
  );

  // Animate
  player.frameTime++;
  if (player.frameTime > 60 / anim.fps) {
    player.frame = (player.frame + 1) % anim.frames;
    player.frameTime = 0;
  }
}

// Simple controls (placeholder)
document.getElementById("left-btn").addEventListener("touchstart", () => player.x -= 10);
document.getElementById("right-btn").addEventListener("touchstart", () => player.x += 10);
document.getElementById("jump-btn").addEventListener("touchstart", () => player.anim = "jump");
document.getElementById("attack-btn").addEventListener("touchstart", () => player.anim = "attack");
