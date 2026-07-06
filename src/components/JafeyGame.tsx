"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, type Input as GameInput } from "@/lib/game/engine";
import { LEVELS } from "@/lib/game/levels";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";

type Screen = "menu" | "playing" | "result";

type Result = { finished: boolean; died: boolean; score: number; timeMs: number };

export function JafeyGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const inputRef = useRef<GameInput>({ left: false, right: false, jump: false });
  const [screen, setScreen] = useState<Screen>("menu");
  const [levelIndex, setLevelIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [bestByLevel, setBestByLevel] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  const loadBest = useCallback(async () => {
    const me = getLocalUser();
    if (!me) return;
    const { data } = await supabase
      .from("ed26_calicas_game_scores")
      .select("level, score")
      .eq("user_id", me.id);
    const best: Record<number, number> = {};
    for (const r of (data ?? []) as Array<{ level: number; score: number }>) {
      best[r.level] = Math.max(best[r.level] ?? 0, r.score);
    }
    setBestByLevel(best);
  }, []);

  useEffect(() => { loadBest(); }, [loadBest]);

  const startLevel = (idx: number) => {
    setLevelIndex(idx);
    setResult(null);
    setScreen("playing");
  };

  const persistResult = useCallback(async (r: Result, idx: number) => {
    const me = getLocalUser();
    if (!me) return;
    setSaving(true);
    try {
      await supabase.from("ed26_calicas_game_scores").insert({
        user_id: me.id,
        level: idx + 1,
        score: r.score,
        time_ms: r.timeMs,
        completed: r.finished,
      });
      await loadBest();
    } finally {
      setSaving(false);
    }
  }, [loadBest]);

  // Boot engine when entering playing screen
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas, levelIndex, {
      onResult: (r) => {
        setResult(r);
        setScreen("result");
        persistResult(r, levelIndex);
      },
    });
    engineRef.current = engine;
    engine.start();
    const tickInput = () => engine.setInput(inputRef.current);
    const inputInterval = setInterval(tickInput, 16);

    // Teclado
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
      clearInterval(inputInterval);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [screen, levelIndex, persistResult]);

  // Touch button helpers
  const setKey = (k: keyof GameInput, v: boolean) => {
    inputRef.current[k] = v;
  };
  const btnProps = (k: keyof GameInput) => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); setKey(k, true); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); setKey(k, false); },
    onTouchCancel: () => setKey(k, false),
    onMouseDown: () => setKey(k, true),
    onMouseUp: () => setKey(k, false),
    onMouseLeave: () => setKey(k, false),
  });

  if (screen === "menu") {
    return (
      <div className="space-y-3">
        <div className="card p-4">
          <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">MINIJUEGO</div>
          <div className="text-lg font-black">
            <span className="text-csh-red">JAFEY</span>{" "}
            <span className="text-csh-yellow">SOJO</span>{" "}
            y el Estadio Rosabal
          </div>
          <div className="text-[12px] text-[var(--muted)] mt-1 leading-relaxed">
            Don Jafey es un viejillo herediano de <b className="text-[var(--text)]">pura cepa</b> que
            se propuso inaugurar el nuevo <b className="text-csh-yellow">Estadio Rosabal Cordero</b>.
            En el camino le salen aficionados rivales, vallas y algún que otro tropiezo.
            Ayudalo a llegar a la meta esquivando/saltando enemigos y recogiendo escuditos.
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">
            🕹️ <b>← →</b> caminar &nbsp;·&nbsp; <b>↑ / Espacio</b> saltar &nbsp;·&nbsp; caer encima aplasta.
            <br />
            💡 En móvil usá los botones flotantes al final de la pantalla.
          </div>
          <div className="mt-3 text-[10px] text-csh-yellow font-bold uppercase tracking-widest">
            🟡 Los puntos quedan registrados pero por ahora no suman a la tabla acumulada.
          </div>
        </div>

        {LEVELS.map((lv, i) => {
          const unlocked = i === 0 || (bestByLevel[i] ?? 0) > 0;
          const best = bestByLevel[i + 1] ?? 0;
          return (
            <button
              key={i}
              disabled={!unlocked}
              onClick={() => unlocked && startLevel(i)}
              className={`card w-full text-left p-4 flex items-center gap-3 ${unlocked ? "active:scale-[0.99] transition" : "opacity-60"}`}
            >
              <div className="text-3xl">{i === 0 ? "🚶" : "🏟️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow uppercase">{lv.name}</div>
                <div className="font-black">{lv.subtitle}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {unlocked ? (best > 0 ? `Mejor puntaje: ${best} pts` : "Nunca jugado") : "🔒 Completá el nivel anterior"}
                </div>
              </div>
              <div className="text-sm font-black text-csh-red">▶</div>
            </button>
          );
        })}
      </div>
    );
  }

  if (screen === "playing") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border-2 border-csh-red bg-black relative touch-none select-none">
          <canvas
            ref={canvasRef}
            width={320}
            height={200}
            className="w-full h-auto block"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Controles tactiles */}
        <div className="grid grid-cols-3 gap-2 select-none">
          <button
            {...btnProps("left")}
            className="rounded-2xl bg-csh-red text-white text-2xl font-black py-5 active:bg-red-700 shadow-lg border-b-4 border-red-900"
          >
            ◀
          </button>
          <button
            {...btnProps("right")}
            className="rounded-2xl bg-csh-red text-white text-2xl font-black py-5 active:bg-red-700 shadow-lg border-b-4 border-red-900"
          >
            ▶
          </button>
          <button
            {...btnProps("jump")}
            className="rounded-2xl bg-csh-yellow text-black text-2xl font-black py-5 active:bg-yellow-400 shadow-lg border-b-4 border-yellow-700"
          >
            🦘
          </button>
        </div>

        <button
          onClick={() => { engineRef.current?.stop(); setScreen("menu"); }}
          className="btn-ghost w-full text-xs"
        >
          ⏹ Salir al menú
        </button>
      </div>
    );
  }

  // Result screen
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">
          {result?.finished ? "¡PURA VIDA!" : "AY MAMITA"}
        </div>
        <div className="text-2xl font-black">
          {result?.finished ? "🏆 Nivel completado" : "💥 Se cayó don Jafey"}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="card p-3">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Puntos</div>
            <div className="text-2xl font-black text-csh-yellow tabular-nums">{result?.score ?? 0}</div>
          </div>
          <div className="card p-3">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Tiempo</div>
            <div className="text-2xl font-black tabular-nums">{((result?.timeMs ?? 0) / 1000).toFixed(1)}s</div>
          </div>
        </div>
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
