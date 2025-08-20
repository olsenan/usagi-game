// game.js — Production-safe Phaser build (ES5-friendly)
// - Auto-slices Usagi image into frames (common layouts + fallback)
// - Mobile buttons wired
// - Visible logs to on-page banner (no modern syntax that breaks older Android)

(function(){
  'use strict';

  // ---------- lightweight logger ----------
  function LOG(m){
    try { if (window._status && _status.show) { _status.show(m); } } catch (e) {}
    try { console.log(m); } catch (e) {}
  }

  // ---------- environment checks ----------
  if (!window.Phaser) { LOG('Phaser not loaded — make sure the CDN <script> is before game.js'); return; }
  if (!document.getElementById('game')) { LOG('Missing <div id="game"></div> container'); }

  // ---------- touch controls wiring ----------
  var touch = { left:false, right:false, jump:false, attack:false };
  var btns = document.querySelectorAll('#touchControls .ctl');
  for (var i=0; i<btns.length; i++){
    (function(btn){
      var key = btn.getAttribute('data-key');
      function down(e){ if(e && e.preventDefault) e.preventDefault();
        if(key==='ArrowLeft')  touch.left  = true;
        if(key==='ArrowRight') touch.right = true;
        if(key==='Space')      touch.jump  = true;
        if(key==='KeyA')       touch.attack= true;
      }
      function up(e){ if(e && e.preventDefault) e.preventDefault();
        if(key==='ArrowLeft')  touch.left  = false;
        if(key==='ArrowRight') touch.right = false;
        if(key==='Space')      touch.jump  = false;
        if(key==='KeyA')       touch.attack= false;
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
  var game = null;

  function boot(){
    if (game) return;
    game = new Phaser.Game({
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

  // ---------- paths (case-sensitive!) ----------
  var BG_PATH     = 'assets/background1.png';
  var USAGI_IMG   = 'assets/snes_usagi_sprite_sheet.png'; // your uploaded PNG (any common layout)
  var ENEMY_SHEET = 'assets/enemy_sprites.png';

  // ---------- scene state ----------
  var player, cursors, enemies, canAttack = true;

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

    // ---- convert Usagi image -> spritesheet frames ----
    var usagiReady = false;
    if (this.textures.exists('usagi_i')) {
      var srcImg = this.textures.get('usagi_i').getSourceImage();
      var TW = srcImg.width, TH = srcImg.height;
      LOG('Usagi: source size ' + TW + 'x' + TH);

      // Try common SNES-like layouts (frameW, frameH, cols, rows)
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
        chosen = { fw: Math.floor(TW/5), fh: TH, cols: Math.max(1, Math.floor(TW/Math.max(1,Math.floor(TW/5)))), rows: 1 };
        LOG('Usagi: fallback layout -> ' + chosen.fw + 'x' + chosen.fh + ', ' + chosen.cols + 'x' + chosen.rows);
      } else {
        LOG('Usagi: detected layout -> ' + chosen.fw + 'x' + chosen.fh + ', ' + chosen.cols + 'x' + chosen.rows);
      }

      // Create canvas texture and register frames
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

    // player (fallback if sprite not ready)
    player = this.physics.add.sprite(100, h - 150, usagiReady ? 'usagi' : null).setCollideWorldBounds(true);
    if (!usagiReady){
      var g = this.add.graphics();
      g.lineStyle(2, 0x00ff00, 1).strokeRect(0,0,64,96);
      var fbKey = 'usagi_fallback';
      g.generateTexture(fbKey, 64,96);
      g.destroy();
      player.setTexture(fbKey);
    }

    // animations (built from however many frames we have)
    if (usagiReady){
      var names = this.textures.get('usagi').getFrameNames();
      // sort numerically
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

      this.anims.create({ key:'idle',   frames: seq(0, idleEnd),    frameRate: 4,  repeat: -1 });
      this.anims.create({ key:'walk',   frames: seq(walkStart, walkEnd), frameRate: 10, repeat: -1 });
      this.anims.create({ key:'attack', frames: seq(atkStart, atkEnd),   frameRate: 14, repeat: 0 });

      player.play('idle');
    }

    // input
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', function(){ tryAttack(); });

    // enemies
    enemies = this.physics.add.group({ allowGravity:false });
    spawnEnemy(this);
    this.time.addEvent({ delay: 1800, loop:true, callback: function(){ spawnEnemy(this); }, callbackScope: this });
  }

  // ---------- update ----------
  function update(){
    if (!player || !player.body) return;

    var left   = (cursors && cursors.left.isDown)  || touch.left;
    var right  = (cursors && cursors.right.isDown) || touch.right;
    var jump   = (cursors && cursors.up.isDown)    || touch.jump;
    var attack = touch.attack;

    player.setVelocityX(0);
    if (left)  { player.setVelocityX(-180); player.flipX = true;  if (player.anims) player.play('walk', true); }
    else if (right){ player.setVelocityX(180); player.flipX = false; if (player.anims) player.play('walk', true); }
    else { if (player.anims) player.play('idle', true); }

    if (jump && player.body.touching.down) player.setVelocityY(-420);
    if (attack) tryAttack();

    enemies.children.iterate(function(e){ if (e && e.x < -e.width) e.destroy(); });
  }

  // ---------- attack ----------
  function tryAttack(){
    if (!canAttack || !player) return;
    canAttack = false;
    if (player.anims) player.play('attack', true);
    setTimeout(function(){ canAttack = true; }, 250);

    enemies.children.iterate(function(e){
      if (!e) return;
      var dx = Math.abs(e.x - player.x), dy = Math.abs(e.y - player.y);
      if (dx < 70 && dy < 40){ e.setVelocityX(-120); e.setTint(0xffaaaa); setTimeout(function(){ if(e && e.clearTint) e.clearTint(); }, 200); }
    });
  }

  // ---------- enemy spawn ----------
  function spawnEnemy(scene){
    var w = scene.scale.width, h = scene.scale.height;
    var e;
    if (scene.textures.exists('enemies')) {
      e = enemies.create(w + 32, h - 150, 'enemies');
    } else {
      // visible fallback
      var g = scene.add.graphics(); g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
      var key = 'enemy_fallback_' + Math.random().toString(36).slice(2,8);
      g.generateTexture(key, 64,64); g.destroy();
      e = enemies.create(w + 32, h - 150, key);
    }
    e.setVelocityX(-50 - Math.random()*40);
    e.setCollideWorldBounds(false);
  }
})();
