// game.js — bleed-proof, responsive, fixed-grid repack with bg-color keying
(function () {
  'use strict';

  // ---- Paths --------------------------------------------------------------
  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png';   // your 3×4 sheet
  const ENEMY_PATH = 'assets/enemy_sprites.png';

  // ---- Raw grid of the provided sheet ------------------------------------
  const RAW_COLS = 3;
  const RAW_ROWS = 4;

  // Padding to prevent neighbor sampling (big on purpose)
  const MARGIN  = 24;
  const SPACING = 24;

  // Raise ground so sprite never sits on bottom bezel
  const GROUND_RAISE = 160;

  // Keep some empty space below feet inside each frame
  const FOOT_MARGIN = 12;

  // Responsive character height target (portion of viewport height)
  const TARGET_CHAR_HEIGHT_VH = 0.22; // ≈22% of viewport height

  // Attack cooldown
  const ATTACK_MS = 420;

  // State
  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0, enemies:null, attackHit:null,
    touch:{ left:false, right:false, jump:false, attack:false },
    canAttack:true
  };

  // Utility: compute color distance
  function colorDist(r1,g1,b1,r2,g2,b2){
    // perceptual-ish, cheap
    const dr = r1-r2, dg = g1-g2, db = b1-b2;
    return Math.sqrt(dr*dr + dg*dg + db*db);
  }

  /**
   * Build a spritesheet using a FIXED grid (no cropping/trim),
   * but key out the background color → transparent.
   * - Samples background from (0,0) of the raw sheet
   * - Keys out anything within tolerance of that bg color
   * - Writes frames into padded slots to avoid bleeding
   * - Returns {frameW, frameH, frames:count}
   */
  function buildFixedGridSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage();
    const rawW = srcImg.width, rawH = srcImg.height;

    const cellW = Math.floor(rawW / RAW_COLS);
    const cellH = Math.floor(rawH / RAW_ROWS);

    // Load to canvas to read pixels
    const srcCvs = document.createElement('canvas');
    srcCvs.width = rawW; srcCvs.height = rawH;
    const sctx = srcCvs.getContext('2d', { willReadFrequently:true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(srcImg, 0, 0);

    // Sample background color at (0,0)
    const bg = sctx.getImageData(0, 0, 1, 1).data;
    const bgR = bg[0], bgG = bg[1], bgB = bg[2];

    // Tolerance tuned for your sheet (dark bluish background)
    const TOL = 85; // raise/lower if needed

    // We’ll export top 3 rows × 3 cols (9 frames) for now
    const OUT_COLS = 3, OUT_ROWS = 3, OUT_FRAMES = OUT_COLS*OUT_ROWS;
    const FRAME_W = cellW;
    const FRAME_H = cellH;

    const outW = OUT_COLS*FRAME_W + (OUT_COLS-1)*SPACING + 2*MARGIN;
    const outH = OUT_ROWS*FRAME_H + (OUT_ROWS-1)*SPACING + 2*MARGIN;

    const outCvs = document.createElement('canvas');
    outCvs.width = outW; outCvs.height = outH;
    const octx = outCvs.getContext('2d');
    octx.imageSmoothingEnabled = false;

    let outIndex = 0;
    outer:
    for(let r=0; r<OUT_ROWS; r++){
      for(let c=0; c<OUT_COLS; c++){
        const sx = c*cellW, sy = r*cellH;
        const img = sctx.getImageData(sx, sy, cellW, cellH);
        const d = img.data;

        // Alpha-key background-like pixels to transparent
        for(let i=0; i<d.length; i+=4){
          const R=d[i], G=d[i+1], B=d[i+2];
          if( colorDist(R,G,B, bgR,bgG,bgB) < TOL ){
            d[i+3] = 0;
          }
        }

        const tmp = document.createElement('canvas');
        tmp.width = cellW; tmp.height = cellH;
        const tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.putImageData(img, 0, 0);

        const dx0 = MARGIN + c*(FRAME_W + SPACING);
        const dy0 = MARGIN + r*(FRAME_H + SPACING);

        // bottom-center each frame; keep extra foot space
        const dx = dx0;
        const dy = dy0 + FOOT_MARGIN; // keep feet a bit higher inside frame

        octx.drawImage(tmp, dx, dy);

        outIndex++;
        if(outIndex >= OUT_FRAMES) break outer;
      }
    }

    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      margin: MARGIN,
      spacing: SPACING
    });

    const outTex = scene.textures.get(outKey);
    if(outTex && outTex.setFilter){
      outTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    return { frameW: FRAME_W, frameH: FRAME_H, frames: OUT_FRAMES };
  }

  // Touch controls wiring
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
        type:Phaser.AUTO,
        parent:'game',
        width:window.innerWidth,
        height:window.innerHeight,
        pixelArt:true,
        render:{ pixelArt:true, antialias:false, roundPixels:true },
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

  // -------------------------------------------------------------------------
  function preload(){
    this.load.image('bg', BG_PATH);
    this.load.image('usagi_raw', USAGI_RAW);
    this.load.spritesheet('enemies', ENEMY_PATH, { frameWidth:64, frameHeight:64 });
  }

  function create(){
    const w=this.scale.width, h=this.scale.height;

    this.cameras.main.setRoundPixels(true);

    const bg = this.add.image(0,0,'bg').setOrigin(0);
    bg.setDisplaySize(w,h);

    // Build bleed-proof, fixed-grid sheet
    const pack = buildFixedGridSheet(this, 'usagi_raw', 'usagi_pad');

    // Responsive scale: make character ~22% of viewport height
    const targetH = Math.round(h * TARGET_CHAR_HEIGHT_VH);
    const SCALE = targetH / pack.frameH;

    // Ground
    S.groundY = h - GROUND_RAISE;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Anims (use first 3×3 frames)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi_pad', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi_pad',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi_pad',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player = this.physics.add.sprite(140, S.groundY, 'usagi_pad', 1)
      .setOrigin(0.5,1)
      .setCollideWorldBounds(true)
      .setScale(SCALE);

    // Physics body (centered on torso)
    const bodyW_src = Math.floor(pack.frameW*0.22);
    const bodyH_src = Math.floor(pack.frameH*0.32);
    const bodyW = Math.round(bodyW_src);
    const bodyH = Math.round(bodyH_src);
    S.player.body.setSize(bodyW, bodyH);

    // Offset to sit near the lower center
    const offX = Math.round((pack.frameW - bodyW)/2);
    const offY = Math.round(pack.frameH - bodyH - FOOT_MARGIN);
    S.player.body.setOffset(offX, offY);

    this.physics.add.collider(S.player, S.ground);

    S.player.on('animationcomplete', (anim)=>{
      if(anim.key==='attack'){ S.player.isAttacking=false; }
    });

    // Input
    S.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack sensor
    S.attackHit = this.add.rectangle(0,0, Math.round(pack.frameW*0.22), Math.round(pack.frameH*0.16), 0xff0000, 0);
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
    e.body.setAllowGravity(true);
  }

  // Boot
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ wireTouchButtons(); armStart(); });
  } else { wireTouchButtons(); armStart(); }
})();
