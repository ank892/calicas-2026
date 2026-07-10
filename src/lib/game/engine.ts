import { LEVELS, TILE, type LevelDef } from "./levels";
import { sfx } from "./audio";

const GRAVITY = 620;
const MOVE_SPEED = 118;
const JUMP_VEL = 270;
const MAX_FALL = 500;
const ENEMY_SPEED = 42;
const COINS_FOR_1UP = 20;

export type Input = { left: boolean; right: boolean; jump: boolean };
type Rect = { x: number; y: number; w: number; h: number };

type Enemy = {
  type: "walker" | "jumper";
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; alive: boolean; onGround: boolean;
  jumpCooldown: number; anim: number;
};

type Coin = { x: number; y: number; taken: boolean; anim: number };
type Powerup = {
  kind: "imperial" | "botines" | "camiseta";
  x: number; y: number; vx: number; vy: number; taken: boolean; onGround: boolean;
};
type Block = { col: number; row: number; kind: "brick" | "question"; used: boolean; bumpT: number };

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  color: string; size: number; gravity: boolean;
};

type FloatingText = { x: number; y: number; text: string; color: string; life: number };

export type GameResult = {
  finished: boolean;
  died: boolean;
  score: number;
  timeMs: number;
  coinsCollected: number;
  enemiesStomped: number;
  powerupsUsed: number;
  noHit: boolean;   // termino sin recibir dano
};

export type EngineOptions = {
  onResult?: (r: GameResult) => void;
  audio?: boolean;
};

// El jugador puede tener a lo sumo un power-up activo (aparte de la vida extra
// que da la camiseta rojiamarilla, que se comporta como escudo de un golpe).
type ActivePower = "none" | "botines"; // imperial es tempoal (invuln); camiseta es un "escudo" persistente

export class GameEngine {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  level: LevelDef;
  levelIndex: number;
  tiles: string[];
  cols: number;
  rows: number;
  width: number;
  height: number;
  player = {
    x: 0, y: 0, vx: 0, vy: 0, w: 12, h: 16, onGround: false,
    facing: 1, invuln: 0, anim: 0, hurtT: 0,
    lives: 3, coinsForLife: 0,
    activePower: "none" as ActivePower,
    hasShield: false,
    imperialT: 0,     // segundos de invencibilidad temporal por Imperial
  };
  enemies: Enemy[] = [];
  coins: Coin[] = [];
  powerups: Powerup[] = [];
  blocks: Block[] = [];
  particles: Particle[] = [];
  floats: FloatingText[] = [];
  spawnedFromBlock = new Set<string>();  // key col:row para no re-spawnear

  goalX = 0;
  cameraX = 0;
  score = 0;
  coinsCollected = 0;
  enemiesStomped = 0;
  powerupsUsed = 0;
  noHit = true;
  timeLeft = 0;
  elapsed = 0;
  running = false;
  state: "playing" | "won" | "died" | "timeout" = "playing";
  input: Input = { left: false, right: false, jump: false };
  prevJump = false;
  jumpBuffer = 0;
  coyoteTime = 0;
  jumpsRemaining = 1;
  lastFrame = 0;
  raf = 0;
  onResult?: (r: GameResult) => void;

  constructor(canvas: HTMLCanvasElement, levelIndex: number, opts: EngineOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.levelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    this.tiles = [...this.level.tiles];
    this.cols = this.tiles[0].length;
    this.rows = this.tiles.length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.timeLeft = this.level.timeLimit;
    this.onResult = opts.onResult;
    this.parseLevel();
  }

