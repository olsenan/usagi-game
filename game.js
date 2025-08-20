// game.js — Phaser version
'use strict';

let game;

function startPhaserGame() {
  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 800 }, debug: false }
    },
    scene: { preload, create, update }
  };
  game = new Phaser.Game(config);
  document.getElementById('title').style.display = 'none';
}

// --- Scene functions ---
function preload() {
  this.load.image('bg', 'assets/background1.png');
  this.load.spritesheet('usagi', 'assets/snes_usagi_spritesheet.png', { frameWidth: 64, frameHeight: 96 });
  this.load.spritesheet('enemies', 'assets/enemy_sprites.png', { frameWidth: 64, frameHeight: 64 });
}

let player;
let cursors;
let enemies;

function create() {
  // background
  this.add.image(0, 0, 'bg').setOrigin(0).setDisplaySize(this.sys.game.config.width, this.sys.game.config.height);

  // player
  player = this.physics.add.sprite(100, this.sys.game.config.height - 150, 'usagi');
  player.setCollideWorldBounds(true);

  // simple walk animation
  this.anims.create({
    key: 'walk',
    frames: this.anims.generateFrameNumbers('usagi', { start: 0, end: 4 }),
    frameRate: 8,
    repeat: -1
  });

  // cursors
  cursors = this.input.keyboard.createCursorKeys();

  // enemies group
  enemies = this.physics.add.group();
  spawnEnemy(this);
}

function update() {
  if (!player) return;

  player.setVelocityX(0);

  if (cursors.left.isDown) {
    player.setVelocityX(-160);
    player.anims.play('walk', true);
    player.flipX = true;
  } else if (cursors.right.isDown) {
    player.setVelocityX(160);
    player.anims.play('walk', true);
    player.flipX = false;
  } else {
    player.anims.stop();
  }

  if (cursors.space.isDown && player.body.touching.down) {
    player.setVelocityY(-400);
  }
}

// Spawn enemies
function spawnEnemy(scene) {
  const enemy = enemies.create(scene.sys.game.config.width - 50, scene.sys.game.config.height - 150, 'enemies');
  enemy.setCollideWorldBounds(true);
  enemy.setVelocityX(-50);
  scene.time.addEvent({ delay: 3000, callback: () => spawnEnemy(scene) });
}

// --- Start button wiring ---
document.getElementById('startBtn').addEventListener('click', startPhaserGame);
document.getElementById('startBtn').addEventListener('touchstart', e => { e.preventDefault(); startPhaserGame(); });
