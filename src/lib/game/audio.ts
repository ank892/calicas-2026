// Sistema de audio simple para el minijuego de Jafey.
// Todo se genera en tiempo real con Web Audio (sin assets externos).
// Musica chiptune loop + efectos de sonido cortos.

type SfxName = "jump" | "stomp" | "coin" | "power" | "hurt" | "goal" | "gameover" | "life";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let enabled = true;
let musicOn = true;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    type WithWebkit = { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as unknown as WithWebkit).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.35;
    sfxGain.connect(masterGain);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function resumeAudio() {
  const c = ensureCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function setAudioEnabled(v: boolean) {
  enabled = v;
  if (!v) stopMusic();
}

export function setMusicOn(v: boolean) {
  musicOn = v;
  if (!v) stopMusic();
}

export function isAudioEnabled() { return enabled; }
export function isMusicOn() { return musicOn; }

// ---------- Melodia estilo mejenga: 8 compases sencillos ----------
// Notas en Hz. Escala pentatónica menor de A para que suene "chiptune-ico".
const N = {
  A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440,
  C5: 523.3, D5: 587.3, E5: 659.3, G5: 783.9, A5: 880,
};

// Cada elemento = [freq, longitud (steps de 1/8)]
const MELODY: [number, number][] = [
  [N.A4, 1], [N.E5, 1], [N.G5, 1], [N.A5, 1],
  [N.G5, 1], [N.E5, 1], [N.D5, 1], [N.A4, 1],
  [N.C5, 1], [N.D5, 1], [N.E5, 1], [N.G5, 1],
  [N.E5, 1], [N.D5, 1], [N.C5, 1], [N.A4, 1],
  [N.A4, 1], [N.C5, 1], [N.E5, 2],
  [N.G5, 1], [N.E5, 1], [N.D5, 2],
  [N.A4, 2], [N.C5, 2],
  [N.D5, 1], [N.C5, 1], [N.A4, 2],
];

const BASS: [number, number][] = [
  [N.A3, 4], [N.G4, 4], [N.C4, 4], [N.A3, 4],
  [N.A3, 4], [N.D4, 4], [N.G4, 4], [N.A3, 4],
];

function playNote(freq: number, dur: number, type: OscillatorType, gainNode: GainNode, volume: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(volume, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g);
  g.connect(gainNode);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

const STEP_MS = 180; // tempo

export function startMusic() {
  if (!enabled || !musicOn) return;
  const c = ensureCtx();
  if (!c || !musicGain) return;
  if (musicTimer !== null) return;
  musicStep = 0;
  const totalSteps = MELODY.reduce((s, n) => s + n[1], 0);
  let melPos = 0, melIdx = 0;
  const bassSteps = BASS.reduce((s, n) => s + n[1], 0);
  let bassPos = 0, bassIdx = 0;

  const tick = () => {
    if (!enabled || !musicOn) { stopMusic(); return; }
    if (!ctx || !musicGain) return;
    // Melody
    if (melPos === 0) {
      const [f, len] = MELODY[melIdx];
      playNote(f, (len * STEP_MS) / 1000 * 0.9, "square", musicGain, 0.35);
      melPos = len;
    }
    melPos -= 1;
    if (melPos <= 0) {
      melIdx = (melIdx + 1) % MELODY.length;
      melPos = 0;
    }
    // Bass
    if (bassPos === 0) {
      const [f, len] = BASS[bassIdx];
      playNote(f, (len * STEP_MS) / 1000 * 0.95, "triangle", musicGain, 0.6);
      bassPos = len;
    }
    bassPos -= 1;
    if (bassPos <= 0) {
      bassIdx = (bassIdx + 1) % BASS.length;
      bassPos = 0;
    }
    musicStep = (musicStep + 1) % (totalSteps * bassSteps);
  };

  tick();
  musicTimer = window.setInterval(tick, STEP_MS);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

// ---------- Efectos ----------
export function sfx(name: SfxName) {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  const now = c.currentTime;

  const beep = (freq: number, endFreq: number, dur: number, type: OscillatorType = "square", vol = 0.5) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(sfxGain!);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  };

  const noise = (dur: number, vol = 0.3) => {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(sfxGain!);
    src.start(now);
  };

  switch (name) {
    case "jump":
      beep(320, 620, 0.14, "square", 0.4);
      break;
    case "stomp":
      beep(200, 60, 0.12, "sawtooth", 0.5);
      noise(0.08, 0.15);
      break;
    case "coin":
      beep(880, 1200, 0.05, "square", 0.35);
      setTimeout(() => beep(1400, 1600, 0.08, "square", 0.35), 60);
      break;
    case "power":
      beep(400, 600, 0.08, "square", 0.4);
      setTimeout(() => beep(600, 800, 0.08, "square", 0.4), 90);
      setTimeout(() => beep(800, 1200, 0.12, "square", 0.4), 180);
      break;
    case "hurt":
      beep(240, 120, 0.25, "sawtooth", 0.45);
      noise(0.15, 0.2);
      break;
    case "goal":
      beep(523, 523, 0.12, "square", 0.4);
      setTimeout(() => beep(659, 659, 0.12, "square", 0.4), 130);
      setTimeout(() => beep(784, 784, 0.12, "square", 0.4), 260);
      setTimeout(() => beep(1046, 1046, 0.25, "square", 0.4), 390);
      break;
    case "gameover":
      beep(400, 200, 0.2, "sawtooth", 0.4);
      setTimeout(() => beep(300, 150, 0.2, "sawtooth", 0.4), 200);
      setTimeout(() => beep(200, 80, 0.4, "sawtooth", 0.4), 400);
      break;
    case "life":
      beep(660, 660, 0.08, "square", 0.35);
      setTimeout(() => beep(880, 880, 0.08, "square", 0.35), 80);
      setTimeout(() => beep(1174, 1174, 0.18, "square", 0.35), 160);
      break;
  }
}