  parseLevel() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.tiles[r][c];
        const px = c * TILE;
        const py = r * TILE;
        switch (ch) {
          case "P":
            this.player.x = px + 2;
            this.player.y = py;
            break;
          case "G":
            this.goalX = px;
            break;
          case "E":
            this.enemies.push({ type: "walker", x: px, y: py, vx: -ENEMY_SPEED, vy: 0, w: 14, h: 14, alive: true, onGround: false, jumpCooldown: 0, anim: 0 });
            break;
          case "L":
            this.enemies.push({ type: "jumper", x: px, y: py, vx: 0, vy: 0, w: 14, h: 14, alive: true, onGround: false, jumpCooldown: 1, anim: 0 });
            break;
          case "C":
            this.coins.push({ x: px + 4, y: py + 4, taken: false, anim: Math.random() * Math.PI * 2 });
            break;
          case "B":
            this.blocks.push({ col: c, row: r, kind: "brick", used: false, bumpT: 0 });
            break;
          case "?":
            this.blocks.push({ col: c, row: r, kind: "question", used: false, bumpT: 0 });
            break;
          case "I":
            this.powerups.push({ kind: "imperial", x: px + 2, y: py, vx: 0, vy: 0, taken: false, onGround: false });
            break;
          case "S":
            this.powerups.push({ kind: "botines", x: px + 2, y: py, vx: 0, vy: 0, taken: false, onGround: false });
            break;
          case "J":
            this.powerups.push({ kind: "camiseta", x: px + 2, y: py, vx: 0, vy: 0, taken: false, onGround: false });
            break;
        }
      }
    }
  }

  isSolidChar(ch: string): boolean {
    return ch === "#" || ch === "=" || ch === "B" || ch === "?";
  }

  tileAt(col: number, row: number): string {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return ".";
    return this.tiles[row][col];
  }

  setTile(col: number, row: number, ch: string) {
    const row_str = this.tiles[row];
    this.tiles[row] = row_str.substring(0, col) + ch + row_str.substring(col + 1);
  }

  solidAt(x: number, y: number): boolean {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    return this.isSolidChar(this.tileAt(c, r));
  }

  rectSolidCollides(rect: Rect): boolean {
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 1) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.isSolidChar(this.tileAt(c, r))) return true;
      }
    }
    return false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastFrame) / 1000, 0.033);
      this.lastFrame = t;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  setInput(i: Partial<Input>) {
    this.input = { ...this.input, ...i };
  }

  update(dt: number) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finish("timeout");
      return;
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateCoins(dt);
    this.updatePowerups(dt);
    this.updateParticles(dt);
    this.updateFloats(dt);
    this.updateBlocks(dt);
    this.updateCamera();
  }

  updatePlayer(dt: number) {
    const p = this.player;
    let ax = 0;
    if (this.input.left) ax -= 1;
    if (this.input.right) ax += 1;
    p.vx = ax * MOVE_SPEED;
    if (ax !== 0) p.facing = ax;

    const jumpPressed = this.input.jump && !this.prevJump;
    this.prevJump = this.input.jump;
    if (jumpPressed) this.jumpBuffer = 0.15;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (p.onGround) {
      this.coyoteTime = 0.12;
      this.jumpsRemaining = p.activePower === "botines" ? 2 : 1;
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - dt);
    }

    // Salto normal (con coyote/buffer)
    if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
      p.vy = -JUMP_VEL;
      p.onGround = false;
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
      this.jumpsRemaining -= 1;
      sfx("jump");
    } else if (this.jumpBuffer > 0 && !p.onGround && this.jumpsRemaining > 0 && p.activePower === "botines") {
      // Doble salto con botines
      p.vy = -JUMP_VEL * 0.95;
      this.jumpBuffer = 0;
      this.jumpsRemaining -= 1;
      sfx("jump");
      // Partícula de doble salto
      for (let i = 0; i < 6; i++) {
        this.spawnParticle(p.x + p.w / 2, p.y + p.h, (Math.random() - 0.5) * 60, -20 - Math.random() * 30, 0.35, "#FFD400", 2);
      }
    }

    if (!this.input.jump && p.vy < -80) p.vy = -80;
    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

    // Move X
    p.x += p.vx * dt;
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > this.width) p.x = this.width - p.w;
    if (this.rectSolidCollides(p)) {
      const stepX = p.vx > 0 ? -1 : 1;
      while (this.rectSolidCollides(p)) p.x += stepX;
      p.vx = 0;
    }

    // Move Y
    p.y += p.vy * dt;
    if (this.rectSolidCollides(p)) {
      const stepY = p.vy > 0 ? -1 : 1;
      if (p.vy < 0) {
        const headCol = Math.floor((p.x + p.w / 2) / TILE);
        const headRow = Math.floor(p.y / TILE);
        this.hitBlockFromBelow(headCol, headRow);
      }
      while (this.rectSolidCollides(p)) p.y += stepY;
      if (p.vy > 0) p.onGround = true;
      p.vy = 0;
    } else {
      p.onGround = false;
    }

    if (p.y > this.height + 40) {
      this.finish("died");
      return;
    }

    // Anim / timers
    if (Math.abs(p.vx) > 5) p.anim += dt * 10;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.imperialT > 0) p.imperialT = Math.max(0, p.imperialT - dt);
    if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);

    // Coin pickup
    for (const coin of this.coins) {
      if (coin.taken) continue;
      if (rectOverlaps(p, { x: coin.x, y: coin.y, w: 8, h: 8 })) {
        coin.taken = true;
        this.score += 5;
        this.coinsCollected += 1;
        p.coinsForLife += 1;
        sfx("coin");
        // Sparkle
        for (let i = 0; i < 5; i++) {
          this.spawnParticle(coin.x + 4, coin.y + 4, (Math.random() - 0.5) * 80, -20 - Math.random() * 40, 0.5, "#FFD400", 2);
        }
        this.floatText(coin.x, coin.y - 4, "+5", "#FFD400");
        if (p.coinsForLife >= COINS_FOR_1UP) {
          p.coinsForLife -= COINS_FOR_1UP;
          p.lives += 1;
          sfx("life");
          this.floatText(p.x, p.y - 10, "1UP!", "#66FF88");
        }
      }
    }

    // Power-up pickup
    for (const pu of this.powerups) {
      if (pu.taken) continue;
      if (rectOverlaps(p, { x: pu.x, y: pu.y, w: 14, h: 14 })) {
        pu.taken = true;
        this.applyPowerup(pu.kind);
      }
    }

    // Meta
    if (p.x + p.w >= this.goalX) {
      this.score += Math.floor(this.timeLeft) * 2;
      if (this.noHit) this.score += 100;   // bono por termina sin dano
      this.finish("won");
    }
  }

  applyPowerup(kind: Powerup["kind"]) {
    this.powerupsUsed += 1;
    this.score += 50;
    const p = this.player;
    if (kind === "imperial") {
      p.imperialT = 8;
      sfx("power");
      this.floatText(p.x, p.y - 10, "IMPERIAL!", "#FFD400");
    } else if (kind === "botines") {
      p.activePower = "botines";
      sfx("power");
      this.floatText(p.x, p.y - 10, "BOTINES!", "#FFD400");
    } else if (kind === "camiseta") {
      p.hasShield = true;
      sfx("power");
      this.floatText(p.x, p.y - 10, "CAMISETA CSH!", "#c02030");
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 60;
      this.spawnParticle(p.x + p.w / 2, p.y + p.h / 2, Math.cos(a) * s, Math.sin(a) * s, 0.7, "#FFD400", 3);
    }
  }

  hitBlockFromBelow(col: number, row: number) {
    const b = this.blocks.find((bl) => bl.col === col && bl.row === row && !bl.used);
    if (!b) return;
    b.used = true;
    b.bumpT = 0.18;
    if (b.kind === "question") {
      this.score += 10;
      this.setTile(col, row, "#");
      // 25% spawn power-up random, 75% moneda flotante
      if (Math.random() < 0.25) {
        const kinds: Powerup["kind"][] = ["imperial", "botines", "camiseta"];
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        this.powerups.push({ kind: k, x: col * TILE + 1, y: (row - 1) * TILE, vx: 0, vy: -60, taken: false, onGround: false });
      } else {
        this.coins.push({ x: col * TILE + 4, y: (row - 1) * TILE + 4, taken: false, anim: 0 });
      }
    } else if (b.kind === "brick") {
      this.score += 5;
      this.setTile(col, row, ".");
      for (let i = 0; i < 8; i++) {
        this.spawnParticle(col * TILE + 8, row * TILE + 8, (Math.random() - 0.5) * 120, -60 - Math.random() * 80, 0.6, "#c04020", 2, true);
      }
    }
  }

  updateBlocks(dt: number) {
    for (const b of this.blocks) if (b.bumpT > 0) b.bumpT = Math.max(0, b.bumpT - dt);
  }

  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.anim += dt * 8;
      e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
      if (e.type === "walker") {
        e.x += e.vx * dt;
        if (this.rectSolidCollides(e)) {
          e.x -= e.vx * dt;
          e.vx = -e.vx;
        }
        const footY = e.y + e.h + 1;
        const aheadX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        if (!this.solidAt(aheadX, footY) && e.onGround) e.vx = -e.vx;
      } else {
        e.x += e.vx * dt;
        if (this.rectSolidCollides(e)) {
          e.x -= e.vx * dt;
          e.vx = 0;
        }
        e.jumpCooldown -= dt;
        if (e.onGround && e.jumpCooldown <= 0) {
          e.vy = -180;
          e.jumpCooldown = 1.4 + Math.random() * 0.5;
          e.vx = (this.player.x < e.x ? -1 : 1) * 30;
        }
      }

      e.y += e.vy * dt;
      if (this.rectSolidCollides(e)) {
        const stepY = e.vy > 0 ? -1 : 1;
        while (this.rectSolidCollides(e)) e.y += stepY;
        if (e.vy > 0) e.onGround = true;
        e.vy = 0;
      } else {
        e.onGround = false;
      }

      if (rectOverlaps(this.player, e)) {
        // Si el jugador cae encima, lo aplasta
        if (this.player.vy > 40 && this.player.y + this.player.h - 6 < e.y) {
          this.killEnemy(e);
          this.player.vy = -180;
        } else if (this.player.imperialT > 0) {
          // Imperial: los aplasta al tocarlos
          this.killEnemy(e);
        } else if (this.player.invuln <= 0) {
          this.hurtPlayer();
        }
      }

      if (e.y > this.height + 40) e.alive = false;
    }
  }

  killEnemy(e: Enemy) {
    e.alive = false;
    this.enemiesStomped += 1;
    this.score += 15;
    sfx("stomp");
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 80;
      this.spawnParticle(e.x + e.w / 2, e.y + e.h / 2, Math.cos(a) * s, Math.sin(a) * s - 30, 0.5, e.type === "walker" ? "#5a1a80" : "#801020", 2, true);
    }
    this.floatText(e.x, e.y, "+15", "#FFD400");
  }

  updateCoins(dt: number) {
    for (const c of this.coins) c.anim += dt * 4;
  }

  updatePowerups(dt: number) {
    for (const pu of this.powerups) {
      if (pu.taken) continue;
      pu.vy = Math.min(pu.vy + GRAVITY * dt, MAX_FALL);
      pu.y += pu.vy * dt;
      const rect: Rect = { x: pu.x, y: pu.y, w: 14, h: 14 };
      if (this.rectSolidCollides(rect)) {
        const step = pu.vy > 0 ? -1 : 1;
        while (this.rectSolidCollides(rect)) { pu.y += step; rect.y = pu.y; }
        pu.vy = 0;
        pu.onGround = true;
      }
    }
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += 400 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  updateFloats(dt: number) {
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= 25 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  spawnParticle(x: number, y: number, vx: number, vy: number, life: number, color: string, size = 2, gravity = false) {
    if (this.particles.length > 120) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size, gravity });
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, life: 0.9 });
  }

  hurtPlayer() {
    const p = this.player;
    this.noHit = false;
    // Camiseta absorbe un golpe
    if (p.hasShield) {
      p.hasShield = false;
      p.invuln = 1.4;
      p.hurtT = 0.4;
      sfx("hurt");
      this.floatText(p.x, p.y - 4, "¡Aguantó!", "#FFD400");
      // Particulas rojiamarillas
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 30 + Math.random() * 80;
        const col = i % 2 === 0 ? "#c02030" : "#FFD400";
        this.spawnParticle(p.x + p.w / 2, p.y + p.h / 2, Math.cos(a) * s, Math.sin(a) * s, 0.5, col, 2);
      }
      return;
    }
    // Botines se pierden al recibir golpe
    if (p.activePower === "botines") {
      p.activePower = "none";
      this.jumpsRemaining = Math.min(this.jumpsRemaining, 1);
      p.invuln = 1.4;
      p.hurtT = 0.4;
      sfx("hurt");
      this.floatText(p.x, p.y - 4, "-Botines", "#c02030");
      return;
    }
    // Sin poderes: pierde vida
    p.lives -= 1;
    p.invuln = 1.6;
    p.hurtT = 0.4;
    p.vy = -180;
    p.vx = -p.facing * 60;
    sfx("hurt");
    this.score = Math.max(0, this.score - 20);
    if (p.lives <= 0) {
      // muerte diferida un poco para ver el knockback
      setTimeout(() => this.finish("died"), 500);
    }
  }

  updateCamera() {
    const viewW = this.canvas.width;
    const target = this.player.x + this.player.w / 2 - viewW / 2;
    this.cameraX = Math.max(0, Math.min(this.width - viewW, target));
  }

  finish(reason: "won" | "died" | "timeout") {
    if (this.state !== "playing") return;
    this.state = reason;
    this.running = false;
    if (reason === "won") sfx("goal");
    else sfx("gameover");
    this.onResult?.({
      finished: reason === "won",
      died: reason !== "won",
      score: this.score,
      timeMs: Math.round(this.elapsed * 1000),
      coinsCollected: this.coinsCollected,
      enemiesStomped: this.enemiesStomped,
      powerupsUsed: this.powerupsUsed,
      noHit: this.noHit,
    });
  }

  // ------------------------ RENDER ------------------------
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fondo
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, this.level.bgTop);
    grad.addColorStop(1, this.level.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Sol
    ctx.fillStyle = "rgba(255,220,90,0.85)";
    ctx.beginPath();
    ctx.arc(W - 40 - this.cameraX * 0.1, 40, 22, 0, Math.PI * 2);
    ctx.fill();

    // Nubes (parallax lejano)
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 90 - this.cameraX * 0.3) % (W + 100) + W + 100) % (W + 100) - 50;
      const cy = 24 + (i % 2) * 14;
      drawCloud(ctx, cx, cy);
    }

    // Tribuna Rosabal en parallax medio
    drawTribune(ctx, W, H, this.cameraX);

    // Cerros
    ctx.fillStyle = "rgba(60,20,30,0.6)";
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 90 - this.cameraX * 0.5) % (W + 180) + W + 180) % (W + 180) - 90;
      const hy = H - 60;
      drawMountain(ctx, hx, hy);
    }

    ctx.save();
    ctx.translate(-Math.floor(this.cameraX), 0);

    // Tiles
    const c0 = Math.max(0, Math.floor(this.cameraX / TILE) - 1);
    const c1 = Math.min(this.cols, Math.ceil((this.cameraX + W) / TILE) + 1);
    for (let r = 0; r < this.rows; r++) {
      for (let c = c0; c < c1; c++) {
        const ch = this.tileAt(c, r);
        this.drawTile(ch, c * TILE, r * TILE);
      }
    }

    // Meta
    drawGoal(ctx, this.goalX, (this.rows - 4) * TILE);

    // Bloques
    for (const b of this.blocks) {
      if (b.used) continue;
      const yOff = b.bumpT > 0 ? -Math.sin((0.18 - b.bumpT) / 0.18 * Math.PI) * 4 : 0;
      if (b.kind === "question") drawQuestion(ctx, b.col * TILE, b.row * TILE + yOff);
      else drawBrick(ctx, b.col * TILE, b.row * TILE + yOff);
    }

    // Monedas
    for (const coin of this.coins) {
      if (coin.taken) continue;
      drawCoin(ctx, coin.x, coin.y + Math.sin(coin.anim) * 1.5);
    }

    // Power-ups
    for (const pu of this.powerups) {
      if (pu.taken) continue;
      if (pu.kind === "imperial") drawImperial(ctx, pu.x, pu.y);
      else if (pu.kind === "botines") drawBotines(ctx, pu.x, pu.y);
      else drawCamiseta(ctx, pu.x, pu.y);
    }

    // Enemigos
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.type === "walker") drawSaprisista(ctx, e.x, e.y, e.anim);
      else drawLiguista(ctx, e.x, e.y, e.onGround);
    }

    // Player
    const p = this.player;
    drawJafey(ctx, p.x, p.y, p.facing, p.anim, p.invuln > 0, p.imperialT > 0, p.hasShield, p.onGround, p.vy);

    // Partículas (encima del mundo pero debajo del HUD)
    for (const par of this.particles) {
      const alpha = Math.max(0, par.life / par.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = par.color;
      ctx.fillRect(par.x | 0, par.y | 0, par.size, par.size);
    }
    ctx.globalAlpha = 1;

    // Textos flotantes
    for (const f of this.floats) {
      const alpha = Math.max(0, f.life / 0.9);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000";
      ctx.font = "bold 8px monospace";
      ctx.fillText(f.text, (f.x | 0) + 1, (f.y | 0) + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x | 0, f.y | 0);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    this.renderHUD();
  }

  drawTile(ch: string, x: number, y: number) {
    const ctx = this.ctx;
    if (ch === "#") drawGround(ctx, x, y);
    else if (ch === "=") drawPlatform(ctx, x, y);
  }

  renderHUD() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, 20);
    ctx.fillStyle = "#FFD400";
    ctx.font = "bold 9px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(`${this.score.toString().padStart(4, "0")} pts`, 4, 3);

    // Vidas
    for (let i = 0; i < this.player.lives; i++) {
      drawHeart(ctx, 60 + i * 10, 3);
    }
    // Escuditos para 1UP
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.fillText(`x${this.player.coinsForLife}/${COINS_FOR_1UP}`, 4, 12);

    // Power-ups activos
    let hx = W / 2 - 20;
    if (this.player.imperialT > 0) {
      ctx.fillStyle = "#FFD400";
      ctx.fillText(`⚡${Math.ceil(this.player.imperialT)}s`, hx, 3);
      hx += 40;
    }
    if (this.player.activePower === "botines") {
      ctx.fillStyle = "#FFD400";
      ctx.fillText("👟x2", hx, 3);
      hx += 30;
    }
    if (this.player.hasShield) {
      ctx.fillStyle = "#c02030";
      ctx.fillText("👕", hx, 3);
    }

    const t = Math.max(0, this.timeLeft).toFixed(0);
    ctx.fillStyle = "#FFD400";
    ctx.fillText(`⏱${t}s`, W - 40, 3);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.fillText(this.level.name.toUpperCase(), W / 2 - 15, 12);
  }
}

function rectOverlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============================ DIBUJOS ============================

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
}

function drawGround(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x, y, 16, 16, "#5a3018");
  px(ctx, x, y, 16, 3, "#7a4020");
  px(ctx, x + 1, y + 1, 2, 1, "#a05a2a");
  px(ctx, x + 8, y + 6, 2, 2, "#3a1a0a");
  px(ctx, x + 3, y + 10, 3, 2, "#3a1a0a");
  px(ctx, x + 11, y + 12, 2, 2, "#3a1a0a");
}

function drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x, y + 4, 16, 8, "#c02030");
  px(ctx, x, y + 4, 16, 2, "#ffd400");
  px(ctx, x, y + 10, 16, 2, "#ffd400");
  px(ctx, x, y + 4, 2, 8, "#800810");
  px(ctx, x + 14, y + 4, 2, 8, "#800810");
}

function drawBrick(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x, y, 16, 16, "#c04020");
  px(ctx, x, y, 16, 2, "#e06040");
  px(ctx, x, y + 7, 16, 1, "#802010");
  px(ctx, x + 7, y, 1, 7, "#802010");
  px(ctx, x + 3, y + 8, 1, 8, "#802010");
  px(ctx, x + 11, y + 8, 1, 8, "#802010");
}

function drawQuestion(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const t = performance.now() / 300;
  const flicker = (Math.floor(t) % 2 === 0) ? "#ffd400" : "#ffe860";
  px(ctx, x, y, 16, 16, flicker);
  px(ctx, x, y, 16, 2, "#fff28a");
  px(ctx, x, y + 14, 16, 2, "#c09000");
  px(ctx, x + 6, y + 3, 4, 2, "#402000");
  px(ctx, x + 5, y + 5, 1, 2, "#402000");
  px(ctx, x + 10, y + 5, 1, 2, "#402000");
  px(ctx, x + 8, y + 7, 2, 2, "#402000");
  px(ctx, x + 7, y + 9, 2, 2, "#402000");
  px(ctx, x + 7, y + 12, 2, 2, "#402000");
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x, y, 8, 8, "#ffd400");
  px(ctx, x + 1, y + 1, 6, 6, "#c02030");
  px(ctx, x + 3, y + 2, 2, 4, "#ffd400");
}

