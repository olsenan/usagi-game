// game.js — Auto-crop 3x3 sheet with purple bg, repack into tight grid, slice correctly
(function () {
  'use strict';

  function LOG(m){ try{ if(window._status&&_status.show){ _status.show(m); } }catch(e){} try{ console.log(m); }catch(e){} }
  if(!window.Phaser){ LOG('Phaser not loaded — ensure CDN <script> is before game.js'); }

  // === CONFIG ===
  var USAGI_SOURCE = 'assets/snes_usagi_sprite_sheet.png'; // your SNES art (with purple bg)
  var COLS = 3, ROWS = 3;

  // Purple to key out (tweak if needed)
  var KEY_R=22, KEY_G=18, KEY_B=30, KEY_TOL=38;

  // Other assets
  var BG_PATH    = 'assets/background1.png';
  var ENEMY_PATH = 'assets/enemy_sprites.png';

  var S = {
    game:null,cursors:null,player:null,enemies:null,canAttack:true,
    touch:{left:false,right:false,jump:false,attack:false},
    ground:null, groundY:0, attackHit:null,
    frameW:128, frameH:128 // filled after repack
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
    this.load.image('usagi_raw', USAGI_SOURCE+'?v='+Date.now());
    this.load.spritesheet('enemies', ENEMY_PATH+'?v='+Date.now(), { frameWidth:64, frameHeight:64 });

    this.load.on('filecomplete', key => LOG('Loaded: '+key));
    this.load.on('loaderror', file => LOG('LOAD ERROR: '+(file && file.src ? file.src : 'unknown')));
    this.load.on('complete',   ()  => LOG('All assets loaded'));
  }

  // ---------- utility: chroma key test ----------
  function isKey(r,g,b){
    return (Math.abs(r-KEY_R)<=KEY_TOL &&
            Math.abs(g-KEY_G)<=KEY_TOL &&
            Math.abs(b-KEY_B)<=KEY_TOL);
  }

  // ---------- build tight spritesheet from raw image ----------
  function buildTightSheet(scene, rawKey, outKey){
    const rawTex = scene.textures.get(rawKey);
    if(!rawTex){ LOG('ERROR: raw texture missing: '+rawKey); return false; }
    const src = rawTex.getSourceImage();
    const SW = src.width, SH = src.height;

    // Draw raw -> canvas and remove purple
    const srcCanvas = scene.textures.createCanvas(outKey+'_src', SW, SH);
    const sctx = srcCanvas.getContext();
    sctx.drawImage(src, 0, 0);
    const img = sctx.getImageData(0,0,SW,SH);
    const d = img.data;
    for(let i=0;i<d.length;i+=4){
      if(isKey(d[i],d[i+1],d[i+2])) d[i+3]=0;
    }
    sctx.putImageData(img,0,0);
    srcCanvas.refresh();

    // Split into COLS×ROWS cells, find tight bbox per cell
    const cellW = Math.floor(SW / COLS);
    const cellH = Math.floor(SH / ROWS);
    const boxes = []; // {x,y,w,h}
    let maxW=0, maxH=0;

    function cellBBox(cx, cy){
      const x0 = cx*cellW, y0 = cy*cellH;
      const w = (cx===COLS-1) ? (SW - x0) : cellW;
      const h = (cy===ROWS-1) ? (SH - y0) : cellH;
      const data = sctx.getImageData(x0,y0,w,h);
      const dd = data.data;
      let minX=w, minY=h, maxX=-1, maxY=-1;

      for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
          const k = (y*w + x)*4;
          if(dd[k+3]>10){ // any visible pixel
            if(x<minX)minX=x; if(y<minY)minY=y;
            if(x>maxX)maxX=x; if(y>maxY)maxY=y;
          }
        }
      }
      if(maxX<0 || maxY<0){
        // empty cell (unlikely) — fallback to whole cell
        return {x:x0,y:y0,w:w,h:h};
      }
      const bx = x0+minX, by = y0+minY, bw = (maxX-minX+1), bh = (maxY-minY+1);
      return {x:bx,y:by,w:bw,h:bh};
    }

    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const b = cellBBox(c,r);
        boxes.push(b);
        if(b.w>maxW)maxW=b.w;
        if(b.h>maxH)maxH=b.h;
      }
    }

    // Create packed canvas with uniform frames (maxW×maxH), bottom-aligned, centered
    const packedW = maxW*COLS, packedH = maxH*ROWS;
    const packed = scene.textures.createCanvas(outKey+'_packed', packedW, packedH);
    const pctx = packed.getContext();
    pctx.clearRect(0,0,packedW,packedH);

    boxes.forEach((b, i)=>{
      const r = Math.floor(i/COLS), c = i%COLS;
      const dx = c*maxW + Math.floor((maxW - b.w)/2);       // center horizontally
      const dy = r*maxH + (maxH - b.h);                      // bottom align
      pctx.drawImage(srcCanvas.getSourceImage(), b.x, b.y, b.w, b.h, dx, dy, b.w, b.h);
    });
    packed.refresh();

    // Register spritesheet with tight frame size
    scene.textures.addSpriteSheet(outKey, packed.getSourceImage(), {
      frameWidth: maxW, frameHeight: maxH, margin: 0, spacing: 0
    });

    // Cleanup intermediates
    scene.textures.remove(rawKey);
    scene.textures.remove(outKey+'_src');
    scene.textures.remove(outKey+'_packed');

    S.frameW=maxW; S.frameH=maxH;
    LOG(`Usagi repacked: frames ${maxW}×${maxH} (sheet ${packedW}×${packedH})`);
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

    // Build tight spritesheet from the raw 3x3 image
    if(!buildTightSheet(this, 'usagi_raw', 'usagi')){
      LOG('ERROR: could not build Usagi sheet — check file path.'); return;
    }

    // Ground
    S.groundY = h - 110;
    var groundRect = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(groundRect, true);
    S.ground = groundRect;

    // Animations — still 0..8 in reading order
    this.anims.create({ key:'idle',   frames:[{ key:'usagi', frame:1 }], frameRate:1,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0  });
    this.anims.create({ key:'heavy',  frames:this.anims.generateFrameNumbers('usagi',{start:6,end:8}), frameRate:12, repeat:0  });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi', 1).setCollideWorldBounds(true);
    var targetH=128, scale=targetH/Math.max(1,S.frameH); S.player.setScale(scale);

    // Tight body & offset so feet sit on baseline
    var bodyW=36, bodyH=68;
    S.player.body.setSize(bodyW, bodyH);
    var offX=((S.frameW*scale)-bodyW)/2/scale;
    var offY=((S.frameH*scale)-bodyH-4)/scale;
    S.player.body.setOffset(offX, offY);

    S.player.setOrigin(0.5,1).play('idle');
    S.player.isAttacking=false;

    this.physics.add.collider(S.player, S.ground);

    // Return to idle after attacks
    this.anims.on('complete', (anim, spr)=>{
      if(spr===S.player && (anim.key==='attack' || anim.key==='heavy')){
        S.player.isAttacking=false; S.player.play('idle');
      }
    });

    // Input
    S.cursors=this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack hitbox (sensor)
    S.attackHit = this.add.rectangle(0,0, 56, 44, 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies = this.physics.add.group();
    this.physics.add.collider(S.enemies, S.ground);
    this.physics.add.overlap(S.attackHit, ()=>S.enemies, (hit, enemy)=>{
      enemy.setVelocityX(-220); enemy.setTint(0xffaaaa);
      setTimeout(()=>enemy && enemy.clearTint && enemy.clearTint(), 220);
    });

    spawnEnemy(this);
    this.time.addEvent({ delay:1700, loop:true, callback:()=>spawnEnemy(this) });
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

    S.enemies.children.iterate(e=>{ if(e && e.x < -e.width) e.destroy(); });
  }

  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false; S.player.isAttacking=true; S.player.play('attack', true);
    setTimeout(()=>{ S.canAttack=true; }, 250);

    var dir = S.player.flipX ? -1 : 1;
    var px  = S.player.x + (40 * dir);
    var py  = S.player.y - 30;
    S.attackHit.setPosition(px, py);
    if(S.attackHit.body){ S.attackHit.body.setEnable(true); }
    setTimeout(()=>{ if(S.attackHit && S.attackHit.body) S.attackHit.body.setEnable(false); }, 200);
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

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
