// game.js — SNES style Usagi version

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game",
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 800 },
            debug: false
        }
    },
    scene: { preload, create, update }
};

let player, cursors, startBtn, gameStarted = false;

const game = new Phaser.Game(config);

function preload() {
    // Load background + sprites
    this.load.image("background", "assets/background1.png");
    this.load.spritesheet("usagi",
        "assets/snes_usagi_spritesheet.png",
        { frameWidth: 64, frameHeight: 64 }
    );

    // Example enemies
    this.load.spritesheet("enemy",
        "assets/enemy_ninja.png",
        { frameWidth: 64, frameHeight: 64 }
    );
}

function create() {
    // Background
    this.add.image(config.width / 2, config.height / 2, "background")
        .setDisplaySize(config.width, config.height);

    // Usagi
    player = this.physics.add.sprite(100, config.height - 150, "usagi");
    player.setCollideWorldBounds(true);
    player.setScale(2); // Makes sprite look sharper SNES style

    // Player animations
    this.anims.create({
        key: "idle",
        frames: this.anims.generateFrameNumbers("usagi", { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1
    });
    this.anims.create({
        key: "walk",
        frames: this.anims.generateFrameNumbers("usagi", { start: 4, end: 7 }),
        frameRate: 10,
        repeat: -1
    });
    this.anims.create({
        key: "attack",
        frames: this.anims.generateFrameNumbers("usagi", { start: 8, end: 11 }),
        frameRate: 12,
        repeat: 0
    });

    player.play("idle");

    // Keyboard input
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on("keydown-SPACE", () => player.play("attack", true));

    // Mobile start button
    const startOverlay = document.getElementById("title");
    startBtn = document.getElementById("startBtn");

    const startGame = () => {
        if (!gameStarted) {
            gameStarted = true;
            startOverlay.style.display = "none";
        }
    };

    // Start via button, tap, or Enter
    startBtn.onclick = startGame;
    this.input.on("pointerdown", startGame);
    this.input.keyboard.on("keydown-ENTER", startGame);
}

function update() {
    if (!gameStarted) return;

    if (cursors.left.isDown) {
        player.setVelocityX(-200);
        player.play("walk", true);
        player.setFlipX(true);
    } else if (cursors.right.isDown) {
        player.setVelocityX(200);
        player.play("walk", true);
        player.setFlipX(false);
    } else {
        player.setVelocityX(0);
        player.play("idle", true);
    }

    if (cursors.up.isDown && player.body.touching.down) {
        player.setVelocityY(-450);
    }
}