// Imperial (cerveza) - lata amarilla con banda roja
function drawImperial(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const t = performance.now() / 200;
  const yo = Math.sin(t) * 1;
  px(ctx, x + 2, y + 1 + yo, 10, 12, "#ffd400");
  px(ctx, x + 2, y + 1 + yo, 10, 2, "#e0a020");
  px(ctx, x + 2, y + 5 + yo, 10, 3, "#c02030");
  px(ctx, x + 2, y + 11 + yo, 10, 2, "#e0a020");
  ctx.fillStyle = "#000";
  ctx.font = "bold 3px monospace";
  ctx.fillText("IMP", x + 3, y + 6 + yo);
  px(ctx, x + 5, y + 0 + yo, 4, 1, "#404040");
}

// Botines dorados
function drawBotines(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const t = performance.now() / 200;
  const yo = Math.sin(t) * 1;
  // Zapato
  px(ctx, x + 1, y + 6 + yo, 12, 6, "#ffd400");
  px(ctx, x + 1, y + 6 + yo, 12, 1, "#fff28a");
  px(ctx, x + 1, y + 11 + yo, 12, 1, "#a07000");
  // Taco
  px(ctx, x + 2, y + 12 + yo, 2, 1, "#000");
  px(ctx, x + 7, y + 12 + yo, 2, 1, "#000");
  px(ctx, x + 11, y + 12 + yo, 2, 1, "#000");
  // Cordones
  px(ctx, x + 4, y + 7 + yo, 6, 1, "#c02030");
  px(ctx, x + 4, y + 9 + yo, 6, 1, "#c02030");
}

