// game.js — Use your SNES sheet, auto-remove purple bg, slice 3x3 frames (256x384)
(function () {
  'use strict';

  function LOG(m){ try{ if(window._status&&_status.show){ _status.show(m); } }catch(e){} try{ console.log(m); }catch(e){} }
  if(!window.Phaser){ LOG('Phaser not loaded — ensure CDN <script> is before game.js'); }

  // ==== CONFIG: make sure this filename matches your repo ====
  // Example: 'assets/snes_usagi_sprite_sheet.png'  (rename here if yours differs)
  var USAGI_SOURCE = 'assets/snes_usagi_sprite_sheet.png';

  // Your sheet layout (matches the SNES art you showed: 3 columns × 3 rows)
  var FRAME_W = 256, FRAME_H = 384;
  var COLUMNS = 3, ROWS = 3;

  // If your sheet has borders/gaps, set these (most don't)
  var SHEET_MARGIN = 0;
  var SHEET_SPACING = 0;

  // Chroma-key target (dark purple). We'll remove anything near this color.
  // You can tweak these values if needed.
  var KEY_R = 22, KEY_G = 18, KEY_B = 30, KEY_TOL = 34; // ± tolerance

  var BG_PATH    = 'assets/background1.png';
  var ENEMY_PATH = 'assets/enemy_sprites.png';

  var S = {
    game:null,cursors:null,player:null,enemies:null,canAttack:true,
    touch:{left:false,right:false,jump:false,attack:false},
    ground:null, groundY:0, attackHit:null
  };

  // ---------- mobile buttons ----------
  function wireTouchButtons(){
    var btns=document.querySelectorAll('#touchControls .ctl');
    for(var i=0;i<btns.length;i++){
      (function(btn){
        var key=btn.getAttribute('data-key');
        function down(){ if(key==='ArrowLeft')S.touch.left=true; if(key==='ArrowRight')S.touch.right=true; if(key==='Space')S.touch.jump=true; if(key==='KeyA')S.touch.attack=true; }
        function up(){   if(key==='ArrowLeft')S.touch.left=false; if(key==='ArrowRight')S.touch.right=false; if(key==='Space')S.touch.jump=false; if(key==='KeyA')S.touch.attack=false; }
        btn.addEventListener('pointerdown',down,false);
        btn.addEventListener('pointerup',up,false);
        btn.addEventListener('pointercancel',up,false);
        btn.addEventListener('pointerleave',up,false);
      })(btns[i]);
    }
  }

  // ---------- start overlay ----------
  function armStart(){
    var titleEl=document.getElementById('title');
    var startBtn=document.getElementById('startBtn');
    var booted=false;

    function boot(){
      if(booted) return; booted=true;
      if(titleEl) titleEl.style.display='none';
      S.game=new Phaser.Game({
        type:Phaser.AUTO,parent:'game',
        width:window.innerWidth,height:window.innerHeight,
        physics:{ default:'arcade', arcade:{ gravity:{y:800}, debug:false }},
        scene:{ preload:preload, create:create, update:update }
      });
      LOG('Boot: Phaser game created.');
    }
    function addOnce(el,type){
      try{ el && el.addEventListener(type, boot, { once:true }); }
      catch(e){ el && el.addEventListener(type, function h(){ el.removeEventListener(type,h); boot(); }); }
    }
    addOnce(startBtn,'click'); addOnce(startBtn,'touchend'); addOnce(startBtn,'pointerup');
    addOnce(titleEl,'click');  addOnce(titleEl,'touchend');  addOnce(titleEl,'pointerup');
    addOnce(document,'click'); addOnce(document,'touchend'); addOnce(document,'pointerup');
    document.addEventListener('keydown', function(e){ if(e&&e.key==='Enter') boot(); }, false);
    LOG('Start armed — tap anywhere or press Start.');
  }

  // ---------- Phaser: preload ----------
  function preload(){
    LOG('Preload: queue assets…');
    this.load.image('bg', BG_PATH+'?v='+Date.now());

    // Load Usagi sheet as a plain image first (with purple bg)
    this.load.image('usagi_raw', USAGI_SOURCE+'?v='+Date.now());

    // Enemies (simple 64×64 cells)
    this.load.spritesheet('enemies', ENEMY_PATH+'?v='+Date.now(), { frameWidth:64, frameHeight:64 });

    this.load.on('filecomplete', key => LOG('Loaded: '+key));
    this.load.on('loaderror', file => LOG('LOAD ERROR: '+(file && file.src ? file.src : 'unknown')));
    this.load.on('complete',   ()  => LOG('All assets loaded'));
  }

  // ---------- convert purple to transparent & register spritesheet ----------
  function createSpritesheetFromImage(scene, rawKey, outKey){
    var rawTex = scene.textures.get(rawKey);
    if(!rawTex){ LOG('ERROR: raw texture missing: '+rawKey); return false; }

    var src = rawTex.getSourceImage();
    var canvasTex = scene.textures.createCanvas(outKey+'_canvas', src.width, src.height);
    var ctx = canvasTex.getContext();
    ctx.drawImage(src, 0, 0);

    var imgData = ctx.getImageData(0, 0, src.width, src.height);
    var data = imgData.data;

    for (var i=0; i<data.length; i+=4){
      var r=data[i], g=data[i+1], b=data[i+2];
      if (Math.abs(r-KEY_R)<=KEY_TOL && Math.abs(g-KEY_G)<=KEY_TOL && Math.abs(b-KEY_B)<=KEY_TOL){
        data[i+3] = 0; // make transparent
      }
    }
    ctx.putImageData(imgData, 0, 0);
    canvasTex.refresh();

    // Register a proper spritesheet from the processed canvas
    // (Phaser accepts a canvas/image source here)
    scene.textures.addSpriteSheet(outKey, canvasTex.getSourceImage(), {
      frameWidth: FRAME_W, frameHeight: FRAME_H,
      margin: SHEET_MARGIN, spacing: SHEET_SPACING
    });

    // We no longer need the raw or canvas intermediates in the texture manager
    scene.textures.remove(rawKey);
    scene.textures.remove(outKey+'_canvas');

    LOG('Usagi: purple background removed; spritesheet registered.');
    return true;
  }

  // ---------- Phaser: create ----------
  function create(){
    var w=this.scale.width, h=this.scale.height;

    // Background
    if(this.textures.exists('bg')){
      var bg=this.add.image(0,0,'bg').setOrigin(0); bg.setDisplaySize(w,h);
      this.scale.on('resize',function(sz){ var W=sz.width,H=sz.height; try{this.cameras.resize(W,H);}catch(e){} bg.setDisplaySize(W,H); },this);
    }

    // Create processed spritesheet from raw image
    var ok = createSpritesheetFromImage(this, 'usagi_raw', 'usagi');
    if(!ok){ LOG('ERROR: could not build Usagi sheet — check file path and dimensions.'); }

    // Ground (invisible static)
    S.groundY = h - 110;
    var groundRect = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(groundRect, true);
    S.ground = groundRect;

    // Animations — 3×3 grid frames 0..8
    // Row 1: 0,1,2 (idle/walk), Row 2: 3,4,5 (attack), Row 3: 6,7,8 (heavy)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi', frame:1 }], frameRate:1,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0  });
    this.anims.create({ key:'heavy',  frames:this.anims.generateFrameNumbers('usagi',{start:6,end:8}), frameRate:12, repeat:0  });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi', 1).setCollideWorldBounds(true);
    var targetH=128, scale=targetH/FRAME_H; S.player.setScale(scale);

    // Tight body & offset so feet sit on baseline
    var bodyW=36, bodyH=68;
    S.player.body.setSize(bodyW, bodyH);
    var offX=((FRAME_W*scale)-bodyW)/2/scale;
    var offY=((FRAME_H*scale)-bodyH-4)/scale;
    S.player.body.setOffset(offX, offY);

    S.player.setOrigin(0.5,1);
    S.player.play('idle');
    S.player.isAttacking=false;

    this.physics.add.collider(S.player, S.ground);

    // Return to idle after attacks
    this.anims.on('complete', function(anim, spr){
      if(spr===S.player && (anim.key==='attack' || anim.key==='heavy')){
        S.player.isAttacking=false;
        S.player.play('idle');
      }
    }, this);

    // Input
    S.cursors=this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', function(){ tryAttack(); }, this);

    // Attack hitbox (sensor)
    S.attackHit = this.add.rectangle(0,0, 56, 44, 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies = this.physics.add.group();
    this.physics.add.collider(S.enemies, S.ground);

    // Overlap: attack sensor vs enemies
    this.physics.add.overlap(S.attackHit, function(){ return S.enemies; }, function(hit, enemy){
      enemy.setVelocityX(-220);
      enemy.setTint(0xffaaaa);
      setTimeout(function(){ if(enemy && enemy.clearTint) enemy.clearTint(); }, 220);
    }, null, this);

    spawnEnemy(this);
    this.time.addEvent({ delay:1700, loop:true, callback:function(){ spawnEnemy(this); }, callbackScope:this });
  }

  // ---------- Phaser: update ----------
  function update(){
    var p=S.player; if(!p||!p.body) return;

    var left =(S.cursors&&S.cursors.left.isDown)||S.touch.left;
    var right=(S.cursors&&S.cursors.right.isDown)||S.touch.right;
    var jump =(S.cursors&&S.cursors.up.isDown)||S.touch.jump;
    var atk  =S.touch.attack;

    if(!p.isAttacking){
      p.setVelocityX(0);
      if(left){  p.setVelocityX(-180); p.flipX=true;  p.play('walk',true); }
      else if(right){ p.setVelocityX(180); p.flipX=false; p.play('walk',true); }
      else { p.play('idle',true); }
    }

    if(jump && p.body.blocked.down){ p.setVelocityY(-420); }
    if(atk){ tryAttack(); }

    S.enemies.children.iterate(function(e){ if(e && e.x < -e.width) e.destroy(); });
  }

  // ---------- attack ----------
  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false;
    S.player.isAttacking=true;
    S.player.play('attack', true);
    setTimeout(function(){ S.canAttack=true; }, 250);

    var dir = S.player.flipX ? -1 : 1;
    var px  = S.player.x + (40 * dir);
    var py  = S.player.y - 30;
    S.attackHit.setPosition(px, py);
    if(S.attackHit.body){ S.attackHit.body.setEnable(true); }
    setTimeout(function(){ if(S.attackHit && S.attackHit.body) S.attackHit.body.setEnable(false); }, 200);
  }

  // ---------- enemy spawn ----------
  function spawnEnemy(scene){
    var w=scene.scale.width;
    var e=scene.textures.exists('enemies')
      ? S.enemies.create(w+40, S.groundY, 'enemies', 0)
      : (function(){
          var g=scene.add.graphics(); g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
          var key='enemy_fallback_'+Math.random().toString(36).slice(2,8);
          g.generateTexture(key,64,64); g.destroy();
          return S.enemies.create(w+40, S.groundY, key);
        })();

    e.setOrigin(0.5,1);
    e.setVelocityX(-60 - Math.random()*50);
    e.setCollideWorldBounds(false);
    e.body.setAllowGravity(true);
  }

  // ---------- boot ----------
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
