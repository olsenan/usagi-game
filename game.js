// game.js — Auto-crop + pad Usagi sprites (3x3), pixel-perfect render
(function () {
  'use strict';

  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png'; // your 3x3 SNES sheet
  const ENEMY_PATH = 'assets/enemy_sprites.png';

  // Logical frame size we want for gameplay (uniform, bottom-aligned)
  const FRAME_W = 256;
  const FRAME_H = 384;
  const COLS = 3, ROWS = 3;

  // Transparent gutters to eliminate bleeding
  const SPACING = 2;
  const MARGIN  = 2;

  // Display scale: integer factor keeps pixels crisp (256×384 -> 64×96)
  const SCALE = 0.25;

  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0, enemies:null, attackHit:null,
    touch:{ left:false, right:false, jump:false, attack:false },
    canAttack:true
  };

  // -------------------- UTIL: build padded sheet by auto-cropping --------------------
  function buildPaddedSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage(); // HTMLImageElement

    // Draw raw sheet onto a canvas so we can read pixels
    const srcCvs = document.createElement('canvas');
    srcCvs.width = srcImg.width; srcCvs.height = srcImg.height;
    const sctx = srcCvs.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(srcImg, 0, 0);

    const cellW = Math.floor(srcImg.width / COLS);
    const cellH = Math.floor(srcImg.height / ROWS);

    // Helper: average background color from the 4 corners of the whole sheet
    function avgBg(){
      const pts = [
        [2,2], [cellW-3,2], [srcImg.width-3,2], [2,cellH-3],
        [srcImg.width-3,cellH-3], [2,srcImg.height-3],
        [srcImg.width-3,srcImg.height-3], [cellW-3,srcImg.height-3]
      ];
      let r=0,g=0,b=0,n=0;
      pts.forEach(([x,y])=>{
        const d = sctx.getImageData(x,y,1,1).data; r+=d[0]; g+=d[1]; b+=d[2]; n++;
      });
      return [r/n, g/n, b/n];
    }
    const [bgR,bgG,bgB] = avgBg();
    const dist = (r,g,b)=>Math.hypot(r-bgR,g-bgG,b-bgB);

    // Destination padded canvas
    const padW = COLS*FRAME_W + (COLS-1)*SPACING + 2*MARGIN;
    const padH = ROWS*FRAME_H + (ROWS-1)*SPACING + 2*MARGIN;
    const outCvs = document.createElement('canvas');
    outCvs.width = padW; outCvs.height = padH;
    const octx = outCvs.getContext('2d');

    // Scan each cell, find non-bg bounding box, bottom-center it into FRAME_W×FRAME_H
    for(let r=0; r<ROWS; r++){
      for(let c=0; c<COLS; c++){
        const sx0 = c*cellW, sy0 = r*cellH;
        const imgData = sctx.getImageData(sx0, sy0, cellW, cellH);
        const data = imgData.data;

        // Find bounds of non-background pixels
        let minX=cellW, minY=cellH, maxX=-1, maxY=-1;
        for(let y=0; y<cellH; y++){
          for(let x=0; x<cellW; x++){
            const i = (y*cellW + x)*4;
            const R = data[i], G = data[i+1], B = data[i+2], A = data[i+3];
            // Consider a pixel foreground if it's opaque-ish and not "close" to bg color
            if (A>10 && dist(R,G,B) > 28){
              if(x<minX) minX=x; if(x>maxX) maxX=x;
              if(y<minY) minY=y; if(y>maxY) maxY=y;
            }
          }
        }
        // Fallback if we didn't find anything (shouldn't happen)
        if (maxX < minX || maxY < minY){ minX=0; minY=0; maxX=cellW-1; maxY=cellH-1; }

        const cropW = maxX-minX+1;
        const cropH = maxY-minY+1;

        // Source rect in the raw sheet
        const srcX = sx0 + minX;
        const srcY = sy0 + minY;

        // Dest slot origin
        const dx0 = MARGIN + c*(FRAME_W + SPACING);
        const dy0 = MARGIN + r*(FRAME_H + SPACING);

        // Bottom-center placement within the slot, with a tiny foot margin
        const foot = 4;
        const dx = dx0 + Math.floor((FRAME_W - cropW)/2);
        const dy = dy0 + (FRAME_H - cropH) - foot;

        octx.drawImage(srcCvs, srcX, srcY, cropW, cropH, dx, dy, cropW, cropH);
      }
    }

    // Register texture as a spritesheet with spacing/margin
    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      margin: MARGIN,
      spacing: SPACING
    });
    scene.textures.get(outKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // -------------------- UI / boot --------------------
  function wireTouchButtons(){
    const btns = document.querySelectorAll('#touchControls .ctl');
    btns.forEach(btn=>{
      const key = btn.getAttribute('data-key');
      const down = ()=>{ if(key==='ArrowLeft')S.touch.left=true; if(key==='ArrowRight')S.touch.right=true; if(key==='Space')S.touch.jump=true; if(key==='KeyA')S.touch.attack=true; };
      const up   = ()=>{ if(key==='ArrowLeft')S.touch.left=false; if(key==='ArrowRight')S.touch.right=false; if(key==='Space')S.touch.jump=false; if(key==='KeyA')S.touch.attack=false; };
      btn.addEventListener('pointerdown',down);  btn.addEventListener('pointerup',up);
      btn.addEventListener('pointercancel',up);  btn.addEventListener('pointerleave',up);
    });
  }

  function armStart(){
    const title = document.getElementById('title');
    const start = document.getElementById('startBtn');
    let booted = false;
    const boot = ()=>{
      if(booted) return; booted = true;
      if(title) title.style.display='none';
      S.game = new Phaser.Game({
        type:Phaser.AUTO, parent:'game',
        width:window.innerWidth, height:window.innerHeight,
        pixelArt:true, render:{ pixelArt:true, antialias:false, roundPixels:true },
        physics:{ default:'arcade', arcade:{ gravity:{y:800}, debug:false }},
        scene:{ preload, create, update }
      });
    };
    ['click','touchend','pointerup'].forEach(e=>{
      document.addEventListener(e,boot,{once:true});
      start && start.addEventListener(e,boot,{once:true});
      title && title.addEventListener(e,boot,{once:true});
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Enter') boot(); });
  }

  // -------------------- Phaser lifecycle --------------------
  function preload(){
    this.load.image('bg', BG_PATH);
    this.load.image('usagi_raw', USAGI_RAW); // load as image; we repack into a padded sheet
    this.load.spritesheet('enemies', ENEMY_PATH, { frameWidth: 64, frameHeight: 64 });
  }

  function create(){
    const w=this.scale.width, h=this.scale.height;

    this.add.image(0,0,'bg').setOrigin(0).setDisplaySize(w,h);

    // Build padded, uniform spritesheet → 'usagi_pad'
    buildPaddedSheet(this, 'usagi_raw', 'usagi_pad');

    // Ground
    S.groundY = h - 110;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Animations (frames 0..8)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi_pad', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi_pad',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi_pad',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi_pad', 1)
      .setOrigin(0.5,1)
      .setCollideWorldBounds(true)
      .setScale(SCALE);

    // Physics body (tight, feet on ground)
    const hitW_src = 56, hitH_src = 88;
    const bodyW = Math.round(hitW_src / SCALE);
    const bodyH = Math.round(hitH_src / SCALE);
    S.player.body.setSize(bodyW, bodyH);

    const displayW = FRAME_W * SCALE;
    const displayH = FRAME_H * SCALE;
    const footMargin = 4;
    const offX = Math.round((displayW - bodyW * SCALE) / 2 / SCALE);
    const offY = Math.round((displayH - bodyH * SCALE - footMargin) / SCALE);
    S.player.body.setOffset(offX, offY);

    this.physics.add.collider(S.player, S.ground);

    S.player.on('animationcomplete', (anim)=>{
      if(anim.key==='attack'){ S.player.isAttacking=false; }
    });

    // Input
    S.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack hitbox
    S.attackHit = this.add.rectangle(0,0, 56, 44, 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies = this.physics.add.group();
    this.physics.add.collider(S.enemies, S.ground);
    this.physics.add.overlap(S.attackHit, S.enemies, (hit, enemy)=>{
      enemy.setVelocityX(-220);
      enemy.setTint(0xffaaaa);
      setTimeout(()=>enemy && enemy.clearTint && enemy.clearTint(), 220);
    });

    spawnEnemy(this);
    this.time.addEvent({ delay:1700, loop:true, callback:()=>spawnEnemy(this) });
  }

  function update(){
    const p=S.player; if(!p||!p.body) return;

    const left  = (S.cursors && S.cursors.left.isDown)  || S.touch.left;
    const right = (S.cursors && S.cursors.right.isDown) || S.touch.right;
    const jump  = (S.cursors && S.cursors.up.isDown)    || S.touch.jump;
    const atk   = S.touch.attack;

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
    S.canAttack=false;
    S.player.isAttacking=true;
    S.player.play('attack', true);

    const dir = S.player.flipX ? -1 : 1;
    S.attackHit.setPosition(S.player.x + 40*dir, S.player.y - 30);
    S.attackHit.body.setEnable(true);

    setTimeout(()=>{ S.attackHit.body.setEnable(false); S.player.isAttacking=false; S.canAttack=true; }, 400);
  }

  function spawnEnemy(scene){
    const w = scene.scale.width;
    const e = S.enemies.create(w+40, S.groundY, 'enemies', 0);
    e.setOrigin(0.5,1);
    e.setVelocityX(-80 - Math.random()*40);
    e.body.setAllowGravity(true);
  }

  // Boot
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
