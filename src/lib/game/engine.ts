import { LEVELS, TILE, type LevelDef } from "./levels";

const GRAVITY = 600;
const MOVE_SPEED = 110;
const JUMP_VEL = 260;
const MAX_FALL = 480;
const ENEMY_SPEED = 40;

export type Input = { left: boolean; right: boolean; jump: boolean };

type Rect = { x: number; y: number; w: number; h: number };

type Enemy = {
  type: "walker" | "jumper";
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; alive: boolean; onGround: boolean;
  jumpCooldown: number;
};

type Coin = { x: number; y: number; taken: boolean; anim: number };
type Block = { col: number; row: number; kind: "brick" | "question"; used: boolean };

export type GameResult = {
  finished: boolean;      // llego a la meta
  died: boolean;
  score: number;
  timeMs: number;
};

export type EngineOptions = {
  onResult?: (r: GameResult) => void;
};

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
  player = { x: 0, y: 0, vx: 0, vy: 0, w: 12, h: 16, onGround: false, facing: 1, invuln: 0, anim: 0 };
  enemies: Enemy[] = [];
  coins: Coin[] = [];
  blocks: Block[] = [];
  goalX = 0;
  cameraX = 0;
  score = 0;
  timeLeft = 0;
  elapsed = 0;
  running = false;
  state: "playing" | "won" | "died" | "timeout" = "playing";
  input: Input = { left: false, right: false, jump: false };
  prevJump = false;
  lastFrame = 0;
  raf = 0;
  onResult?: (r: GameResult) => void;

  constructor(canvas: HTMLCanvasElement, levelIndex: number, opts: EngineOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.levelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    this.tiles = this.level.tiles;
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
            this.enemies.push({ type: "walker", x: px, y: py, vx: -ENEMY_SPEED, vy: 0, w: 14, h: 14, alive: true, onGround: false, jumpCooldown: 0 });
            break;
          case "L":
            this.enemies.push({ type: "jumper", x: px, y: py, vx: 0, vy: 0, w: 14, h: 14, alive: true, onGround: false, jumpCooldown: 1 });
            break;
          case "C":
            this.coins.push({ x: px + 4, y: py + 4, taken: false, anim: Math.random() * Math.PI * 2 });
            break;
          case "B":
            this.blocks.push({ col: c, row: r, kind: "brick", used: false });
            break;
          case "?":
            this.blocks.push({ col: c, row: r, kind: "question", used: false });
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
    this.updateCamera();
  }

  updatePlayer(dt: number) {
    const p = this.player;
    // Horizontal
    let ax = 0;
    if (this.input.left) ax -= 1;
    if (this.input.right) ax += 1;
    p.vx = ax * MOVE_SPEED;
    if (ax !== 0) p.facing = ax;

    // Jump edge trigger
    const jumpPressed = this.input.jump && !this.prevJump;
    this.prevJump = this.input.jump;
    if (jumpPressed && p.onGround) {
      p.vy = -JUMP_VEL;
      p.onGround = false;
    }

    // Gravity
    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

    // Move X
    p.x += p.vx * dt;
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > this.width) p.x = this.width - p.w;
    if (this.rectSolidCollides(p)) {
      // Push back
      const stepX = p.vx > 0 ? -1 : 1;
      while (this.rectSolidCollides(p)) p.x += stepX;
      p.vx = 0;
    }

    // Move Y
    p.y += p.vy * dt;
    if (this.rectSolidCollides(p)) {
      const stepY = p.vy > 0 ? -1 : 1;
      // Si iba subiendo y golpeo un bloque interactivo, disparalo
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

    // Muerte por caida al vacio
    if (p.y > this.height + 40) {
      this.finish("died");
      return;
    }

    // Anim
    if (Math.abs(p.vx) > 5) p.anim += dt * 10;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

    // Coin pickup
    for (const coin of this.coins) {
      if (coin.taken) continue;
      if (rectOverlaps(p, { x: coin.x, y: coin.y, w: 8, h: 8 })) {
        coin.taken = true;
        this.score += 5;
      }
    }

    // Meta
    if (p.x + p.w >= this.goalX) {
      this.score += Math.floor(this.timeLeft) * 2;
      this.finish("won");
    }
  }

  hitBlockFromBelow(col: number, row: number) {
    const b = this.blocks.find((bl) => bl.col === col && bl.row === row && !bl.used);
    if (!b) return;
    b.used = true;
    if (b.kind === "question") {
      this.score += 10;
      this.setTile(col, row, "#"); // queda solido usado
    } else if (b.kind === "brick") {
      this.score += 5;
      this.setTile(col, row, "."); // desaparece
    }
  }

  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // Gravedad
      e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);

      if (e.type === "walker") {
        // Camina, invierte al golpear pared o borde
        e.x += e.vx * dt;
        if (this.rectSolidCollides(e)) {
          e.x -= e.vx * dt;
          e.vx = -e.vx;
        }
        // Check borde: si no hay piso adelante, invertir
        const footY = e.y + e.h + 1;
        const aheadX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        if (!this.solidAt(aheadX, footY) && e.onGround) e.vx = -e.vx;
      } else if (e.type === "jumper") {
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

      // Movimiento vertical
      e.y += e.vy * dt;
      if (this.rectSolidCollides(e)) {
        const stepY = e.vy > 0 ? -1 : 1;
        while (this.rectSolidCollides(e)) e.y += stepY;
        if (e.vy > 0) e.onGround = true;
        e.vy = 0;
      } else {
        e.onGround = false;
      }

      // Colision con jugador
      if (rectOverlaps(this.player, e)) {
        // Si el jugador cae encima, lo aplasta
        if (this.player.vy > 40 && this.player.y + this.player.h - 6 < e.y) {
          e.alive = false;
          this.player.vy = -180;
          this.score += 15;
        } else if (this.player.invuln <= 0) {
          this.hurtPlayer();
        }
      }

      if (e.y > this.height + 40) e.alive = false;
    }
  }

  updateCoins(dt: number) {
    for (const c of this.coins) c.anim += dt * 4;
  }

  hurtPlayer() {
    this.player.invuln = 1.2;
    this.score = Math.max(0, this.score - 20);
    this.player.vy = -180;
    this.player.vx = -this.player.facing * 60;
    // Si el jugador se queda sin puntos y le vuelven a pegar rapido puede morir
    // por caida - suficiente para la parodia.
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
    this.onResult?.({
      finished: reason === "won",
      died: reason !== "won",
      score: this.score,
      timeMs: Math.round(this.elapsed * 1000),
    });
  }

  // -------------------------- RENDER --------------------------
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fondo con gradiente rojiamarillo herediano
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, this.level.bgTop);
    grad.addColorStop(1, this.level.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Sol grande (parodia de sol de mediodia herediano)
    ctx.fillStyle = "rgba(255,220,90,0.85)";
    ctx.beginPath();
    ctx.arc(W - 40 - this.cameraX * 0.1, 40, 22, 0, Math.PI * 2);
    ctx.fill();

    // Nubes con parallax
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 90 - this.cameraX * 0.3) % (W + 100) + W + 100) % (W + 100) - 50;
      const cy = 24 + (i % 2) * 14;
      drawCloud(ctx, cx, cy);
    }

    // Cerros distantes (parallax medio) - homenaje al Barva
    ctx.fillStyle = "rgba(60,20,30,0.6)";
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 90 - this.cameraX * 0.5) % (W + 180) + W + 180) % (W + 180) - 90;
      const hy = H - 70;
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

    // Meta - puerta del estadio
    drawGoal(ctx, this.goalX, (this.rows - 4) * TILE);

    // Bloques interactivos (question / brick sin romper)
    for (const b of this.blocks) {
      if (b.used) continue;
      if (b.kind === "question") drawQuestion(ctx, b.col * TILE, b.row * TILE);
      else drawBrick(ctx, b.col * TILE, b.row * TILE);
    }

    // Monedas (escuditos)
    for (const coin of this.coins) {
      if (coin.taken) continue;
      drawCoin(ctx, coin.x, coin.y + Math.sin(coin.anim) * 1.5);
    }

    // Enemigos
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.type === "walker") drawSaprisista(ctx, e.x, e.y);
      else drawLiguista(ctx, e.x, e.y);
    }

    // Jugador
    drawJafey(ctx, this.player.x, this.player.y, this.player.facing, this.player.anim, this.player.invuln > 0);

    ctx.restore();

    // HUD
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
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, 18);
    ctx.fillStyle = "#FFD400";
    ctx.font = "bold 10px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(`JAFEY  ${this.score.toString().padStart(4, "0")} pts`, 4, 4);
    const t = Math.max(0, this.timeLeft).toFixed(0);
    ctx.fillText(`⏱ ${t}s`, W - 60, 4);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px monospace";
    ctx.fillText(this.level.name.toUpperCase(), W / 2 - 22, 4);
  }
}

function rectOverlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- helpers de dibujo (pixel art crudo) ----------

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
  // Plataforma con banderin CSH (rojo/amarillo)
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
  px(ctx, x, y, 16, 16, "#ffd400");
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
  // Escudo CSH miniatura
  px(ctx, x, y, 8, 8, "#ffd400");
  px(ctx, x + 1, y + 1, 6, 6, "#c02030");
  px(ctx, x + 3, y + 2, 2, 4, "#ffd400");
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  // Puerta del estadio "ROSABAL"
  const h = 4 * 16;
  px(ctx, x, groundY, 40, h, "#3a1010");
  px(ctx, x, groundY, 40, 6, "#c02030");
  px(ctx, x, groundY + 4, 40, 2, "#ffd400");
  // Arco
  px(ctx, x + 12, groundY + 20, 16, 44, "#f8e8b0");
  px(ctx, x + 10, groundY + 18, 20, 4, "#c02030");
  // Letra parodia
  ctx.fillStyle = "#ffd400";
  ctx.font = "bold 6px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("ROSABAL", x + 2, groundY + 8);
  ctx.fillText("CORDERO", x + 2, groundY + 14);
  // Banderin
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

// Jafey: viejillo herediano con sombrero rojo-amarillo, bigote blanco y baston.
function drawJafey(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, anim: number, blink: boolean) {
  if (blink && Math.floor(anim * 4) % 2 === 0) return;
  const fx = facing < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(x + 6, y);
  ctx.scale(fx, 1);
  ctx.translate(-6, 0);
  // Baston
  px(ctx, 11, 8, 1, 8, "#7a4a1a");
  px(ctx, 12, 7, 2, 1, "#a06a20");
  // Sombrero (gorra) rojiamarilla
  px(ctx, 2, 0, 10, 2, "#c02030");
  px(ctx, 1, 2, 12, 2, "#c02030");
  px(ctx, 1, 4, 12, 1, "#ffd400");
  px(ctx, 8, 1, 3, 1, "#ffd400");
  // Cara
  px(ctx, 3, 5, 8, 4, "#f2c69a");
  // Bigote blanco
  px(ctx, 3, 8, 8, 1, "#e8e8e8");
  // Ojos
  px(ctx, 5, 6, 1, 1, "#101010");
  px(ctx, 9, 6, 1, 1, "#101010");
  // Cuerpo camisa rojiamarilla a rayas
  px(ctx, 3, 9, 8, 4, "#c02030");
  px(ctx, 3, 10, 8, 1, "#ffd400");
  px(ctx, 3, 12, 8, 1, "#ffd400");
  // Pantalones
  const step = Math.floor(anim) % 2;
  px(ctx, 3, 13, 3, 3, "#203050");
  px(ctx, 8, 13, 3, 3, "#203050");
  // Zapatos animados
  if (step === 0) {
    px(ctx, 2, 15, 4, 1, "#101010");
    px(ctx, 9, 15, 3, 1, "#101010");
  } else {
    px(ctx, 3, 15, 3, 1, "#101010");
    px(ctx, 8, 15, 4, 1, "#101010");
  }
  ctx.restore();
}

