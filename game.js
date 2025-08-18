const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameStarted = false;

function startGame() {
  document.getElementById("title-screen").style.display = "none";
  gameStarted = true;
  gameLoop();
}

// Placeholder Usagi sprite
const usagi = { x: 50, y: 300, w: 50, h: 50, color: "white", dx: 0, dy: 0, jumping: false };

// Enemy list
let enemies = [{ x: 400, y: 300, w: 50, h: 50, color: "red" }];

function drawUsagi() {
  ctx.fillStyle = usagi.color;
  ctx.fillRect(usagi.x, usagi.y, usagi.w, usagi.h);
}

function drawEnemies() {
  enemies.forEach(e => {
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x, e.y, e.w, e.h);
  });
}

function gameLoop() {
  if (!gameStarted) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawUsagi();
  drawEnemies();
  requestAnimationFrame(gameLoop);
}

// Controls
document.getElementById("left").addEventListener("touchstart", () => usagi.x -= 10);
document.getElementById("right").addEventListener("touchstart", () => usagi.x += 10);
document.getElementById("jump").addEventListener("touchstart", () => { if (!usagi.jumping) { usagi.jumping = true; usagi.dy = -15; } });
document.getElementById("attack").addEventListener("touchstart", () => {
  enemies = enemies.filter(e => !(usagi.x < e.x + e.w && usagi.x + usagi.w > e.x && usagi.y < e.y + e.h && usagi.y + usagi.h > e.y));
});