"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameEngine, type Input as GameInput, type GameResult } from "@/lib/game/engine";
import { LEVELS } from "@/lib/game/levels";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import {
  resumeAudio, setAudioEnabled, setMusicOn, isAudioEnabled, isMusicOn,
  startMusic, stopMusic, sfx,
} from "@/lib/game/audio";
import { ACHIEVEMENTS, loadUnlocked, unlock } from "@/lib/game/achievements";

type Screen = "menu" | "playing" | "result";

type BestRow = { level: number; score: number; time_ms: number; completed: boolean };

export function JafeyGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const inputRef = useRef<GameInput>({ left: false, right: false, jump: false });

  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [bestScoreByLevel, setBestScoreByLevel] = useState<Record<number, number>>({});
  const [bestTimeByLevel, setBestTimeByLevel] = useState<Record<number, number>>({});
  const [completedLevels, setCompletedLevels] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [audio, setAudio] = useState(true);
  const [music, setMusic] = useState(true);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([]);

  const user = useMemo(() => getLocalUser(), []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAudio(isAudioEnabled());
      setMusic(isMusicOn());
      if (user) setUnlocked(loadUnlocked(user.id));
    }
  }, [user]);

  const loadBest = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ed26_calicas_game_scores")
      .select("level, score, time_ms, completed")
      .eq("user_id", user.id);
    const bestScore: Record<number, number> = {};
    const bestTime: Record<number, number> = {};
    const done = new Set<number>();
    for (const r of (data ?? []) as BestRow[]) {
      bestScore[r.level] = Math.max(bestScore[r.level] ?? 0, r.score);
      if (r.completed) {
        done.add(r.level);
        bestTime[r.level] = bestTime[r.level] === undefined
          ? r.time_ms
          : Math.min(bestTime[r.level], r.time_ms);
      }
    }
    setBestScoreByLevel(bestScore);
    setBestTimeByLevel(bestTime);
    setCompletedLevels(done);
  }, [user]);

  useEffect(() => { loadBest(); }, [loadBest]);

  const startLevel = (idx: number) => {
    resumeAudio();
    setResult(null);
    setNewlyUnlocked([]);
    setLevelIndex(idx);
    setScreen("playing");
    if (user) unlock(user.id, ["first_run"]);
  };

  const persistResult = useCallback(async (r: GameResult, idx: number) => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("ed26_calicas_game_scores").insert({
        user_id: user.id,
        level: idx + 1,
        score: r.score,
        time_ms: r.timeMs,
        completed: r.finished,
      });
      await loadBest();
    } finally {
      setSaving(false);
    }
  }, [user, loadBest]);

  const checkAchievements = useCallback((r: GameResult, idx: number) => {
    if (!user) return;
    const ids: string[] = [];
    if (r.finished) ids.push("first_win");
    if (r.enemiesStomped >= 10) ids.push("stomp_10");
    if (r.coinsCollected >= 20) ids.push("coins_20");
    if (r.finished && r.noHit) ids.push("no_hit");
    if (r.powerupsUsed > 0) {
      // No podemos saber cual, así que si usó cualquier power-up damos los 3.
      // Simplificación aceptable en el flujo.
      ids.push("imperial", "botines", "camiseta");
    }
    const lv = LEVELS[idx];
    if (r.finished && r.timeMs / 1000 <= lv.targetTime) {
      if (idx === 0) ids.push("speedrun_1");
      if (idx === 2) ids.push("speedrun_3");
    }
    // clear_all se decide con estado post-guardado
    const gained = unlock(user.id, ids);
    setUnlocked(loadUnlocked(user.id));
    setNewlyUnlocked(gained);
  }, [user]);

  // Motor
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    resumeAudio();
    if (audio && music) startMusic();

    const engine = new GameEngine(canvas, levelIndex, {
      onResult: (r) => {
        stopMusic();
        setResult(r);
        setScreen("result");
        persistResult(r, levelIndex);
        checkAchievements(r, levelIndex);
      },
    });
    engineRef.current = engine;
    engine.start();
    const tickInput = () => engine.setInput(inputRef.current);
    const inputInterval = setInterval(tickInput, 16);

    const kd = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") inputRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d") inputRef.current.right = true;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " " || e.key === "z") inputRef.current.jump = true;
      if (["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") inputRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") inputRef.current.right = false;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " " || e.key === "z") inputRef.current.jump = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    return () => {
      engine.stop();
      stopMusic();
      clearInterval(inputInterval);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // audio/music toggles hot-swap se manejan aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, levelIndex, persistResult, checkAchievements]);

  // Hot-swap de audio/musica sin reiniciar el juego
  useEffect(() => {
    setAudioEnabled(audio);
    setMusicOn(music);
    if (screen === "playing" && audio && music) startMusic();
    else stopMusic();
  }, [audio, music, screen]);

  // Salvavidas global para inputs
  useEffect(() => {
    if (screen !== "playing") return;
    const onGlobalUp = () => clearAll();
    const onBlur = () => clearAll();
    const onVis = () => { if (document.hidden) clearAll(); };
    window.addEventListener("pointerup", onGlobalUp);
    window.addEventListener("pointercancel", onGlobalUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerup", onGlobalUp);
      window.removeEventListener("pointercancel", onGlobalUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [screen]);

  const clearAll = () => {
    inputRef.current.left = false;
    inputRef.current.right = false;
    inputRef.current.jump = false;
  };

  // ============ JOYSTICK VIRTUAL ============
  // El pulgar arrastra un puntito dentro de un circulo. Zona muerta pequeña
  // y umbral suave para direcciones.
  const joyRef = useRef<HTMLDivElement | null>(null);
  const [joyThumb, setJoyThumb] = useState<{ x: number; y: number } | null>(null);
  const joyActive = useRef(false);
  const joyPid = useRef<number | null>(null);
  const JOY_RADIUS = 44;         // radio zona pulsable (px)
  const JOY_DEAD = 8;

  const onJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    joyActive.current = true;
    joyPid.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    updateJoy(e.clientX, e.clientY);
  };
  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyActive.current || joyPid.current !== e.pointerId) return;
    e.preventDefault();
    updateJoy(e.clientX, e.clientY);
  };
  const onJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPid.current !== e.pointerId) return;
    joyActive.current = false;
    joyPid.current = null;
    setJoyThumb(null);
    inputRef.current.left = false;
    inputRef.current.right = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
  };

  const updateJoy = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    setJoyThumb({ x: dx, y: dy });
    // Direcciones
    if (dx < -JOY_DEAD) { inputRef.current.left = true; inputRef.current.right = false; }
    else if (dx > JOY_DEAD) { inputRef.current.right = true; inputRef.current.left = false; }
    else { inputRef.current.left = false; inputRef.current.right = false; }
  };

  // Boton de saltar (pointer events + captura)
  const jumpPid = useRef<number | null>(null);
  const onJumpDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    jumpPid.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    inputRef.current.jump = true;
  };
  const onJumpUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (jumpPid.current !== e.pointerId) return;
    e.preventDefault();
    inputRef.current.jump = false;
    jumpPid.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
  };

  // ================= RENDERING =================
  if (screen === "menu") {
    const allDone = LEVELS.every((_, i) => completedLevels.has(i + 1));
    if (allDone && user) {
      const newAchs = unlock(user.id, ["clear_all"]);
      if (newAchs.length) setUnlocked(loadUnlocked(user.id));
    }
    return (
      <div className="space-y-3 pb-6">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">MINIJUEGO</div>
              <div className="text-lg font-black leading-tight">
                <span className="text-csh-red">JAFEY</span>{" "}
                <span className="text-csh-yellow">SOJO</span>{" "}
                y el Estadio Rosabal
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setAudio((v) => { const nv = !v; sfx("coin"); return nv; })}
                className={`w-9 h-9 rounded-full text-lg ${audio ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}
                title={audio ? "Sonido: on" : "Sonido: off"}
              >{audio ? "🔊" : "🔇"}</button>
              <button
                onClick={() => setMusic((v) => !v)}
                className={`w-9 h-9 rounded-full text-lg ${music ? "bg-csh-yellow text-black" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}
                title={music ? "Musica: on" : "Musica: off"}
              >🎵</button>
            </div>
          </div>
          <div className="text-[12px] text-[var(--muted)] mt-2 leading-relaxed">
            Don Jafey se propuso inaugurar el <b className="text-csh-yellow">Estadio Rosabal Cordero</b>.
            Recogé <b className="text-csh-yellow">escuditos</b> (cada 20 = 1 vida), destapá <b>bloques ?</b>{" "}
            y agarrá <b>Imperial 🍺</b> (invencibilidad), <b>botines 👟</b> (doble salto) o la{" "}
            <b>camiseta rojiamarilla 👕</b> (aguanta un golpe).
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed">
            🕹️ <b>← →</b> caminar &nbsp;·&nbsp; <b>↑ / Espacio</b> saltar &nbsp;·&nbsp; caer encima aplasta.
            <br />
            💡 En móvil: joystick a la izquierda, botón 🦘 a la derecha.
          </div>
          <div className="mt-2 text-[10px] text-csh-yellow font-bold uppercase tracking-widest">
            🟡 Los puntos quedan registrados pero por ahora no suman a la Tabla acumulada.
          </div>
        </div>

        {LEVELS.map((lv, i) => {
          const unlockedLv = i === 0 || completedLevels.has(i);
          const bestS = bestScoreByLevel[i + 1] ?? 0;
          const bestT = bestTimeByLevel[i + 1];
          const beatSpeedrun = bestT !== undefined && bestT / 1000 <= lv.targetTime;
          return (
            <button
              key={i}
              disabled={!unlockedLv}
              onClick={() => unlockedLv && startLevel(i)}
              className={`card w-full text-left p-4 flex items-center gap-3 ${unlockedLv ? "active:scale-[0.99] transition" : "opacity-60"}`}
            >
              <div className="text-3xl">{i === 0 ? "🚶" : i === 1 ? "🏟️" : "🏆"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow uppercase">
                  {lv.name} {completedLevels.has(i + 1) && "✅"}
                </div>
                <div className="font-black">{lv.subtitle}</div>
                <div className="text-[11px] text-[var(--muted)] flex flex-wrap gap-x-2">
                  {unlockedLv ? (
                    <>
                      <span>{bestS > 0 ? `🏅 ${bestS} pts` : "Nunca jugado"}</span>
                      {bestT !== undefined && (
                        <span className={beatSpeedrun ? "text-csh-yellow font-bold" : ""}>
                          ⏱ {(bestT / 1000).toFixed(1)}s
                          {beatSpeedrun && " ⚡"}
                          <span className="text-[var(--muted)]"> · meta {lv.targetTime}s</span>
                        </span>
                      )}
                    </>
                  ) : (
                    "🔒 Completá el nivel anterior"
                  )}
                </div>
              </div>
              <div className="text-sm font-black text-csh-red">▶</div>
            </button>
          );
        })}

        {/* Achievements */}
        <div className="card p-4">
          <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">MEDALLAS</div>
          <div className="text-sm font-black mb-2">
            {unlocked.size} / {ACHIEVEMENTS.length} desbloqueadas
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const got = unlocked.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`rounded-lg p-2 border ${got
                    ? "border-csh-yellow bg-csh-yellow/10"
                    : "border-[var(--border)] bg-[var(--surface-2)] opacity-60"}`}
                >
                  <div className="text-lg">{got ? a.icon : "🔒"}</div>
                  <div className="text-[11px] font-bold leading-tight">{a.name}</div>
                  <div className="text-[10px] text-[var(--muted)] leading-tight">{a.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "playing") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border-2 border-csh-red bg-black relative select-none">
          <canvas
            ref={canvasRef}
            width={320}
            height={200}
            className="w-full h-auto block"
            style={{ imageRendering: "pixelated", touchAction: "none" }}
          />
          {/* Toggle mudo en juego */}
          <button
            onClick={() => setAudio((v) => !v)}
            aria-label="Sonido"
            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-sm z-10"
            style={{ touchAction: "manipulation" }}
          >
            {audio ? "🔊" : "🔇"}
          </button>
        </div>

        {/* Controles fijos */}
        <div
          className="fixed bottom-16 left-0 right-0 z-40 flex items-end justify-between px-4 pointer-events-none"
          style={{ touchAction: "none" }}
        >
          {/* Joystick */}
          <div className="pointer-events-auto">
            <div
              ref={joyRef}
              onPointerDown={onJoyDown}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyUp}
              onPointerCancel={onJoyUp}
              onLostPointerCapture={() => { joyActive.current = false; joyPid.current = null; setJoyThumb(null); inputRef.current.left = false; inputRef.current.right = false; }}
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-28 h-28 rounded-full bg-black/40 border-2 border-csh-red shadow-2xl"
              style={{ touchAction: "none" }}
            >
              {/* Guía direcciones */}
              <div className="absolute inset-0 flex items-center justify-between px-2 text-white/40 text-xs pointer-events-none">
                <span>◀</span><span>▶</span>
              </div>
              {/* Thumb */}
              <div
                className="absolute w-10 h-10 rounded-full bg-csh-red border-2 border-white shadow-xl pointer-events-none"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${joyThumb?.x ?? 0}px), calc(-50% + ${joyThumb?.y ?? 0}px))`,
                  transition: joyThumb ? "none" : "transform 100ms ease-out",
                }}
              />
            </div>
          </div>
          {/* Boton saltar */}
          <button
            onPointerDown={onJumpDown}
            onPointerUp={onJumpUp}
            onPointerCancel={onJumpUp}
            onLostPointerCapture={() => { inputRef.current.jump = false; jumpPid.current = null; }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Saltar"
            className="pointer-events-auto w-24 h-24 rounded-full bg-csh-yellow text-black text-5xl font-black shadow-2xl border-b-4 border-yellow-700 active:scale-95 active:bg-yellow-300"
            style={{ touchAction: "none" }}
          >
            🦘
          </button>
        </div>

        <div className="text-[10px] text-[var(--muted)] text-center pt-1 pb-24">
          Tip: soltar el 🦘 antes = salto corto. Con <b>botines</b> podés saltar dos veces seguidas.
        </div>

        <button
          onClick={() => { engineRef.current?.stop(); stopMusic(); clearAll(); setScreen("menu"); }}
          className="btn-ghost w-full text-xs fixed bottom-2 left-0 right-0 max-w-sm mx-auto z-30"
        >
          ⏹ Salir al menú
        </button>
      </div>
    );
  }

  // Result screen
  const lv = LEVELS[levelIndex];
  const beatSpeedrun = result && result.finished && result.timeMs / 1000 <= lv.targetTime;
  return (
    <div className="space-y-3 pb-6">
      <div className="card p-4">
        <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">
          {result?.finished ? "¡PURA VIDA!" : "AY MAMITA"}
        </div>
        <div className="text-2xl font-black">
          {result?.finished ? "🏆 Nivel completado" : "💥 Se cayó don Jafey"}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg p-3 bg-[var(--surface-2)]">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Puntos</div>
            <div className="text-2xl font-black text-csh-yellow tabular-nums">{result?.score ?? 0}</div>
          </div>
          <div className="rounded-lg p-3 bg-[var(--surface-2)]">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Tiempo</div>
            <div className={`text-2xl font-black tabular-nums ${beatSpeedrun ? "text-csh-yellow" : ""}`}>
              {((result?.timeMs ?? 0) / 1000).toFixed(1)}s{beatSpeedrun && " ⚡"}
            </div>
          </div>
          <div className="rounded-lg p-2 bg-[var(--surface-2)]">
            <div className="text-[9px] text-[var(--muted)] uppercase">Escuditos</div>
            <div className="text-base font-black">🪙 {result?.coinsCollected ?? 0}</div>
          </div>
          <div className="rounded-lg p-2 bg-[var(--surface-2)]">
            <div className="text-[9px] text-[var(--muted)] uppercase">Aplastados</div>
            <div className="text-base font-black">👣 {result?.enemiesStomped ?? 0}</div>
          </div>
        </div>

        {result?.finished && result.noHit && (
          <div className="mt-3 text-center text-csh-yellow text-xs font-bold">
            💪 Sin recibir daño · +100 pts bonus
          </div>
        )}

        {newlyUnlocked.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="text-[10px] font-bold tracking-widest text-csh-yellow">MEDALLAS DESBLOQUEADAS</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {newlyUnlocked.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <div key={id} className="rounded-lg px-2 py-1 bg-csh-yellow/20 border border-csh-yellow text-[11px] font-bold">
                    {a.icon} {a.name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-[10px] text-[var(--muted)] mt-3 text-center">
          {saving ? "Guardando…" : "Guardado (los puntos aún no suman a la Tabla)."}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => startLevel(levelIndex)}
          className="rounded-xl bg-csh-red text-white font-black py-3 text-sm"
        >
          🔁 Reintentar
        </button>
        {result?.finished && levelIndex + 1 < LEVELS.length ? (
          <button
            onClick={() => startLevel(levelIndex + 1)}
            className="rounded-xl bg-csh-yellow text-black font-black py-3 text-sm"
          >
            ➡ Siguiente nivel
          </button>
        ) : (
          <button
            onClick={() => setScreen("menu")}
            className="rounded-xl bg-csh-yellow text-black font-black py-3 text-sm"
          >
            📋 Volver al menú
          </button>
        )}
      </div>
    </div>
  );
}
