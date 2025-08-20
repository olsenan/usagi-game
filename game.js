// game.js — auto-trim/pack, bleed-proof, responsive
(function () {
  'use strict';

  // ---- Asset paths --------------------------------------------------------
  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png'; // your 3×4 image
  const ENEMY_PATH = 'assets/enemy_sprites.png';    // 64×64 placeholder

  // ---- Source sheet logical grid (as drawn by artist) ---------------------
  const RAW_COLS = 3;
  const RAW_ROWS = 4;

  // ---- Packing & render knobs ---------------------------------------------
  const PAD          = 6;    // padding inside each output frame
  const MARGIN       = 24;   // outer margin around the sheet
  const SPACING      = 24;   // space between frames
  const BG_TOL       = 100;  // bg similarity tolerance (0–441), 100 works well for near-black
  const FOOT_MARGIN  = 10;   // extra empty pixels below feet inside each frame
  const TARGET_VH    = 0.22; // sprite height ≈ 22% of the viewport height
  const GROUND_RAISE = 160;  // lift ground so UI bezels don’t cover feet
  const ATTACK_MS    = 420;

  // ---- Runtime state -------------------------------------------------------
  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0,
    enemies:null, attackHit:null,
    touch:{left:false,right:false,jump:false,attack:false},
    canAttack:true,
    packed:null // {frameW, frameH, frames}
  };

  // Euclidean distance in RGB space
  const dist = (r1,g1,b1,r2,g2,b2)=>Math.hypot(r1-r2, g1-g2, b1-b2);

  /**
   * Auto-trim each source cell, compute max frame size, then pack into a
   * uniform-frame spritesheet with bottom alignment (feet matched).
   * Returns {frameW, frameH, frames}.
   */
  function autoPackSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage();
    const rawW = srcImg.width, rawH = srcImg.height;

    const cellW = Math.floor(rawW / RAW_COLS);
    const cellH = Math.floor(rawH / RAW_ROWS);

    // 1) Read pixels from source
    const srcCvs = document.createElement('canvas');
    srcCvs.width = rawW; srcCvs.height = rawH;
    const sctx = srcCvs.getContext('2d', { willReadFrequently:true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(srcImg, 0, 0);

    // Sample the *actual* background color
    const b = sctx.getImageData(0,0,1,1).data;
    const bgR=b[0], bgG=b[1], bgB=b[2];

    // 2) First pass — find tight bbox per cell (ignore bg within tolerance)
    const cells = []; // {sx,sy,w,h, minX,minY,maxX,maxY}
    let maxW = 1, maxH = 1;

    const rowsToUse = 3; // use top 3 rows (9 frames total)
    for(let r=0; r<rowsToUse; r++){
      for(let c=0; c<RAW_COLS; c++){
        const sx = c*cellW, sy = r*cellH;
        const img = sctx.getImageData(sx, sy, cellW, cellH);
        const d = img.data;

        let minX=cellW, minY=cellH, maxX=-1, maxY=-1;

        for(let y=0; y<cellH; y++){
          for(let x=0; x<cellW; x++){
            const i = (y*cellW + x) * 4;
            const R=d[i], G=d[i+1], B=d[i+2], A=d[i+3];
            if(A===0) continue;
            if(dist(R,G,B, bgR,bgG,bgB) < BG_TOL) continue; // treat as bg
            if(x<minX) minX=x;
            if(y<minY) minY=y;
            if(x>maxX) maxX=x;
            if(y>maxY) maxY=y;
          }
        }

        // Guard for completely empty cell (shouldn’t happen, but be safe)
        if(maxX<minX || maxY<minY){
          minX=0; minY=0; maxX=cellW-1; maxY=cellH-1;
        }

        const cropW = (maxX-minX+1);
        const cropH = (maxY-minY+1);

        maxW = Math.max(maxW, cropW + 2*PAD);
        maxH = Math.max(maxH, cropH + 2*PAD + FOOT_MARGIN);

        cells.push({ sx,sy, minX,minY,maxX,maxY, cropW, cropH });
      }
    }

    const frameW = maxW;
    const frameH = maxH;

    // 3) Build output canvas: 3×3 grid (9 frames)
    const OUT_COLS = 3, OUT_ROWS = 3;
    const outW = OUT_COLS*frameW + (OUT_COLS-1)*SPACING + 2*MARGIN;
    const outH = OUT_ROWS*frameH + (OUT_ROWS-1)*SPACING + 2*MARGIN;

    const outCvs = document.createElement('canvas');
    outCvs.width = outW; outCvs.height = outH;
    const octx = outCvs.getContext('2d');
    octx.imageSmoothingEnabled = false;

    // 4) Second pass — copy trimmed crops into uniform frames (bottom aligned)
    for(let i=0; i<cells.length; i++){
      const cell = cells[i];
      const {sx,sy,minX,minY,maxX,maxY,cropW,cropH} = cell;
      const crop = sctx.getImageData(sx+minX, sy+minY, cropW, cropH);

      // Alpha-key bg within tolerance
      const cd = crop.data;
      for(let k=0; k<cd.length; k+=4){
        const R=cd[k], G=cd[k+1], B=cd[k+2];
        if(dist(R,G,B, bgR,bgG,bgB) < BG_TOL) cd[k+3]=0;
      }

      const tmp = document.createElement('canvas');
      tmp.width=cropW; tmp.height=cropH;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.putImageData(crop, 0, 0);

      const r = Math.floor(i/RAW_COLS);
      const c = i % RAW_COLS;
      if(r>=OUT_ROWS) break; // only pack 3 rows (9 frames)

      const baseX = MARGIN + c*(frameW + SPACING);
      const baseY = MARGIN + r*(frameH + SPACING);

      // bottom-align inside the frame (+ FOOT_MARGIN)
      const dx = baseX + Math.floor((frameW - cropW)/2);
      const dy = baseY + (frameH - cropH - FOOT_MARGIN);

      octx.drawImage(tmp, dx, dy);
    }

    // 5) Register spritesheet
    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: frameW,
      frameHeight: frameH,
      margin: MARGIN,
      spacing: SPACING
    });

    const outTex = scene.textures.get(outKey);
    outTex && outTex.setFilter && outTex.setFilter(Phaser.Textures.FilterMode.NEAREST);

    return { frameW: frameW, frameH: frameH, frames: OUT_COLS*OUT_ROWS };
  }

  // ---- Touch controls ------------------------------------------------------
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
      title && (title.style.display='none');
      S.game=new Phaser.Game({
        type:Phaser.AUTO,
        parent:'game',
        width:window.innerWidth,
        height:window.innerHeight,
        pixelArt:true,
        render:{ pixelArt:true, antialias:false, roundPixels:true, clearBeforeRender:true },
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

  // ---- Phaser lifecycle ----------------------------------------------------
  function preload(){
    this.load.image('bg', BG_PATH);
    this.load.image('usagi_raw', USAGI_RAW);
    this.load.spritesheet('enemies', ENEMY_PATH, { frameWidth:64, frameHeight:64 });
  }

  function create(){
    const w=this.scale.width, h=this.scale.height;
    this.cameras.main.setRoundPixels(true);

    // Background
    const bg = this.add.image(0,0,'bg').setOrigin(0);
    bg.setDisplaySize(w,h);

    // Pack the Usagi sheet (auto-trim + bottom-align)
    S.packed = autoPackSheet(this, 'usagi_raw', 'usagi');

    // Responsive scaling
    const desiredH = Math.round(h * TARGET_VH);
    const scale = desiredH / S.packed.frameH;

    // Ground
    S.groundY = h - GROUND_RAISE;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Animations (first 9 frames packed in row-major order)
    // idle = frame 1; walk = 0..2; attack = 3..5
    this.anims.create({ key:'idle',   frames:[{key:'usagi',frame:1}], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player = this.physics.add.sprite(140, S.groundY, 'usagi', 1)
      .setOrigin(0.5,1)
      .setScale(scale)
      .setCollideWorldBounds(true);

    // Tight physics body relative to the *packed* frame
    const bw = Math.round(S.packed.frameW*0.30);
    const bh = Math.round(S.packed.frameH*0.42);
    S.player.body.setSize(bw, bh);
    const offX = Math.round((S.packed.frameW - bw)/2);
    const offY = Math.round(S.packed.frameH - bh - FOOT_MARGIN);
    S.player.body.setOffset(offX, offY);

    this.physics.add.collider(S.player, S.ground);

    S.player.on('animationcomplete', (a)=>{
      if(a.key==='attack'){ S.player.isAttacking=false; }
    });

    // Input
    S.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack hitbox
    S.attackHit = this.add.rectangle(0,0, Math.round(S.packed.frameW*0.28), Math.round(S.packed.frameH*0.18), 0xff0000, 0);
    this.physics.add.existing(S.attackHit, false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies = this.physics.add.group({ collideWorldBounds:false });
    this.physics.add.collider(S.enemies, S.ground);
    this.physics.add.overlap(S.attackHit, S.enemies, (_h, e)=>{
      e.setVelocityX(-220);
      e.setTint(0xffaaaa);
      setTimeout(()=>e?.clearTint?.(), 240);
    });

    spawnEnemy(this);
    this.time.addEvent({ delay:1700, loop:true, callback:()=>spawnEnemy(this) });
  }

  function update(){
    const p=S.player; if(!p?.body) return;

    const left  = (S.cursors.left?.isDown)  || S.touch.left;
    const right = (S.cursors.right?.isDown) || S.touch.right;
    const jump  = (S.cursors.up?.isDown)    || S.touch.jump;
    const atk   = S.touch.attack;

    if(!p.isAttacking){
      p.setVelocityX(0);
      if(left){  p.setVelocityX(-180); p.flipX=true;  p.play('walk',true); }
      else if(right){ p.setVelocityX(180); p.flipX=false; p.play('walk',true); }
      else { p.play('idle',true); }
    }

    if(jump && p.body.blocked.down) p.setVelocityY(-420);
    if(atk) tryAttack();

    // Cleanup off-screen enemies
    S.enemies.children.iterate(e=>{ if(e && e.x < -100) e.destroy(); });
  }

  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false;
    S.player.isAttacking=true;
    S.player.play('attack', true);

    const dir = S.player.flipX ? -1 : 1;
    S.attackHit.setPosition(S.player.x + 46*dir, S.player.y - 28);
    S.attackHit.body.setEnable(true);

    setTimeout(()=>{
      S.attackHit.body.setEnable(false);
      S.player.isAttacking=false;
      S.canAttack=true;
    }, ATTACK_MS);
  }

  function spawnEnemy(scene){
    const w = scene.scale.width;
    const e = S.enemies.create(w+40, S.groundY, 'enemies', 0);
    e.setOrigin(0.5,1);
    e.setVelocityX(-80 - Math.random()*40);
  }

  // ---- Boot ----------------------------------------------------------------
  function wireUI(){ wireTouchButtons(); armStart(); }
  (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', wireUI)
    : wireUI();
})();
