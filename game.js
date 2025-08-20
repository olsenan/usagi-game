// game.js (TEMP EXPORTER) — loads SNES sheet, auto-crops + repacks 3x3, lets you download PNG
(function () {
  'use strict';

  const SRC = 'assets/snes_usagi_sprite_sheet.png'; // your existing SNES art (purple bg OK)
  const COLS = 3, ROWS = 3;
  const KEY = { r:22, g:18, b:30, tol:38 }; // purple chroma-key

  let S = { game:null, player:null, cursors:null, touch:{}, ground:null, groundY:0, enemies:null,
            frameW:128, frameH:128, packedCanvas:null };

  function addExportButton(scene) {
    const btn = document.createElement('button');
    btn.textContent = 'Export Usagi Sheet';
    Object.assign(btn.style, {
      position:'fixed', top:'6px', right:'8px', zIndex:9999,
      padding:'8px 12px', borderRadius:'8px', border:'0', background:'#10b981', color:'#fff',
      fontSize:'14px', boxShadow:'0 2px 6px rgba(0,0,0,.2)'
    });
    btn.onclick = () => {
      if (!S.packedCanvas) return;
      const a = document.createElement('a');
      a.download = 'usagi_trimmed_3x3.png';
      a.href = S.packedCanvas.toDataURL('image/png');
      a.click();
    };
    document.body.appendChild(btn);
  }

  function chromaToTransparent(data) {
    for (let i=0; i<data.length; i+=4) {
      const r=data[i], g=data[i+1], b=data[i+2];
      if (Math.abs(r-KEY.r)<=KEY.tol && Math.abs(g-KEY.g)<=KEY.tol && Math.abs(b-KEY.b)<=KEY.tol) data[i+3]=0;
    }
  }

  function buildPackedSheet(scene, rawKey, outKey) {
    const raw = scene.textures.get(rawKey); if(!raw) return false;
    const src = raw.getSourceImage(), SW=src.width, SH=src.height;

    // Draw to a canvas and remove purple
    const srcTex = scene.textures.createCanvas(outKey+'_src', SW, SH);
    const sctx = srcTex.getContext();
    sctx.drawImage(src,0,0);
    const img = sctx.getImageData(0,0,SW,SH);
    chromaToTransparent(img.data);
    sctx.putImageData(img,0,0); srcTex.refresh();

    // Split into grid cells and calc tight bbox per cell
    const cW = Math.floor(SW/COLS), cH = Math.floor(SH/ROWS);
    const boxes = []; let maxW=0, maxH=0;

    function bbox(cx,cy){
      const x0=cx*cW, y0=cy*cH;
      const w = (cx===COLS-1) ? (SW - x0) : cW;
      const h = (cy===ROWS-1) ? (SH - y0) : cH;
      const id = sctx.getImageData(x0,y0,w,h), d=id.data;
      let minX=w, minY=h, maxX=-1, maxY=-1;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const k=(y*w+x)*4; if(d[k+3]>10){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
      }
      if(maxX<0) return {x:x0,y:y0,w:1,h:1};
      return {x:x0+minX, y:y0+minY, w:maxX-minX+1, h:maxY-minY+1};
    }

    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const b=bbox(c,r); boxes.push(b);
        if(b.w>maxW)maxW=b.w; if(b.h>maxH)maxH=b.h;
      }
    }

    // Pack into tight 3x3 sheet (bottom-aligned, centered)
    const PW = maxW*COLS, PH = maxH*ROWS;
    const packed = document.createElement('canvas'); packed.width=PW; packed.height=PH;
    const pctx = packed.getContext('2d');
    boxes.forEach((b,i)=>{
      const r=Math.floor(i/COLS), c=i%COLS;
      const dx=c*maxW + Math.floor((maxW-b.w)/2);
      const dy=r*maxH + (maxH-b.h);
      pctx.drawImage(srcTex.getSourceImage(), b.x,b.y,b.w,b.h, dx,dy,b.w,b.h);
    });

    // Register as spritesheet with Phaser
    scene.textures.addSpriteSheet(outKey, packed, { frameWidth:maxW, frameHeight:maxH, margin:0, spacing:0 });

    // Expose for download + sizes for player scale
    S.packedCanvas = packed;
    S.frameW = maxW; S.frameH = maxH;

    // Cleanup temp textures
    scene.textures.remove(rawKey);
    scene.textures.remove(outKey+'_src');
    return true;
  }

  // Phaser lifecycle
  function preload(){
    this.load.image('bg','assets/background1.png');
    this.load.image('usagi_raw', SRC);
    this.load.spritesheet('enemies','assets/enemy_sprites.png',{ frameWidth:64, frameHeight:64 });
  }

  function create(){
    addExportButton(this);

    const w=this.scale.width, h=this.scale.height;
    this.add.image(0,0,'bg').setOrigin(0).setDisplaySize(w,h);

    if(!buildPackedSheet(this,'usagi_raw','usagi')) { console.log('Pack failed'); return; }

    // Ground
    S.groundY=h-110;
    const ground=this.add.rectangle(0,S.groundY,w*2,24,0x000000,0);
    this.physics.add.existing(ground,true); S.ground=ground;

    // Anims (0..8)
    this.anims.create({ key:'idle',   frames:[{ key:'usagi', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player
    S.player=this.physics.add.sprite(120,S.groundY,'usagi',1).setCollideWorldBounds(true).setOrigin(0.5,1);
    const targetH=128, scale=targetH/Math.max(1,S.frameH); S.player.setScale(scale);
    this.physics.add.collider(S.player,S.ground);

    // Movement/attack
    S.cursors=this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE',()=>tryAttack(),this);
    S.attackHit=this.add.rectangle(0,0,56,44,0xff0000,0);
    this.physics.add.existing(S.attackHit,false); S.attackHit.body.setAllowGravity(false); S.attackHit.body.setEnable(false);

    S.enemies=this.physics.add.group();
    this.physics.add.collider(S.enemies,S.ground);
    this.physics.add.overlap(S.attackHit,S.enemies,(hit,enemy)=>{ enemy.setVelocityX(-220); enemy.setTint(0xffaaaa); setTimeout(()=>enemy&&enemy.clearTint(),220); });

    spawnEnemy(this); this.time.addEvent({delay:1700,loop:true,callback:()=>spawnEnemy(this)});
  }

  function update(){
    const p=S.player; if(!p||!p.body) return;
    const left=this.input.keyboard.checkDown(S.cursors.left,1);
    const right=this.input.keyboard.checkDown(S.cursors.right,1);
    const jump=this.input.keyboard.checkDown(S.cursors.up,1);

    if(!p.isAttacking){
      p.setVelocityX(0);
      if(left){p.setVelocityX(-180); p.flipX=true; p.play('walk',true);} else
      if(right){p.setVelocityX(180); p.flipX=false; p.play('walk',true);} else
      {p.play('idle',true);}
    }
    if(jump && p.body.blocked.down){ p.setVelocityY(-420); }
  }

  function tryAttack(){
    if(S.player.isAttacking) return;
    S.player.isAttacking=true; S.player.play('attack',true);
    const dir=S.player.flipX?-1:1;
    S.attackHit.setPosition(S.player.x+(40*dir), S.player.y-30);
    S.attackHit.body.setEnable(true);
    setTimeout(()=>{ S.attackHit.body.setEnable(false); S.player.isAttacking=false; }, 400);
  }

  function spawnEnemy(scene){
    const w=scene.scale.width; const e=S.enemies.create(w+40,S.groundY,'enemies',0);
    e.setOrigin(0.5,1).setVelocityX(-80).body.setAllowGravity(true);
  }

  new Phaser.Game({
    type:Phaser.AUTO,parent:'game',width:window.innerWidth,height:window.innerHeight,
    physics:{default:'arcade',arcade:{gravity:{y:800},debug:false}},
    scene:{preload,create,update}
  });
})();
