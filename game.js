// game.js — ES5-safe, DOM-ready start + whole-page tap failsafe
(function () {
  'use strict';

  function LOG(m){ try{ if(window._status&&_status.show){ _status.show(m); } }catch(e){} try{ console.log(m); }catch(e){} }
  if(!window.Phaser){ LOG('Phaser not loaded — ensure CDN <script> is before game.js'); }

  var S = { game:null,cursors:null,player:null,enemies:null,canAttack:true,
            touch:{left:false,right:false,jump:false,attack:false} };

  var BG_PATH='assets/background1.png';
  var USAGI_PATH='assets/snes_usagi_sprite_sheet.png'; // 3x3, frame 256x384
  var ENEMY_PATH='assets/enemy_sprites.png';

  // Wire controls (called after DOM ready)
  function wireTouchButtons(){
    var btns=document.querySelectorAll('#touchControls .ctl');
    for(var i=0;i<btns.length;i++){
      (function(btn){
        var key=btn.getAttribute('data-key');
        function down(e){ if(e&&e.preventDefault)e.preventDefault();
          if(key==='ArrowLeft')S.touch.left=true;
          if(key==='ArrowRight')S.touch.right=true;
          if(key==='Space')S.touch.jump=true;
          if(key==='KeyA')S.touch.attack=true;
        }
        function up(e){ if(e&&e.preventDefault)e.preventDefault();
          if(key==='ArrowLeft')S.touch.left=false;
          if(key==='ArrowRight')S.touch.right=false;
          if(key==='Space')S.touch.jump=false;
          if(key==='KeyA')S.touch.attack=false;
        }
        btn.addEventListener('pointerdown',down,{passive:false});
        btn.addEventListener('pointerup',up,{passive:false});
        btn.addEventListener('pointercancel',up,{passive:false});
        btn.addEventListener('pointerleave',up,{passive:false});
      })(btns[i]);
    }
  }

  // Start logic (arm on DOM ready)
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
      disarm();
    }
    function on(e){ if(e&&e.preventDefault)e.preventDefault(); boot(); }
    function disarm(){
      try{ startBtn&&startBtn.removeEventListener('click',on); }catch(e){}
      try{ startBtn&&startBtn.removeEventListener('touchstart',on); }catch(e){}
      try{ titleEl&&titleEl.removeEventListener('click',on); }catch(e){}
      try{ titleEl&&titleEl.removeEventListener('touchstart',on); }catch(e){}
      try{ document.removeEventListener('pointerdown',on); }catch(e){}
    }

    // Button + overlay + whole-page fallback
    if(startBtn){ startBtn.addEventListener('click',on,{passive:true});
                  startBtn.addEventListener('touchstart',on,{passive:false}); }
    if(titleEl){ titleEl.addEventListener('click',on,{passive:true});
                 titleEl.addEventListener('touchstart',on,{passive:false});
                 titleEl.style.pointerEvents='auto'; }
    document.addEventListener('pointerdown',on,{passive:false});
    document.addEventListener('keydown',function(e){ if(e&&e.key==='Enter') boot(); });

    LOG('Start armed — tap anywhere or press Start.');
  }

  // Phaser scene
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
    var w=this.scale.width,h=this.scale.height;

    if(this.textures.exists('bg')){
      var bg=this.add.image(0,0,'bg').setOrigin(0); bg.setDisplaySize(w,h);
      this.scale.on('resize',function(sz){ var W=sz.width,H=sz.height; try{this.cameras.resize(W,H);}catch(e){} bg.setDisplaySize(W,H); },this);
    }

    // 3x3 frames: 0..8
    this.anims.create({ key:'idle',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:1}), frameRate:4,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0  });
    this.anims.create({ key:'heavy',  frames:this.anims.generateFrameNumbers('usagi',{start:6,end:8}), frameRate:12, repeat:0  });

    S.player=this.physics.add.sprite(100,h-150,'usagi',0).setCollideWorldBounds(true);
    var targetH=128, scale=targetH/384; S.player.setScale(scale);
    S.player.play('idle');

    S.cursors=this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE',function(){ tryAttack(); });

    S.enemies=this.physics.add.group({ allowGravity:false });
    spawnEnemy(this);
    this.time.addEvent({ delay:1800, loop:true, callback:function(){ spawnEnemy(this); }, callbackScope:this });
  }

  function update(){
    var p=S.player; if(!p||!p.body) return;
    var left=(S.cursors&&S.cursors.left.isDown)||S.touch.left;
    var right=(S.cursors&&S.cursors.right.isDown)||S.touch.right;
    var jump=(S.cursors&&S.cursors.up.isDown)||S.touch.jump;
    var atk=S.touch.attack;

    p.setVelocityX(0);
    if(left){ p.setVelocityX(-180); p.flipX=true; p.play('walk',true); }
    else if(right){ p.setVelocityX(180); p.flipX=false; p.play('walk',true); }
    else { p.play('idle',true); }

    if(jump && p.body.touching.down) p.setVelocityY(-420);
    if(atk) tryAttack();

    S.enemies.children.iterate(function(e){ if(e && e.x < -e.width) e.destroy(); });
  }

  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false;
    S.player.play('attack',true);
    setTimeout(function(){ S.canAttack=true; },250);

    S.enemies.children.iterate(function(e){
      if(!e) return;
      var dx=Math.abs(e.x-S.player.x), dy=Math.abs(e.y-S.player.y);
      if(dx<70 && dy<40){ e.setVelocityX(-120); e.setTint(0xffaaaa); setTimeout(function(){ if(e&&e.clearTint)e.clearTint(); },200); }
    });
  }

  function spawnEnemy(scene){
    var w=scene.scale.width,h=scene.scale.height,e;
    if(scene.textures.exists('enemies')) e=S.enemies.create(w+32,h-150,'enemies');
    else{
      var g=scene.add.graphics(); g.fillStyle(0xff00ff,1).fillRect(0,0,64,64);
      var key='enemy_fallback_'+Math.random().toString(36).slice(2,8);
      g.generateTexture(key,64,64); g.destroy();
      e=S.enemies.create(w+32,h-150,key);
    }
    e.setVelocityX(-50 - Math.random()*40);
  }

  // Arm everything after DOM is ready
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