// Aficionado rival - "saprisista" (morado/blanco).
function drawSaprisista(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x + 1, y + 2, 12, 10, "#5a1a80");
  px(ctx, x + 1, y + 6, 12, 2, "#ffffff");
  // Cabeza
  px(ctx, x + 3, y, 8, 4, "#f2c69a");
  px(ctx, x + 4, y + 1, 1, 1, "#101010");
  px(ctx, x + 9, y + 1, 1, 1, "#101010");
  // Cenizas / cabello
  px(ctx, x + 3, y, 8, 1, "#2a0a3a");
  // Boca gruñona
  px(ctx, x + 5, y + 2, 4, 1, "#402000");
  // Piernas
  px(ctx, x + 2, y + 12, 4, 2, "#101010");
  px(ctx, x + 8, y + 12, 4, 2, "#101010");
}

// Aficionado rival - "liguista" (rojo/negro) saltarin.
function drawLiguista(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x + 1, y + 2, 12, 10, "#801020");
  px(ctx, x + 1, y + 4, 12, 2, "#101010");
  px(ctx, x + 1, y + 8, 12, 2, "#101010");
  // Cabeza
  px(ctx, x + 3, y, 8, 4, "#f2c69a");
  px(ctx, x + 4, y + 1, 1, 1, "#101010");
  px(ctx, x + 9, y + 1, 1, 1, "#101010");
  px(ctx, x + 3, y, 8, 1, "#3a0000");
  px(ctx, x + 5, y + 2, 4, 1, "#402000");
  // Piernas
  px(ctx, x + 2, y + 12, 4, 2, "#101010");
  px(ctx, x + 8, y + 12, 4, 2, "#101010");
}
