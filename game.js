// game.js — Production-safe Phaser build (ES5)
// - Namespaced state to avoid "already declared" errors
// - Auto-slices Usagi image into frames (common layouts + fallback)
// - Mobile buttons wired
// - Visible logs to on-page banner

(function(){
  'use strict';

  // ---------- simple logger ----------
  function LOG(m){
    try { if (window._status && _status.show) { _status.show(m); } } catch (e) {}
    try { console.log(m); } catch (e) {}
  }

  // ---------- env checks ----------
  if (!window.Phaser) { LOG('Phaser not loaded — ensure CDN script is before game.js'); return; }
  if (!document.getElementById('game')) { LOG('Missing <div id="game"></div>'); }

  // ---------- global-ish game state (namespaced) ----------
  var gameState = {
    game: null,
    player: null,
    cursors: null,
    enemies: null,
    canAttack: true,
    touch: { left:false, right:false, jump:false, attack:false }
  };

  // ---------- paths (case-sensitive) ----------
  var BG_PATH     = 'assets/background1.png';
  var USAGI_IMG   = 'assets/snes_usagi_sprite_sheet.png'; // your multi-frame PNG
  var ENEMY_SHEET = 'assets/enemy_sprites.png';

  // ---------- wire touch controls ----------
  var btns = document.querySelectorAll('#touchControls .ctl');
  for (var i=0; i<btns.length; i++){
    (function(btn){
      var key = btn.getAttribute('data-key');
      function down(e){ if(e && e.preventDefault) e.preventDefault();
        if(key==='ArrowLeft')  gameState.touch.left  = true;
        if(key==='ArrowRight') gameState.touch.right = true;
        if(key==='Space')      gameState.touch.jump  = true;
        if(key==='KeyA')       gameState.touch.attack= true;
      }
      function up(e){ if(e && e.preventDefault) e.preventDefault();
        if(key==='ArrowLeft')  gameState.touch.left  = false;
        if(key==='ArrowRight') gameState.touch.right = false;
        if(key==='Space')      gameState.touch.jump  = false;
        if(key==='KeyA')       gameState.touch.attack= false;
      }
      btn.addEventListener('pointerdown', down, {passive:false});
      btn.addEventListener('pointerup',   up,   {passive:false});
      btn.addEventListener('pointercancel', up, {passive:false});
      btn.addEventListener('pointerleave',  up, {passive:false});
    })(btns[i]);
  }

  // ---------- boot wiring ----------
  var titleEl = document.getElementById('title');
  var startBtn = document.getElementById('startBtn');

  function boot(){
    if (gameState.game) return;
    gameState.game = new Phaser.Game({
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
    startBtn.addEventListener('touchstart', function(e){ if(e&&e.preventDefault) e.preventDefault(); boot(); }, {passive:false});
  }
  document.addEventListener('keydown', function(e){ if (e && e.key === 'Enter') boot(); });

  // ---------- preload ----------
  function preload(){
    LOG('Preload: queue assets...');
    this.load.image('bg',      BG_PATH + '?v=' + Date.now());
    this.load.image('usagi_i', USAGI_IMG + '?v=' + Date.now());   // load as plain image
    this.load.spritesheet('enemies', ENEMY_SHEET + '?v=' + Date.now(), { frameWidth:64, frameHeight:64 });

    this.load.on('filecomplete', function(key){ LOG('Loaded: ' + key); });
    this.load.on('loaderror',   function(file){
      var src = (file && file.src) ? file.src : 'unknown';
      LOG('LOAD ERROR: ' + src);
    });
    this.load.on('complete',    function(){ LOG('All assets loaded'); });
  }

  // ---------- create ----------
  function create(){
    var w = this.scale.width, h = this.scale.height;

    // background
    if (this.textures.exists('bg')) {
      var bg = this.add.image(0,0,'bg').setOrigin(0);
      bg.setDisplaySize(w,h);
      this.scale.on('resize', function(sz){
        var width = sz.width, height = sz.height;
        try { this.cameras.resize(width, height); } catch(e){}
        bg.setDisplaySize(width, height);
      }, this);
    }

    // convert Usagi image -> frames
    var usagiReady = false;
    if (this.textures.exists('usagi_i')) {
      var srcImg = this.textures.get('usagi_i').getSourceImage();
      var TW = srcImg.width, TH = srcImg.height;
      LOG('Usagi: source size ' + TW + 'x' + TH);

      // Try common layouts (frameW, frameH, cols, rows)
      var candidates = [
        [64,96,5,1],[64,96,6,1],[64,96,8,1],[64,96,4,2],[64,96,5,2],
        [64,64,6,1],[64,64,8,1],[64,64,5,1],[64,64,4,2]
      ];
      var chosen = null, j;
      for (j=0; j<candidates.length; j++){
        var fw = candidates[j][0], fh = candidates[j][1], cols = candidates[j][2], rows = candidates[j][3];
        if (TW % fw === 0 && TH % fh === 0){
          var c = TW / fw, r = TH / fh;
          if (c === cols && r === rows){ chosen = {fw:fw, fh:fh, cols:cols, rows:rows}; break; }
        }
      }
      if (!chosen){
        // Fallback: assume single row, 5 columns
        var fw2 = Math.max(1, Math.floor(TW/5));
        chosen = { fw: fw2, fh: TH, cols: Math.max(1, Math.floor(TW/fw2)), rows: 1 };
        LOG('Usagi: fallback layout -> ' + chosen.fw + 'x' + chosen.fh + ', ' + chosen.cols + 'x' + chosen.rows);
      } else {
        LOG('Usagi: detected layout -> ' + chosen.fw + 'x' + chosen.fh + ', ' + chosen.cols + 'x' + chosen.rows);
      }

      // Create texture and register frames
      var texKey = 'usagi';
      var canvasTex = this.textures.createCanvas(texKey, TW, TH);
      var canvas = canvasTex.getSourceImage();
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,TW,TH);
      ctx.drawImage(srcImg, 0, 0);
      this.textures.get(texKey).refresh();

      var texObj = this.textures.get(texKey);
      var idx = 0, row, col, sx, sy;
      for (row=0; row<chosen.rows; row++){
        for (col=0; col<chosen.cols; col++){
          sx = col * chosen.fw;
          sy = row * chosen.fh;
          if (sx + chosen.fw <= TW && sy + chosen.fh <= TH){
            texObj.add(String(idx), 0, sx, sy, chosen.fw, chosen.fh);
            idx++;
          }
        }
      }
      LOG('Usagi: registered ' + idx + ' frames');
      this.textures.remove('usagi_i');
      usagiReady = idx > 0;
    } else {
      LOG('JS ERROR: usagi image failed to decode (no source)');
    }

    // player (fallback box if not ready)
    gameState.player = this.physics.add.sprite(100, h - 150, usagiReady ? 'usagi' : null)
                           .setCollideWorldBounds(true);
    if (!usagiReady){
      var g = this.add.graphics();
      g.lineStyle(2, 0x00ff00, 1).strokeRect(0,0,64,96);
      var fbKey = 'usagi_fallback';
      g.generateTexture(fbKey, 64,96);
      g.destroy();
      gameState.player.setTexture(fbKey);
    }

    // animations
    if (usagiReady){
      var names = this.textures.get('usagi').getFrameNames();
      names.sort(function(a,b){ return parseInt(a,10) - parseInt(b,10); });
      var total = names.length;

      var idleEnd   = Math.min(1, total-1);
      var walkStart = Math.min(2, total-1);
      var walkEnd   = Math.min(walkStart+3, total-1);
      var atkStart  = Math.min(walkEnd+1, total-1);
      var atkEnd    = Math.min(atkStart+3, total-1);

      function seq(s, e){
        var arr = [], k;
        for (k=s; k<=e; k++){ arr.push({ key:'usagi', frame:String(k) }); }
        return arr;
      }

      this.anims.create({ key:'idle',   frames: seq(0, idleEnd),         frameRate: 4,  repeat: -1 });
      this.anims.create({ key:'walk',   frames: seq(walkStart, walkEnd), frameRate: 10, repeat: -1 });
      this.anims.create({ key:'attack', frames: seq(atkStart, atkEnd),   frameRate: 14, repeat: 0 });

      gameState.player.play('idle');
    }

    // input
    gameState.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', function(){ tryAttack(); });

    // enemies
    gameState.enemies = this.physics.add.group({ allowGravity:false });
    spawnEnemy(this);
    this.time.addEvent({
      delay: 1800,
      loop: true,
      callback: function(){ spawnEnemy(this); },
      callbackScope: this
    });
  }

  // ---------- update ----------
  function update(){
    var p = gameState.player;
    if (!p || !p.body) return;

    var left   = (gameState.cursors && gameState.cursors.left.isDown)  || gameState.touch.left;
    var right  = (gameState.cursors && gameState.cursors.right.isDown) || gameState.touch.right;
    var jump   = (gameState.cursors && gameState.cursors.up.isDown)    || gameState.touch.jump;
    var attack = gameState.touch.attack;

    p.setVelocityX(0);
    if (left){  p.setVelocityX(-180); p.flipX = true;  if (p.anims) p.play('walk', true); }
    else if (right){ p.setVelocityX(180);  p.flipX = false; if (p.anims) p.play('walk', true); }
    else { if (p.anims) p.play('idle', true); }

    if (jump && p.body.touching.down) p.setVelocityY(-420);
    if (attack) tryAttack();
    gameState.enemies.children.iterate(function(e){ if (e && e.x < -e.width) e.destroy(); });
  }

  // ---------- attack ----------
  function tryAttack(){
    if (!gameState.canAttack || !gameState.player) return;
    gameState.canAttack = false;
    if (gameState.player.anims) gameState.player.play('attack', true);
    setTimeout(function(){ gameState.canAttack = true; }, 250);

    gameState.enemies.children.iterate(function(e){
      if (!e) return;
      var dx = Math.abs(e.x - gameState.player.x), dy = Math.abs(e.y - gameState.player.y);
      if (dx < 70 && dy < 40){ e.setVelocityX(-120); e.setTint(0xffaaaa); setTimeout(function(){ if(e && e.clearTint) e.clearTint(); }, 200); }
    });
  }

  // ---------- enemy spawn ----------
  function spawnEnemy(scene){
    var w = scene.scale.width, h = scene.scale.height;
    var e;
    if (scene.textures.exists('enemies')) {
      e = gameState.enemies.create(w + 32, h - 150, 'enemies');
    } else {
      // magenta fallback so you still see enemies
      var g = scene.add.graphics(); g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
      var key = 'enemy_fallback_' + Math.random().toString(36).slice(2,8);
      g.generateTexture(key,64,64); g.destroy();
      e = gameState.enemies.create(w + 32, h - 150, key);
    }
    e.setVelocityX(-50 - Math.random()*40);
    e.setCollideWorldBounds(false);
  }
})();
