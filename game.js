// game.js — ES5-safe; input-driven anims; ground/colliders; attack hitbox; mobile start
(function () {
  'use strict';

  function LOG(m){ try{ if(window._status&&_status.show){ _status.show(m); } }catch(e){} try{ console.log(m); }catch(e){} }
  if(!window.Phaser){ LOG('Phaser not loaded — ensure CDN <script> is before game.js'); }

  var S = {
    game:null,cursors:null,player:null,enemies:null,canAttack:true,
    touch:{left:false,right:false,jump:false,attack:false},
    ground:null, groundY:0, attackHit:null
  };

  var BG_PATH    = 'assets/background1.png';
  var USAGI_PATH = 'assets/snes_usagi_sprite_sheet.png'; // 3x3 grid; 256x384 per frame
  var ENEMY_PATH = 'assets/enemy_sprites.png';

  // ---- mobile buttons ----
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

  // ---- start screen (robust) ----
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

  // ---- Phaser scene ----
  function preload(){
    LOG('Preload: queue assets…');
    this.load.image('bg', BG_PATH+'?v='+Date.now());
    this.load.spritesheet('usagi', USAGI_PATH+'?v='+Date.now(), { frameWidth:256, frameHeight:384 });
    this.load.spritesheet('enemies', ENEMY_PATH+'?v='+Date.now(), { frameWidth:64, frameHeight:64 });
    this.load.on('filecomplete',function(key){ LOG('Loaded: '+key); });
    this.load.on('loaderror',function(file){ LOG('LOAD ERROR: '+(file&&file.src?file.src:'unknown')); });
    this.load.on('complete',function(){ LOG('All assets loaded'); });
  }

  function create(){
    var w=this.scale.width, h=this.scale.height;

    // Background
    if(this.textures.exists('bg')){
      var bg=this.add.image(0,0,'bg').setOrigin(0); bg.setDisplaySize(w,h);
      this.scale.on('resize',function(sz){ var W=sz.width,H=sz.height; try{this.cameras.resize(W,H);}catch(e){} bg.setDisplaySize(W,H); },this);
    }

    // Ground (invisible static)
    S.groundY = h - 110;
    var groundRect = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(groundRect, true);
    S.ground = groundRect;

    // Animations (3×3)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi', frame:1 }], frameRate:1,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0  });
    this.anims.create({ key:'heavy',  frames:this.anims.generateFrameNumbers('usagi',{start:6,end:8}), frameRate:12, repeat:0  });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi', 1).setCollideWorldBounds(true);
    var targetH=128, scale=targetH/384; S.player.setScale(scale);

    // Tight body & offset so feet sit on baseline
    var bodyW=32, bodyH=64;
    S.player.body.setSize(bodyW, bodyH);
    var offX=((256*scale)-bodyW)/2/scale;
    var offY=((384*scale)-bodyH-4)/scale;
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
    S.attackHit = this.add.rectangle(0,0, 50, 40, 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    this.physics.add.overlap(S.attackHit, function(){ return S.enemies; }, function(hit, enemy){
      enemy.setVelocityX(-200);
      enemy.setTint(0xffaaaa);
      setTimeout(function(){ if(enemy && enemy.clearTint) enemy.clearTint(); }, 200);
    }, null, this);

    // Enemies
    S.enemies = this.physics.add.group();
    this.physics.add.collider(S.enemies, S.ground);

    spawnEnemy(this);
    this.time.addEvent({ delay:1800, loop:true, callback:function(){ spawnEnemy(this); }, callbackScope:this });
  }

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

  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false;
    S.player.isAttacking=true;
    S.player.play('attack', true);
    setTimeout(function(){ S.canAttack=true; }, 250);

    var dir = S.player.flipX ? -1 : 1;
    var px  = S.player.x + (34 * dir);
    var py  = S.player.y - 28;
    S.attackHit.setPosition(px, py);
    if(S.attackHit.body){ S.attackHit.body.setEnable(true); }
    setTimeout(function(){ if(S.attackHit && S.attackHit.body) S.attackHit.body.setEnable(false); }, 200);
  }

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

  // Arm after DOM ready
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
