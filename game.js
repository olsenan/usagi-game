// game.js — Phaser (ES5-safe) using 3x3 Usagi sheet, 256x384 per frame
(function () {
  'use strict';

  // ---- simple on-screen logger (uses the #status box from index.html) ----
  function LOG(m){ try{ if(window._status && _status.show){ _status.show(m); } }catch(e){} try{ console.log(m); }catch(e){} }

  if (!window.Phaser) { LOG('Phaser not loaded — ensure CDN <script> is before game.js'); return; }
  if (!document.getElementById('game')) { LOG('Missing <div id="game"></div>'); }

  // ---- game state in one namespace to avoid redeclare errors ----
  var S = {
    game: null,
    cursors: null,
    player: null,
    enemies: null,
    canAttack: true,
    touch: { left:false, right:false, jump:false, attack:false }
  };

  // ---- assets (case-sensitive) ----
  var BG_PATH     = 'assets/background1.png';
  var USAGI_PATH  = 'assets/snes_usagi_sprite_sheet.png'; // 3x3 grid, 256x384
  var ENEMY_PATH  = 'assets/enemy_sprites.png';

  // ---- wire mobile buttons ----
  var btns = document.querySelectorAll('#touchControls .ctl');
  for (var i=0;i<btns.length;i++){
    (function(btn){
      var key = btn.getAttribute('data-key');
      function down(e){ if(e&&e.preventDefault)e.preventDefault();
        if(key==='ArrowLeft')  S.touch.left  = true;
        if(key==='ArrowRight') S.touch.right = true;
        if(key==='Space')      S.touch.jump  = true;
        if(key==='KeyA')       S.touch.attack= true;
      }
      function up(e){ if(e&&e.preventDefault)e.preventDefault();
        if(key==='ArrowLeft')  S.touch.left  = false;
        if(key==='ArrowRight') S.touch.right = false;
        if(key==='Space')      S.touch.jump  = false;
        if(key==='KeyA')       S.touch.attack= false;
      }
      btn.addEventListener('pointerdown', down, {passive:false});
      btn.addEventListener('pointerup',   up,   {passive:false});
      btn.addEventListener('pointercancel', up, {passive:false});
      btn.addEventListener('pointerleave',  up, {passive:false});
    })(btns[i]);
  }

  // ---- boot wiring ----
  var titleEl = document.getElementById('title');
  var startBtn = document.getElementById('startBtn');

  function boot(){
    if (S.game) return;
    S.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: window.innerWidth,
      height: window.innerHeight,
      physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
      scene: { preload: preload, create: create, update: update }
    });
    if (titleEl) titleEl.style.display = 'none';
    LOG('Boot: Phaser game created.');
  }

  if (startBtn){
    startBtn.addEventListener('click', boot, {passive:true});
    startBtn.addEventListener('touchstart', function(e){ if(e&&e.preventDefault)e.preventDefault(); boot(); }, {passive:false});
  }
  document.addEventListener('keydown', function(e){ if (e && e.key === 'Enter') boot(); });

  // ---- scene: preload ----
  function preload(){
    LOG('Preload: queue assets…');
    this.load.image('bg', BG_PATH + '?v=' + Date.now());

    // Your sheet is 3x3, each frame 256x384
    this.load.spritesheet('usagi', USAGI_PATH + '?v=' + Date.now(), {
      frameWidth: 256,
      frameHeight: 384
    });

    this.load.spritesheet('enemies', ENEMY_PATH + '?v=' + Date.now(), {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.on('filecomplete', function(key){ LOG('Loaded: ' + key); });
    this.load.on('loaderror',   function(file){ LOG('LOAD ERROR: ' + (file && file.src ? file.src : 'unknown')); });
    this.load.on('complete',    function(){ LOG('All assets loaded'); });
  }

  // ---- scene: create ----
  function create(){
    var w = this.scale.width, h = this.scale.height;

    // background
    if (this.textures.exists('bg')){
      var bg = this.add.image(0,0,'bg').setOrigin(0);
      bg.setDisplaySize(w,h);
      this.scale.on('resize', function(sz){
        var W=sz.width,H=sz.height;
        try{ this.cameras.resize(W,H); }catch(e){}
        bg.setDisplaySize(W,H);
      }, this);
    }

    // animations for 3x3 sheet: frames 0..8 (row-major)
    // row0: 0,1,2 (idle/walk); row1: 3,4,5 (light attack); row2: 6,7,8 (heavy)
    this.anims.create({ key:'idle',   frames: this.anims.generateFrameNumbers('usagi', { start:0, end:1 }), frameRate: 4,  repeat:-1 });
    this.anims.create({ key:'walk',   frames: this.anims.generateFrameNumbers('usagi', { start:0, end:2 }), frameRate: 10, repeat:-1 });
    this.anims.create({ key:'attack', frames: this.anims.generateFrameNumbers('usagi', { start:3, end:5 }), frameRate: 14, repeat:0  });
    this.anims.create({ key:'heavy',  frames: this.anims.generateFrameNumbers('usagi', { start:6, end:8 }), frameRate: 12, repeat:0  });

    // player
    S.player = this.physics.add.sprite(100, h - 150, 'usagi', 0).setCollideWorldBounds(true);

    // scale the big 256x384 frames down to ~128px tall
    var targetH = 128;
    var scale   = targetH / 384;   // 384 is frameHeight
    S.player.setScale(scale);
    S.player.play('idle');

    // input
    S.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', function(){ tryAttack(); });

    // enemies
    S.enemies = this.physics.add.group({ allowGravity:false });
    spawnEnemy(this);
    this.time.addEvent({ delay: 1800, loop: true, callback: function(){ spawnEnemy(this); }, callbackScope: this });
  }

  // ---- scene: update ----
  function update(){
    var p = S.player;
    if (!p || !p.body) return;

    var left   = (S.cursors && S.cursors.left.isDown)  || S.touch.left;
    var right  = (S.cursors && S.cursors.right.isDown) || S.touch.right;
    var jump   = (S.cursors && S.cursors.up.isDown)    || S.touch.jump;
    var attack = S.touch.attack;

    p.setVelocityX(0);
    if (left){  p.setVelocityX(-180); p.flipX = true;  p.play('walk', true); }
    else if (right){ p.setVelocityX(180);  p.flipX = false; p.play('walk', true); }
    else { p.play('idle', true); }

    if (jump && p.body.touching.down) p.setVelocityY(-420);
    if (attack) tryAttack();

    S.enemies.children.iterate(function(e){ if (e && e.x < -e.width) e.destroy(); });
  }

  // ---- attack ----
  function tryAttack(){
    if (!S.canAttack || !S.player) return;
    S.canAttack = false;
    S.player.play('attack', true);
    setTimeout(function(){ S.canAttack = true; }, 250);

    S.enemies.children.iterate(function(e){
      if (!e) return;
      var dx = Math.abs(e.x - S.player.x), dy = Math.abs(e.y - S.player.y);
      if (dx < 70 && dy < 40){
        e.setVelocityX(-120); e.setTint(0xffaaaa);
        setTimeout(function(){ if (e && e.clearTint) e.clearTint(); }, 200);
      }
    });
  }

  // ---- enemy spawn ----
  function spawnEnemy(scene){
    var w = scene.scale.width, h = scene.scale.height;
    var e;
    if (scene.textures.exists('enemies')) {
      e = S.enemies.create(w + 32, h - 150, 'enemies');
    } else {
      // magenta fallback so you see something even without art
      var g = scene.add.graphics();
      g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
      var key = 'enemy_fallback_' + Math.random().toString(36).slice(2,8);
      g.generateTexture(key,64,64); g.destroy();
      e = S.enemies.create(w + 32, h - 150, key);
    }
    e.setVelocityX(-50 - Math.random()*40);
  }
})();
