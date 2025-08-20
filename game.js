// game.js — fixed-grid repack (no cropping), alpha-key black -> transparent
(function () {
  'use strict';

  // --- Asset paths ----------------------------------------------------------
  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png'; // your 3×4 black-bg sheet
  const ENEMY_PATH = 'assets/enemy_sprites.png';

  // --- Raw sheet grid -------------------------------------------------------
  const RAW_COLS = 3;
  const RAW_ROWS = 4;

  // We’ll repack into uniform frames for Phaser:
  const FRAME_W = 256;
  const FRAME_H = 384;

  // Big safe padding to eliminate any sampling of neighbors:
  const MARGIN  = 16;
  const SPACING = 16;

  // Make the player stand higher up from bottom controls:
  const GROUND_RAISE = 160;

  // Keep a little empty space below the feet inside each frame:
  const FOOT_MARGIN = 10;

  // Alpha-keying threshold (how “close to black” becomes transparent)
  const BLACK_TOL = 40; // slightly generous so near-black goes transparent

  // Crisp pixel display scale (integer preferred)
  const SCALE = 0.25;

  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0, enemies:null, attackHit:null,
    touch:{ left:false, right:false, jump:false, attack:false },
    canAttack:true
  };

  /**
   * Build a bleed-proof sprite sheet:
   * - Slice the raw 3×4 grid with FIXED cell size (no cropping).
   * - Per-pixel: key out black to transparent.
   * - Draw each fixed cell into a padded slot, bottom-centered.
   */
  function buildFixedGridSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage();
    const rawW = srcImg.width, rawH = srcImg.height;

    // Raw cell size from the delivered sheet:
    const cellW = Math.floor(rawW / RAW_COLS);
    const cellH = Math.floor(rawH / RAW_ROWS);

    // Read whole sheet into a canvas
    const srcCvs = document.createElement('canvas');
    srcCvs.width = rawW; srcCvs.height = rawH;
    const sctx = srcCvs.getContext('2d', { willReadFrequently:true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(srcImg, 0, 0);

    // Output canvas for first 3×3 = 9 frames
    const OUT_COLS = 3, OUT_ROWS = 3, OUT_FRAMES = 9;
    const outW = OUT_COLS*FRAME_W + (OUT_COLS-1)*SPACING + 2*MARGIN;
    const outH = OUT_ROWS*FRAME_H + (OUT_ROWS-1)*SPACING + 2*MARGIN;
    const outCvs = document.createElement('canvas');
    outCvs.width = outW; outCvs.height = outH;
    const octx = outCvs.getContext('2d');
    octx.imageSmoothingEnabled = false;

    let outIndex = 0;
    outer:
    for(let r=0; r<RAW_ROWS; r++){
      for(let c=0; c<RAW_COLS; c++){
        // Stop after first 3 rows × 3 cols = 9 frames
        if(r>=OUT_ROWS || c>=OUT_COLS){ if(c>=OUT_COLS) break; }
        if(outIndex >= OUT_FRAMES) break outer;

        // Grab the raw cell as-is
        const sx = c*cellW, sy = r*cellH;
        const img = sctx.getImageData(sx, sy, cellW, cellH);
        const d = img.data;

        // Alpha-key: turn (near) black to transparent, but do NOT crop/trim
        for(let i=0; i<d.length; i+=4){
          const R=d[i], G=d[i+1], B=d[i+2];
          // Euclidean distance to black (0,0,0)
          const distBlack = Math.hypot(R, G, B);
          if(distBlack < BLACK_TOL){
            d[i+3] = 0; // transparent
          }
        }

        // Paint this fixed cell into a temporary canvas
        const tmp = document.createElement('canvas');
        tmp.width = cellW; tmp.height = cellH;
        const tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.putImageData(img, 0, 0);

        // Destination slot (bottom-centered)
        const dx0 = MARGIN + c*(FRAME_W + SPACING);
        const dy0 = MARGIN + r*(FRAME_H + SPACING);
        const dx = dx0 + Math.floor((FRAME_W - cellW)/2);
        const dy = dy0 + (FRAME_H - cellH) - FOOT_MARGIN;

        octx.drawImage(tmp, dx, dy);

        outIndex++;
        if(outIndex >= OUT_FRAMES) break outer;
      }
    }

    // Register as a Phaser spritesheet
    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      margin: MARGIN,
      spacing: SPACING
    });
    scene.textures.get(outKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // Mobile buttons
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

    // Build fixed-grid, alpha-keyed, padded sheet
    buildFixedGridSheet(this, 'usagi_raw', 'usagi_pad');

    // Ground higher (further from bottom bezel)
    S.groundY = h - GROUND_RAISE;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Animations: use the first row for idle/walk, second row for attack
    // Frames map (0..8):  [ (0,0) (1,0) (2,0),
    //                       (0,1) (1,1) (2,1),
    //                       (0,2) (1,2) (2,2) ]
    this.anims.create({ key:'idle',   frames:[{ key:'usagi_pad', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi_pad',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi_pad',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi_pad', 1)
      .setOrigin(0.5,1)
      .setCollideWorldBounds(true)
      .setScale(SCALE);

    // Physics body (tight around torso)
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
