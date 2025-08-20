// game.js — Usagi SNES sheet (256x384 per frame), pixel-perfect + aligned
(function () {
  'use strict';

  const BG_PATH    = 'assets/background1.png';
  const USAGI_PATH = 'assets/usagi_snes_sheet.png';
  const ENEMY_PATH = 'assets/enemy_sprites.png';

  const FRAME_W = 256;
  const FRAME_H = 384;

  // Use an integer scale to avoid sub-pixel seams (0.25 = quarter size)
  const SCALE = 0.25;         // 256x384 -> 64x96 on screen (SNES-y, crisp)

  const S = {
    game:null, player:null, cursors:null,
    ground:null, groundY:0, enemies:null, attackHit:null,
    touch:{ left:false, right:false, jump:false, attack:false },
    canAttack:true
  };

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
        pixelArt:true,                                  // <-- crispy pixels
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

  function preload(){
    this.load.image('bg', BG_PATH);
    this.load.spritesheet('usagi', USAGI_PATH, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.spritesheet('enemies', ENEMY_PATH, { frameWidth: 64, frameHeight: 64 });
  }

  function create(){
    const w=this.scale.width, h=this.scale.height;

    // Background
    this.add.image(0,0,'bg').setOrigin(0).setDisplaySize(w,h);

    // Make sure textures use nearest-neighbour (no blur)
    this.textures.get('usagi')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('enemies')?.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Ground
    S.groundY = h - 110;
    const ground = this.add.rectangle(0, S.groundY, w*2, 24, 0x000000, 0);
    this.physics.add.existing(ground, true);
    S.ground = ground;

    // Animations
    this.anims.create({ key:'idle',   frames:[{ key:'usagi', frame:1 }], frameRate:1, repeat:-1 });
    this.anims.create({ key:'walk',   frames:this.anims.generateFrameNumbers('usagi',{start:0,end:2}), frameRate:10, repeat:-1 });
    this.anims.create({ key:'attack', frames:this.anims.generateFrameNumbers('usagi',{start:3,end:5}), frameRate:14, repeat:0 });

    // Player (pixel-perfect)
    S.player = this.physics.add.sprite(120, S.groundY, 'usagi', 1)
      .setOrigin(0.5,1)
      .setCollideWorldBounds(true)
      .setScale(SCALE);

    // Tight body + offset so feet sit on the ground line
    // Choose a sensible hitbox in *source* pixels, then convert to unscaled body:
    const hitW_src = 56, hitH_src = 88;                 // around torso/legs in art
    const bodyW = Math.round(hitW_src / SCALE);         // convert to physics pixels
    const bodyH = Math.round(hitH_src / SCALE);
    S.player.body.setSize(bodyW, bodyH);

    // Center horizontally; vertically bottom-align leaving a small foot margin (4px at display scale)
    const displayH = FRAME_H * SCALE;                   // 384 * 0.25 = 96
    const footMargin = 4;                               // display pixels
    const offX = Math.round(((FRAME_W * SCALE) - (bodyW * SCALE)) / 2 / SCALE);
    const offY = Math.round(((FRAME_H * SCALE) - (bodyH * SCALE) - footMargin) / SCALE);
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

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ wireTouchButtons(); armStart(); });
  } else {
    wireTouchButtons(); armStart();
  }
})();
