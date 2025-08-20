// game.js — flood-fill bg removal + auto-pack + responsive
(function () {
  'use strict';

  // ---- Paths (match your repo) --------------------------------------------
  const BG_PATH    = 'assets/background1.png';
  const USAGI_RAW  = 'assets/usagi_snes_sheet.png'; // 3×4 source image
  const ENEMY_PATH = 'assets/enemy_sprites.png';    // 64×64 placeholder

  // ---- Source logical grid -------------------------------------------------
  const RAW_COLS = 3;
  const RAW_ROWS = 4;

  // ---- Packing / render knobs ---------------------------------------------
  const PAD          = 6;     // inner padding
  const MARGIN       = 24;    // outer sheet margin
  const SPACING      = 24;    // spacing between packed frames
  const BG_TOL       = 28;    // flood-fill tolerance (tight; outlines are kept)
  const FOOT_MARGIN  = 10;    // extra room below feet inside each frame
  const TARGET_VH    = 0.22;  // player height ≈ 22% of viewport height
  const GROUND_RAISE = 160;   // push ground up (avoid UI overlap)
  const ATTACK_MS    = 420;

  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0,
    enemies:null, attackHit:null,
    touch:{left:false,right:false,jump:false,attack:false},
    canAttack:true,
    packed:null // {frameW, frameH, frames}
  };

  // Euclidean distance in RGB
  const dist = (r1,g1,b1,r2,g2,b2)=>Math.hypot(r1-r2,g1-g2,b1-b2);

  /**
   * Edge-connected flood fill: returns Boolean mask (true = background)
   * Only pixels connected to the edges within tolerance are treated as bg.
   */
  function floodBgMask(imgData, bgR,bgG,bgB, tol){
    const {width:w, height:h, data:d} = imgData;
    const N=w*h;
    const mask = new Uint8Array(N);   // 1 = bg, 0 = fg/unknown
    const seen = new Uint8Array(N);   // visited

    const pushIfBg = (stack, x,y) => {
      if(x<0||y<0||x>=w||y>=h) return;
      const idx = y*w + x;
      if(seen[idx]) return;
      const i4 = idx*4;
      const A = d[i4+3];
      const R = d[i4], G=d[i4+1], B=d[i4+2];
      // treat fully transparent as bg, too (safety)
      if(A===0 || dist(R,G,B,bgR,bgG,bgB) <= tol){
        seen[idx]=1; mask[idx]=1; stack.push(x,y);
      }
    };

    const stack = [];
    // seed with border pixels
    for(let x=0; x<w; x++){ pushIfBg(stack,x,0); pushIfBg(stack,x,h-1); }
    for(let y=0; y<h; y++){ pushIfBg(stack,0,y); pushIfBg(stack,w-1,y); }

    // 4-neighbour flood
    while(stack.length){
      const y = stack.pop(), x = stack.pop();
      pushIfBg(stack, x-1,y);
      pushIfBg(stack, x+1,y);
      pushIfBg(stack, x, y-1);
      pushIfBg(stack, x, y+1);
    }
    return mask; // true where background
  }

  /**
   * Auto-trim every cell using flood-bg mask, compute uniform frame size,
   * and pack into a bleed-proof sheet (bottom-aligned feet).
   */
  function autoPackSheet(scene, rawKey, outKey){
    const tex = scene.textures.get(rawKey);
    const srcImg = tex.getSourceImage();
    const rawW = srcImg.width, rawH = srcImg.height;

    const cellW = Math.floor(rawW / RAW_COLS);
    const cellH = Math.floor(rawH / RAW_ROWS);

    // Read source pixels
    const srcCvs = document.createElement('canvas');
    srcCvs.width=rawW; srcCvs.height=rawH;
    const sctx = srcCvs.getContext('2d', { willReadFrequently:true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(srcImg,0,0);

    // Sample true bg from corner
    const b = sctx.getImageData(0,0,1,1).data;
    const bgR=b[0], bgG=b[1], bgB=b[2];

    const cells = [];
    let maxW=1, maxH=1;

    const rowsToUse = 3; // pack 3 rows (9 frames)
    for(let r=0;r<rowsToUse;r++){
      for(let c=0;c<RAW_COLS;c++){
        const sx = c*cellW, sy=r*cellH;
        const cellData = sctx.getImageData(sx,sy,cellW,cellH);
        const mask = floodBgMask(cellData, bgR,bgG,bgB, BG_TOL);

        // find tight bbox on non-bg pixels
        let minX=cellW, minY=cellH, maxX=-1, maxY=-1;
        for(let y=0;y<cellH;y++){
          for(let x=0;x<cellW;x++){
            const idx = y*cellW + x;
            if(mask[idx]) continue; // background; skip
            const i4 = idx*4;
            if(cellData.data[i4+3]===0) continue;
            if(x<minX) minX=x;
            if(y<minY) minY=y;
            if(x>maxX) maxX=x;
            if(y>maxY) maxY=y;
          }
        }
        if(maxX<minX || maxY<minY){
          // fallback: treat whole cell foreground if mask failed
          minX=0; minY=0; maxX=cellW-1; maxY=cellH-1;
        }

        const cropW = maxX-minX+1;
        const cropH = maxY-minY+1;

        maxW = Math.max(maxW, cropW + 2*PAD);
        maxH = Math.max(maxH, cropH + 2*PAD + FOOT_MARGIN);

        cells.push({ sx,sy, minX,minY, cropW,cropH, mask });
      }
    }

    const frameW = maxW, frameH = maxH;
    const OUT_COLS = 3, OUT_ROWS = 3;
    const outW = OUT_COLS*frameW + (OUT_COLS-1)*SPACING + 2*MARGIN;
    const outH = OUT_ROWS*frameH + (OUT_ROWS-1)*SPACING + 2*MARGIN;

    const outCvs = document.createElement('canvas');
    outCvs.width=outW; outCvs.height=outH;
    const octx = outCvs.getContext('2d');
    octx.imageSmoothingEnabled=false;

    // draw each trimmed crop, bottom-aligned, while zeroing bg alpha
    for(let i=0;i<cells.length;i++){
      const {sx,sy,minX,minY,cropW,cropH,mask} = cells[i];

      // draw crop
      const tmp = document.createElement('canvas');
      tmp.width=cropW; tmp.height=cropH;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled=false;
      tctx.drawImage(srcImg, sx+minX, sy+minY, cropW,cropH, 0,0, cropW,cropH);

      // apply bg alpha using original mask indices
      const td = tctx.getImageData(0,0,cropW,cropH);
      const arr = td.data;
      for(let y=0;y<cropH;y++){
        for(let x=0;x<cropW;x++){
          const srcIdx = ( (minY+y)*cellW + (minX+x) );
          if(mask[srcIdx]) arr[(y*cropW + x)*4 + 3] = 0;
        }
      }
      tctx.putImageData(td,0,0);

      const r = Math.floor(i/RAW_COLS);
      const c = i % RAW_COLS;
      if(r>=OUT_ROWS) break;

      const baseX = MARGIN + c*(frameW+SPACING);
      const baseY = MARGIN + r*(frameH+SPACING);
      const dx = baseX + Math.floor((frameW - cropW)/2);
      const dy = baseY + (frameH - cropH - FOOT_MARGIN);
      octx.drawImage(tmp, dx, dy);
    }

    scene.textures.addSpriteSheet(outKey, outCvs, {
      frameWidth: frameW,
      frameHeight: frameH,
      margin: MARGIN,
      spacing: SPACING
    });

    const outTex = scene.textures.get(outKey);
    outTex && outTex.setFilter && outTex.setFilter(Phaser.Textures.FilterMode.NEAREST);

    return { frameW, frameH, frames: OUT_COLS*OUT_ROWS };
  }

  // ---- Touch controls ------------------------------------------------------
  function wireTouchButtons(){
    const btns=document.querySelectorAll('#touchControls .ctl');
    btns.forEach(btn=>{
      const key=btn.getAttribute('data-key');
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

    // BG
    const bg=this.add.image(0,0,'bg').setOrigin(0);
    bg.setDisplaySize(w,h);

    // Pack Usagi
    S.packed = autoPackSheet(this, 'usagi_raw', 'usagi');

    // Responsive scale
    const desiredH = Math.round(h * TARGET_VH);
    const scale = desiredH / S.packed.frameH;

    // Ground
    S.groundY = h - GROUND_RAISE;
    const ground=this.add.rectangle(0,S.groundY,w*2,24,0x000000,0);
    this.physics.add.existing(ground,true);
    S.ground=ground;

    // Animations (first 9 frames: 0..8)
    this.anims.create({ key:'idle',   frames:[{key:'usagi',frame:1}], frameRate:1,  repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player=this.physics.add.sprite(140,S.groundY,'usagi',1)
      .setOrigin(0.5,1)
      .setScale(scale)
      .setCollideWorldBounds(true);

    // Physics body relative to packed frame
    const bw=Math.round(S.packed.frameW*0.30);
    const bh=Math.round(S.packed.frameH*0.42);
    S.player.body.setSize(bw,bh);
    const offX=Math.round((S.packed.frameW-bw)/2);
    const offY=Math.round(S.packed.frameH-bh-FOOT_MARGIN);
    S.player.body.setOffset(offX,offY);

    this.physics.add.collider(S.player,S.ground);

    S.player.on('animationcomplete', (a)=>{
      if(a.key==='attack'){ S.player.isAttacking=false; }
    });

    // Input
    S.cursors=this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', ()=>tryAttack(), this);

    // Attack hitbox
    S.attackHit=this.add.rectangle(0,0, Math.round(S.packed.frameW*0.28), Math.round(S.packed.frameH*0.18), 0xff0000, 0);
    this.physics.add.existing(S.attackHit,false);
    S.attackHit.body.setAllowGravity(false);
    S.attackHit.body.setEnable(false);

    // Enemies
    S.enemies=this.physics.add.group({ collideWorldBounds:false });
    this.physics.add.collider(S.enemies,S.ground);
    this.physics.add.overlap(S.attackHit,S.enemies,(_h,e)=>{
      e.setVelocityX(-220); e.setTint(0xffaaaa); setTimeout(()=>e?.clearTint?.(),240);
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
      if(left){ p.setVelocityX(-180); p.flipX=true;  p.play('walk',true); }
      else if(right){ p.setVelocityX(180); p.flipX=false; p.play('walk',true); }
      else { p.play('idle',true); }
    }
    if(jump && p.body.blocked.down) p.setVelocityY(-420);
    if(atk) tryAttack();

    S.enemies.children.iterate(e=>{ if(e && e.x<-100) e.destroy(); });
  }

  function tryAttack(){
    if(!S.canAttack || !S.player) return;
    S.canAttack=false; S.player.isAttacking=true; S.player.play('attack',true);
    const dir = S.player.flipX ? -1 : 1;
    S.attackHit.setPosition(S.player.x + 46*dir, S.player.y - 28);
    S.attackHit.body.setEnable(true);
    setTimeout(()=>{ S.attackHit.body.setEnable(false); S.player.isAttacking=false; S.canAttack=true; }, ATTACK_MS);
  }

  function spawnEnemy(scene){
    const w=scene.scale.width;
    const e=S.enemies.create(w+40,S.groundY,'enemies',0);
    e.setOrigin(0.5,1); e.setVelocityX(-80 - Math.random()*40);
  }

  // ---- Boot ---------------------------------------------------------------
  function wireUI(){
    wireTouchButtons();
    armStart();
  }
  (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', wireUI)
    : wireUI();
})();
