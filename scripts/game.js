(function () {
  // ---------- Helpers ----------
  const lerp = (a,b,t)=> a+(b-a)*t;
  const clamp = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));
  const now = ()=> performance.now();

  class Input {
    constructor(canvas) {
      this.left = this.right = this.up = this.down = false;
      this.attack = false;
      this.pause = false;

      this.#bindKeys();
      this.#bindPointer(canvas);
    }
    #bindKeys() {
      const on = (e, v) => {
        const k = e.code;
        if (k === "ArrowLeft" || k === "KeyA") this.left = v;
        if (k === "ArrowRight" || k === "KeyD") this.right = v;
        if (k === "ArrowUp" || k === "KeyW" || k === "Space") this.up = v;
        if (k === "KeyJ" || k === "KeyK" || k === "Enter") this.attack = v;
        if (k === "Escape" || k === "KeyP") this.pause = v;
      };
      window.addEventListener("keydown", e => on(e, true));
      window.addEventListener("keyup",   e => on(e, false));
    }
    #bindPointer(canvas) {
      // Simple tap-to-attack on mobile; swipe left/right to move.
      let startX = null;
      canvas.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        this.attack = true;
      });
      canvas.addEventListener("pointermove", (e) => {
        if (startX == null) return;
        const dx = e.clientX - startX;
        this.left = dx < -30;
        this.right = dx > 30;
      });
      canvas.addEventListener("pointerup", () => {
        startX = null;
        this.left = this.right = false;
        this.attack = false;
      });
    }
  }

  class AnimatedSprite {
    constructor(image, frames, fps, loop) {
      this.img = image;
      this.frames = frames;
      this.fps = fps;
      this.loop = loop;
      this.time = 0;
      this.frame = 0;
    }
    update(dt) {
      this.time += dt;
      const total = this.frames;
      const frameF = (this.time * this.fps);
      if (this.loop) {
        this.frame = Math.floor(frameF) % total;
      } else {
        this.frame = Math.min(total - 1, Math.floor(frameF));
      }
    }
    reset() { this.time = 0; this.frame = 0; }
  }

  class Entity {
    constructor(kind, config) {
      this.kind = kind;
      this.cfg = config;
      this.x = 200;
      this.y = config.baseY ?? 0;
      this.vx = 0;
      this.vy = 0;
      this.dir = 1; // 1 right, -1 left
      this.hp = 100;
      this.maxHp = 100;
      this.dead = false;
      this.state = "idle";
      this.anims = new Map();    // state -> AnimatedSprite
      this.hitbox = { ...config.hitbox };
      this.invuln = 0;
      this.attackTimer = 0;
    }

    setAnimation(state) {
      if (this.state === state) return;
      const anim = this.anims.get(state);
      if (anim) {
        this.state = state;
        anim.reset();
      }
    }

    currentAnim() { return this.anims.get(this.state); }

    applyGravity(dt, gravity) {
      this.vy += gravity * dt;
    }

    get groundY() { return window.Loader.manifest.meta.groundY; }

    onGround() { return this.y >= this.groundY; }

    bbox() {
      const hb = this.hitbox;
      const fx = this.x + (this.dir === 1 ? hb.x : -(hb.x + hb.w));
      const fy = this.y - hb.y - hb.h;
      return { x: fx, y: fy, w: hb.w, h: hb.h };
    }

    intersects(other) {
      const a = this.bbox(), b = other.bbox();
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
  }

  class Player extends Entity {
    constructor(cfg, assets) {
      super("player", cfg);
      this.score = 0;
      this.combo = 0;
      this.loadAnims(cfg, assets);
    }
    loadAnims(cfg, assets) {
      for (const [state, meta] of Object.entries(cfg.animations)) {
        const img = assets.get(meta.path);
        this.anims.set(state, new AnimatedSprite(img, meta.frames, meta.fps, meta.loop));
      }
    }
    update(dt, input) {
      const g = this.cfg.gravity;
      // Horizontal
      const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.vx = move * this.cfg.speed;

      if (move !== 0) this.dir = (move >= 0 ? 1 : -1);

      // Attack
      if (input.attack && this.attackTimer <= 0 && !this.dead) {
        this.setAnimation("attack");
        this.attackTimer = 0.45; // locked in attack
        if (window.SFX("attack")) window.SFX("attack").currentTime = 0, window.SFX("attack").play();
      }

      // Jump
      if (input.up && this.onGround() && !this.dead && this.attackTimer <= 0) {
        this.vy = this.cfg.jumpVelocity;
        this.setAnimation("jump");
        if (window.SFX("jump")) window.SFX("jump").currentTime = 0, window.SFX("jump").play();
      }

      // Physics
      this.applyGravity(dt, g);
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y > this.groundY) { this.y = this.groundY; this.vy = 0; }

      // State transitions
      if (this.dead) {
        this.setAnimation("death");
      } else if (this.attackTimer > 0) {
        // remain in attack animation
      } else if (!this.onGround()) {
        this.setAnimation("jump");
      } else if (Math.abs(this.vx) > 1) {
        this.setAnimation("walk");
      } else {
        this.setAnimation("idle");
      }

      if (this.attackTimer > 0) this.attackTimer -= dt;
      if (this.invuln > 0) this.invuln -= dt;

      // Update anim
      const anim = this.currentAnim();
      if (anim) anim.update(dt);
    }

    takeDamage(dmg) {
      if (this.invuln > 0 || this.dead) return;
      this.hp -= dmg;
      this.invuln = 0.5;
      this.setAnimation(this.hp > 0 ? "hurt" : "death");
      if (this.hp <= 0) {
        this.dead = true;
        if (window.SFX("death")) window.SFX("death").play();
      } else if (window.SFX("hit")) window.SFX("hit").play();
    }
  }

  class Enemy extends Entity {
    constructor(type, cfg, assets, x) {
      super(type, cfg);
      this.loadAnims(cfg, assets);
      this.x = x;
    }
    loadAnims(cfg, assets) {
      for (const [state, meta] of Object.entries(cfg.animations)) {
        const img = assets.get(meta.path);
        this.anims.set(state, new AnimatedSprite(img, meta.frames, meta.fps, meta.loop));
      }
    }
    update(dt, player) {
      if (this.dead) { this.setAnimation("death"); this.applyGravity(dt, this.cfg.gravity); this.y += this.vy * dt; return; }

      const dist = player.x - this.x;
      this.dir = (dist >= 0 ? 1 : -1);

      const ai = this.cfg.ai ?? { aggroRange: 400, attackRange: 64, attackCooldown: 1 };
      if (Math.abs(dist) < ai.aggroRange) {
        if (Math.abs(dist) > ai.attackRange) {
          this.vx = this.dir * this.cfg.speed * 0.75;
          this.setAnimation("walk");
        } else {
          this.vx = 0;
          if (this.attackTimer <= 0) {
            this.setAnimation("attack");
            this.attackTimer = ai.attackCooldown;
            if (window.SFX("attack")) window.SFX("attack").currentTime = 0, window.SFX("attack").play();
          }
        }
      } else {
        this.vx = 0; this.setAnimation("idle");
      }

      this.applyGravity(dt, this.cfg.gravity);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y > this.groundY) { this.y = this.groundY; this.vy = 0; }

      if (this.attackTimer > 0) this.attackTimer -= dt;
      if (this.invuln > 0) this.invuln -= dt;

      const anim = this.currentAnim();
      if (anim) anim.update(dt);
    }

    takeDamage(dmg) {
      if (this.invuln > 0 || this.dead) return false;
      this.hp -= dmg;
      this.invuln = 0.2;
      this.setAnimation(this.hp > 0 ? "hurt" : "death");
      if (this.hp <= 0) this.dead = true;
      return this.dead;
    }
  }

  class Spawner {
    constructor(modeCfg) {
      this.mode = modeCfg;
      this.timer = 0;
      this.waveIndex = 0;
      this.active = "challenge" in modeCfg ? "challenge" : "story";
    }
    update(dt, game) {
      if (this.active === "story") return; // basic waves could be triggered externally
      this.timer -= dt;
      if (this.timer <= 0) {
        const sec = this.mode.challenge.spawnEverySec;
        const scale = this.mode.challenge.spawnScale;
        const count = 1 + Math.floor(game.elapsed / 10 * scale);
        this.spawnEnemies(game, count);
        this.timer = sec;
      }
    }
    spawnEnemies(game, count) {
      for (let i = 0; i < count; i++) {
        const x = (Math.random() < 0.5 ? -120 : game.width + 120);
        game.spawnEnemy("ninja", x);
      }
    }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.width = canvas.width;
      this.height = canvas.height;

      this.assets = Loader.images;
      this.manifest = Loader.manifest;
      this.audio = Loader.audio;

      this.input = new Input(canvas);
      this.scale = this.manifest.meta.baseScale || 2.5;
      this.elapsed = 0;

      this.player = null;
      this.entities = [];
      this.mode = "story"; // or "challenge"
      this.spawner = new Spawner(this.manifest.modes);

      this.last = now();
      this.running = false;

      window.addEventListener("resize", () => this.#resize());
      this.#resize();
    }

    start(mode) {
      this.mode = mode || "story";
      this.reset();
      this.running = true;
      this.loop();
      this.playBGM();
    }

    reset() {
      this.entities = [];
      const usagiCfg = this.manifest.characters.usagi;
      this.player = new Player(usagiCfg, this.assets);
      this.player.x = this.width * 0.25;
      this.player.y = this.manifest.meta.groundY;
      this.player.hp = 100; this.player.maxHp = 100;
      this.entities.push(this.player);

      // Start a few ninjas for story mode
      if (this.mode === "story") {
        [this.width * 0.7, this.width * 0.9].forEach(x => this.spawnEnemy("ninja", x));
      }

      this.elapsed = 0;
    }

    spawnEnemy(type, x) {
      const cfg = this.manifest.characters[type];
      const e = new Enemy(type, cfg, this.assets, x);
      e.y = this.manifest.meta.groundY;
      e.hp = 40;
      this.entities.push(e);
    }

    loop() {
      if (!this.running) return;
      const t = now();
      const dt = Math.min(0.033, (t - this.last) / 1000); // clamp dt
      this.last = t;
      this.elapsed += dt;

      this.update(dt);
      this.render();

      if (this.running) requestAnimationFrame(() => this.loop());
    }

    update(dt) {
      // Pause toggle
      if (this.input.pause) {
        this.input.pause = false;
        this.pause();
        return;
      }

      // Spawner (challenge)
      if (this.mode === "challenge") this.spawner.update(dt, this);

      // Update entities
      for (const e of this.entities) {
        if (e === this.player) e.update(dt, this.input);
        else e.update(dt, this.player);
      }

      // Combat windows (hit frames)
      this.handleCombat();

      // Cull dead enemies after death anim finishes
      this.entities = this.entities.filter(e => !(e.dead && e !== this.player && e.currentAnim()?.frame >= (e.currentAnim()?.frames - 1)));
      if (this.player.dead && this.player.currentAnim()?.frame >= (this.player.currentAnim()?.frames - 1)) {
        this.gameOver();
      }
    }

    handleCombat() {
      const p = this.player;
      const pAnim = p.currentAnim();
      const hitFrames = this.manifest.characters.usagi.animations.attack.hitFrames || [];
      const isHitFrame = p.state === "attack" && hitFrames.includes(pAnim.frame);

      if (isHitFrame) {
        for (const e of this.entities) {
          if (e === p || e.dead) continue;
          // Simple "attack range" in front of player
          const range = 70;
          const dx = e.x - p.x;
          const facingOK = (p.dir === 1 && dx > -10 && dx < range) || (p.dir === -1 && dx < 10 && dx > -range);
          if (facingOK && Math.abs(e.y - p.y) < 30) {
            const killed = e.takeDamage(25);
            if (killed) p.score += 100; else p.score += 10;
          }
        }
      }

      // Enemy attack windows
      for (const e of this.entities) {
        if (e === p || e.dead) continue;
        const cfg = this.manifest.characters[e.kind].animations.attack;
        if (!cfg) continue;
        const a = e.currentAnim();
        const eHit = e.state === "attack" && (cfg.hitFrames || [2]).includes(a.frame);
        if (eHit && e.intersects(p)) {
          p.takeDamage(10);
        }
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // Parallax-ish flat background (placeholder color bands behind your level art)
      const h = this.height;
      ctx.fillStyle = "#0c1020"; ctx.fillRect(0, 0, this.width, h);
      ctx.fillStyle = "#121a32"; ctx.fillRect(0, h*0.55, this.width, h*0.45);

      // Ground line
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.manifest.meta.groundY + 1);
      ctx.lineTo(this.width, this.manifest.meta.groundY + 1);
      ctx.stroke();

      // Entities
      for (const e of this.entities) {
        const anim = e.currentAnim();
        if (!anim) continue;
        const frameW = this.manifest.meta.frameWidth;
        const frameH = this.manifest.meta.frameHeight;
        const sx = anim.frame * frameW;
        const sy = 0;
        const scale = this.scale;

        const drawX = Math.round(e.x);
        const drawY = Math.round(e.y);

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.scale(e.dir, 1);
        ctx.translate(-Math.round(frameW * scale * 0.5), -Math.round(frameH * scale));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(anim.img, sx, sy, frameW, frameH, 0, 0, Math.round(frameW * scale), Math.round(frameH * scale));
        ctx.restore();

        // Debug: bounding boxes (toggle if needed)
        // ctx.strokeStyle = "rgba(255,0,0,.4)";
        // const hb = e.bbox();
        // ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }

      // UI: HP + Score
      this.drawHUD(ctx);
    }

    drawHUD(ctx) {
      const p = this.player;
      const barW = 220, barH = 18, x = 20, y = 20;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);

      // health bar
      const hpPct = clamp(p.hp / p.maxHp, 0, 1);
      ctx.fillStyle = "#2c3748"; ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = "#43e97b"; ctx.fillRect(x, y, barW * hpPct, barH);
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.strokeRect(x, y, barW, barH);

      // score
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.font = "16px monospace";
      ctx.fillText(`Score: ${p.score}`, x, y + barH + 22);
      ctx.restore();
    }

    pause() {
      this.running = false;
      window.UI.show("pause");
      this.stopBGM(false);
    }

    resume() {
      if (this.running) return;
      window.UI.hideAll();
      this.running = true;
      this.last = now();
      this.loop();
      this.playBGM();
    }

    quitToMenu() {
      this.running = false;
      this.stopBGM(true);
      window.UI.show("title");
    }

    gameOver() {
      this.running = false;
      const allowInitials = this.mode === "challenge";
      window.UI.setGameOver(this.player.score, allowInitials);
      window.UI.show("gameover");
      this.stopBGM(true);
      const sfx = window.SFX("death"); if (sfx) sfx.play();
    }

    playBGM() {
      const bgm = this.audio.get(this.manifest.audio?.bgm);
      if (!bgm) return;
      bgm.loop = true;
      try { bgm.play(); } catch {}
    }

    stopBGM(resetTime) {
      const bgm = this.audio.get(this.manifest.audio?.bgm);
      if (!bgm) return;
      bgm.pause();
      if (resetTime) bgm.currentTime = 0;
    }

    #resize() {
      // Keep aspect ~16:9 while fitting container
      const root = this.canvas.parentElement;
      const maxW = Math.min(root.clientWidth, 960);
      const aspect = 16/9;
      const w = maxW;
      const h = Math.round(w / aspect);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      // Internal buffer fixed for consistent physics; render uses CSS scaling.
      this.width = this.canvas.width;
      this.height = this.canvas.height;
    }
  }

  // SFX helper
  window.SFX = function (name) {
    const p = Loader.manifest.audio?.sfx?.[name];
    return p ? Loader.audio.get(p) : null;
  };

  window.Game = Game;
})();