// Camiseta rojiamarilla
function drawCamiseta(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const t = performance.now() / 200;
  const yo = Math.sin(t) * 1;
  // Cuerpo
  px(ctx, x + 3, y + 4 + yo, 8, 9, "#c02030");
  px(ctx, x + 3, y + 6 + yo, 8, 1, "#ffd400");
  px(ctx, x + 3, y + 9 + yo, 8, 1, "#ffd400");
  // Mangas
  px(ctx, x + 1, y + 4 + yo, 2, 4, "#c02030");
  px(ctx, x + 11, y + 4 + yo, 2, 4, "#c02030");
  // Cuello
  px(ctx, x + 5, y + 3 + yo, 4, 1, "#c02030");
  px(ctx, x + 6, y + 4 + yo, 2, 1, "#ffd400");
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  const h = 4 * 16;
  px(ctx, x, groundY, 40, h, "#3a1010");
  px(ctx, x, groundY, 40, 6, "#c02030");
  px(ctx, x, groundY + 4, 40, 2, "#ffd400");
  px(ctx, x + 12, groundY + 20, 16, 44, "#f8e8b0");
  px(ctx, x + 10, groundY + 18, 20, 4, "#c02030");
  ctx.fillStyle = "#ffd400";
  ctx.font = "bold 6px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("ROSABAL", x + 2, groundY + 8);
  ctx.fillText("CORDERO", x + 2, groundY + 14);
  px(ctx, x + 18, groundY - 10, 2, 12, "#8a8a8a");
  px(ctx, x + 20, groundY - 10, 10, 6, "#c02030");
  px(ctx, x + 20, groundY - 6, 10, 4, "#ffd400");
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.arc(x + 8, y - 2, 6, 0, Math.PI * 2);
  ctx.arc(x + 14, y + 1, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountain(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 40, y + 40);
  ctx.lineTo(x, y - 10);
  ctx.lineTo(x + 40, y + 40);
  ctx.closePath();
  ctx.fill();
}

// Tribuna del Rosabal en parallax
function drawTribune(ctx: CanvasRenderingContext2D, W: number, H: number, camX: number) {
  const baseY = H - 90;
  const shift = -Math.floor(camX * 0.4);
  ctx.save();
  ctx.translate(shift % 120, 0);
  const tiles = Math.ceil(W / 120) + 2;
  for (let i = 0; i < tiles; i++) {
    const x = i * 120;
    // Escalones de tribuna
    px(ctx, x, baseY, 120, 4, "rgba(150,20,40,0.55)");
    px(ctx, x, baseY + 4, 120, 4, "rgba(200,180,40,0.5)");
    px(ctx, x, baseY + 8, 120, 4, "rgba(150,20,40,0.55)");
    px(ctx, x, baseY + 12, 120, 4, "rgba(200,180,40,0.5)");
    // Aficionados como puntitos
    for (let k = 0; k < 30; k++) {
      const dx = x + (k * 4);
      const dy = baseY - 3 + (k % 4);
      ctx.fillStyle = (k % 3 === 0) ? "rgba(255,220,60,0.85)" : "rgba(200,30,50,0.85)";
      ctx.fillRect(dx, dy, 2, 2);
    }
    // Bandera CSH en la punta
    if (i % 2 === 0) {
      px(ctx, x + 10, baseY - 18, 1, 18, "rgba(80,80,80,0.7)");
      px(ctx, x + 11, baseY - 18, 10, 4, "rgba(200,30,50,0.85)");
      px(ctx, x + 11, baseY - 14, 10, 3, "rgba(255,220,60,0.9)");
    }
  }
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#c02030";
  ctx.fillRect(x, y + 1, 2, 4);
  ctx.fillRect(x + 2, y, 2, 5);
  ctx.fillRect(x + 4, y + 1, 2, 4);
  ctx.fillRect(x + 1, y + 5, 4, 1);
  ctx.fillRect(x + 2, y + 6, 2, 1);
  ctx.fillStyle = "#ff6070";
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + 2, y + 1, 1, 1);
}

