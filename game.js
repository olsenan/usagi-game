// game.js — ground raised, extra foot clearance, anti-bleed spritesheet build
(function () {
  'use strict';

  // --- Paths ---------------------------------------------------------------
  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png'; // your 3x4 black-bg sheet
  const ENEMY_PATH = 'assets/enemy_sprites.png';

  // --- Target uniform frame size for the rebuilt sheet ---------------------
  const FRAME_W = 256;
  const FRAME_H = 384;

  // Raw grid of the uploaded sheet (we use first 3x3 = 9 frames)
  const RAW_COLS = 3;
  const RAW_ROWS = 4;

  // Strong gutters (mobile GPU-safe)
  const SPACING = 12;       // transparent pixels between frames
  const MARGIN  = 12;       // transparent pixels around outside border
  const COLOR_TOL = 32;     // stricter fg detection (reduces edge specks)
  const BLEED_INSET = 2;    // draw each crop inset inside slot (top/btm)

  // Raise ground so the player stands higher on screen (was ~h-110)
  const GROUND_RAISE = 160; // bigger number = ground higher (further from bottom)

  // Extra foot space inside each frame so feet never clip
  const FOOT_MARGIN = 10;

  // Pixel scale (keep integer for crisp pixels)
  const SCALE = 0.25;

  // --- State ---------------------------------------------------------------
  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0, enemies:null, attackHit:null,
    touch:{ left:false, right:false, jump:false, attack:false },
    canAttack:true
  };

  // --- Build padded, bottom-centered sheet from the raw 3x4 grid ----------
  function buildPaddedSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage();
    const rawW = srcImg.width, rawH = srcImg.height;
    const cellW = Math.floor(rawW / RAW_COLS);
    const cellH = Math.floor(rawH / RAW_ROWS);

    const srcCvs = document.createElement('canvas');
    srcCvs.width = rawW; srcCvs.height = rawH;
    const sctx = srcCvs.getContext('2d', { willReadFrequently:true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(srcImg, 0, 0);

    // Estimate bg color from corners (works for black bg too)
    function avgBg(){
      const pts = [[2,2],[rawW-3,2],[2,rawH-3],[rawW-3,rawH-3]];
      let r=0,g=0,b=0,n=0;
      for(const [x,y] of pts){ const d=sctx.getImageData(x,y,1,1).data; r+=d[0]; g+=d[1]; b+=d[2]; n++; }
      return [r/n,g/n,b/n];
    }
    const [bgR,bgG,bgB] = avgBg();
    const dist = (r,g,b)=>Math.hypot(r-bgR,g-bgG,b-bgB);

    const OUT_COLS = 3, OUT_ROWS = 3, OUT_FRAMES = 9;
    const padW = OUT_COLS*FRAME_W + (OUT_COLS-1)*SPACING + 2*MARGIN;
    const padH = OUT_ROWS*FRAME_H + (OUT_ROWS-1)*SPACING + 2*MARGIN;
    const outCvs = document.createElement('canvas');
    outCvs.width = padW; outCvs.height = padH;
    const octx = outCvs.getContext('2d');
    octx.imageSmoothingEnabled = false;

    let outIndex = 0;
    for(let r=0; r<OUT_ROWS; r++){
      for(let c=0; c<OUT_COLS; c++){
        const sx0 = c*cellW, sy0 = r*cellH;
        const imgData = sctx.getImageData(sx0, sy0, cellW, cellH);
        const data = imgData.data;

        // Crop bounds (skip pixels near bg color)
        let minX=cellW, minY=cellH, maxX=-1, maxY=-1;
        for(let y=0; y<cellH; y++){
          for(let x=0; x<cellW; x++){
            const i=(y*cellW+x)*4, R=data[i],G=data[i+1],B=data[i+2],A=data[i+3];
            if (A>16 && dist(R,G,B)>COLOR_TOL){
              if(x<minX)minX=x; if(x>maxX)maxX=x;
              if(y<minY)minY=y; if(y>maxY)maxY=y;
            }
          }
        }
        if(maxX<minX || maxY<minY){ minX=0; minY=0; maxX=cellW-1; maxY=cellH-1; }

        const cropW=maxX-minX+1, cropH=maxY-minY+1;
        const srcX=sx0+minX, srcY=sy0+minY;

        // Slot origin for this frame
        const dx0 = MARGIN + c*(FRAME_W + SPACING);
        const dy0 = MARGIN + r*(FRAME_H + SPACING);

        // Bottom-center align; leave FOOT_MARGIN room under feet
        const dx = dx0 + Math.floor((FRAME_W - cropW)/2);
        const dy = dy0 + (FRAME_H - cropH) - FOOT_MARGIN;

        // Draw inset to avoid vertical neighbor sampling on some GPUs
        octx.drawImage(
          srcCvs, srcX, srcY, cropW, cropH,
          dx, dy + BLEED_INSET,
          cropW, Math.max(1, cropH - BLEED_INSET*2)
        );

        outIndex++; if(outIndex>=OUT_FRAMES) break;
      }
      if(outIndex>=OUT_FRAMES) break;
    }

    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      margin: MARGIN,
      spacing: SPACING
    });
    scene.textures.get(outKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // --- UI wiring ------------------------------------------------------------
  function wireTouchButtons(){
    const btns = document.querySelectorAll('#touchControls .ctl');
    btns.forEach(btn=>{
      const key = btn.getAttribute('data-key');
      const down=()=>{ if(key==='ArrowLeft')S.touch.left=true; if(key==='ArrowRight')S.touch.right=true; if(key==='Space')S.touch.jump=true; if(key==='KeyA')S.touch.attack=true; };
      const up  =()=>{ if(key==='ArrowLeft')S.touch.left=false; if(key==='ArrowRight')S.touch.right=false; if(key==='Space')S.touch.jump=false; if(key==='KeyA')S.touch.attack=false; };
      btn.addEventListener('pointerdown',down);
      btn.addEventListener('pointerup',up);
      btn.addEventListener('pointercancel',up);
      btn.addEventListener('pointerleave',up);
    });
  }

  function armStart(){
    const title=document.getElementById('title');
    const start=document.getElementById('startBtn');
    let booted=false;
    const boot=()=>{
      if(booted) return; booted=true;
      if(title) title.style.display='none';
      S.game=new Phaser.Game({
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

  // --- Phaser lifecycle ------------------------------------------------------
  function preload(){
    this.load.image('bg', BG_PATH);
    this.load.image('usagi_raw', USAGI_RAW);
    this.load.spritesheet('enemies', ENEMY_PATH, { frameWidth:64, frameHeight:64 });
  }

  function create(){
    const w=this.scale.width, h=this.scale.height;

    this.add.image(0,0,'bg').setOrigin(0).setDisplaySize(w,h);

    // Build anti-bleed padded sheet
    buildPaddedSheet(this, 'usagi_raw', 'usagi_pad');

    // Ground raised (further from bottom so feet are never on the bezel/controls)
    S.groundY = h - GROUND_RAISE;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Animations (first 9 frames)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi_pad', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi_pad',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi_pad',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi_pad', 1)
      .setOrigin(0.5,1)
      .setCollideWorldBounds(true)
      .setScale(SCALE);

    // Physics body (tight torso; feet safe above ground)
    const hitW_src = 56, hitH_src = 88;
    const bodyW = Math.round(hitW_src / SCALE);
    const bodyH = Math.round(hitH_src / SCALE);
    S.player.body.setSize(bodyW, bodyH);

    const displayW = FRAME_W * SCALE;
    const displayH = FRAME_H * SCALE;
    const offX = Math.round((displayW - bodyW * SCALE) / 2 / SCALE);
    const offY = Math.round((displayH - bodyH * SCALE - FOOT_MARGIN) / SCALE);
    S.player.body.setOffset(offX, offY);

    this.physics.add.collider(S.player, S.ground);

    S.player.on('animationcomplete', (anim)=>{
      if(anim.key==='attack'){ S.player.isAttacking=false; }
    });

    // Input
    S.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack sensor
    S.attackHit = this.add.rectangle(0,0, 56, 44, 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies = this.physics.add.group();
    this.physics.add.collider(S.enemies, S.ground);
    this.physics.add.overlap(S.attackHit, S.enemies, (_hit, enemy)=>{
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

    setTimeout(()=>{ S.attackHit.body.setEnable(false); S.player.isAttacking=false; S.canAttack=true; }, 420);
  }

  function spawnEnemy(scene){
    const w = scene.scale.width;
    const e = S.enemies.create(w+40, S.groundY, 'enemies', 0);
    e.setOrigin(0.5,1);
    e.setVelocityX(-80 - Math.random()*40);
    e.body.setAllowGravity(true);
  }

  // --- Boot -----------------------------------------------------------------
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ wireTouchButtons(); armStart(); });
  } else { wireTouchButtons(); armStart(); }
})();