// Jafey con más animación
function drawJafey(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, facing: number, anim: number,
  invuln: boolean, imperial: boolean, shield: boolean,
  onGround: boolean, vy: number,
) {
  if (invuln && Math.floor(anim * 4) % 2 === 0 && !imperial) return;
  const fx = facing < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(x + 6, y);
  ctx.scale(fx, 1);
  ctx.translate(-6, 0);

  // Aura Imperial
  if (imperial) {
    const t = performance.now() / 100;
    ctx.fillStyle = `rgba(255,220,60,${0.35 + Math.sin(t) * 0.15})`;
    ctx.beginPath();
    ctx.arc(6, 8, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Baston (oculto al saltar)
  if (onGround) {
    px(ctx, 11, 8, 1, 8, "#7a4a1a");
    px(ctx, 12, 7, 2, 1, "#a06a20");
  } else {
    px(ctx, 11, 6, 1, 6, "#7a4a1a");
  }

  // Sombrero
  const hatCol = shield ? "#c02030" : "#c02030";
  px(ctx, 2, 0, 10, 2, hatCol);
  px(ctx, 1, 2, 12, 2, hatCol);
  px(ctx, 1, 4, 12, 1, "#ffd400");
  px(ctx, 8, 1, 3, 1, "#ffd400");

  // Cara
  px(ctx, 3, 5, 8, 4, "#f2c69a");

  // Bigote blanco
  px(ctx, 3, 8, 8, 1, "#e8e8e8");

  // Ojos - guiño si Imperial activo
  if (imperial && Math.floor(anim * 6) % 4 === 0) {
    px(ctx, 5, 6, 1, 1, "#101010");
    px(ctx, 8, 6, 3, 1, "#101010"); // guiño
  } else {
    px(ctx, 5, 6, 1, 1, "#101010");
    px(ctx, 9, 6, 1, 1, "#101010");
  }

  // Camisa (rojiamarilla o azul si tiene shield)
  const shirtBase = shield ? "#c02030" : "#c02030";
  const shirtStripe = shield ? "#ffd400" : "#ffd400";
  px(ctx, 3, 9, 8, 4, shirtBase);
  px(ctx, 3, 10, 8, 1, shirtStripe);
  px(ctx, 3, 12, 8, 1, shirtStripe);
  // Escudito CSH en el pecho si tiene shield
  if (shield) {
    px(ctx, 6, 10, 2, 2, "#ffd400");
    px(ctx, 7, 11, 1, 1, "#c02030");
  }

  // Pantalones + piernas animadas
  if (!onGround) {
    // En el aire - piernas recogidas
    px(ctx, 3, 13, 3, 2, "#203050");
    px(ctx, 8, 13, 3, 2, "#203050");
    // Zapatos
    px(ctx, 3, 15, 4, 1, "#101010");
    px(ctx, 8, 15, 4, 1, "#101010");
    // Cara de esfuerzo si va subiendo
    if (vy < 0) {
      px(ctx, 5, 7, 5, 1, "#402000");
    }
  } else {
    const step = Math.floor(anim) % 2;
    px(ctx, 3, 13, 3, 3, "#203050");
    px(ctx, 8, 13, 3, 3, "#203050");
    if (step === 0) {
      px(ctx, 2, 15, 4, 1, "#101010");
      px(ctx, 9, 15, 3, 1, "#101010");
    } else {
      px(ctx, 3, 15, 3, 1, "#101010");
      px(ctx, 8, 15, 4, 1, "#101010");
    }
  }

  ctx.restore();
}

function drawSaprisista(ctx: CanvasRenderingContext2D, x: number, y: number, anim: number) {
  const step = Math.floor(anim) % 2;
  px(ctx, x + 1, y + 2, 12, 10, "#5a1a80");
  px(ctx, x + 1, y + 6, 12, 2, "#ffffff");
  px(ctx, x + 3, y, 8, 4, "#f2c69a");
  px(ctx, x + 4, y + 1, 1, 1, "#101010");
  px(ctx, x + 9, y + 1, 1, 1, "#101010");
  px(ctx, x + 3, y, 8, 1, "#2a0a3a");
  px(ctx, x + 5, y + 2, 4, 1, "#402000");
  // Piernas animadas
  if (step === 0) {
    px(ctx, x + 2, y + 12, 4, 2, "#101010");
    px(ctx, x + 9, y + 12, 3, 2, "#101010");
  } else {
    px(ctx, x + 3, y + 12, 3, 2, "#101010");
    px(ctx, x + 8, y + 12, 4, 2, "#101010");
  }
}

function drawLiguista(ctx: CanvasRenderingContext2D, x: number, y: number, onGround: boolean) {
  px(ctx, x + 1, y + 2, 12, 10, "#801020");
  px(ctx, x + 1, y + 4, 12, 2, "#101010");
  px(ctx, x + 1, y + 8, 12, 2, "#101010");
  px(ctx, x + 3, y, 8, 4, "#f2c69a");
  px(ctx, x + 4, y + 1, 1, 1, "#101010");
  px(ctx, x + 9, y + 1, 1, 1, "#101010");
  px(ctx, x + 3, y, 8, 1, "#3a0000");
  px(ctx, x + 5, y + 2, 4, 1, "#402000");
  // En el aire, piernas recogidas
  if (!onGround) {
    px(ctx, x + 3, y + 12, 3, 2, "#101010");
    px(ctx, x + 8, y + 12, 3, 2, "#101010");
  } else {
    px(ctx, x + 2, y + 12, 4, 2, "#101010");
    px(ctx, x + 8, y + 12, 4, 2, "#101010");
  }
}
