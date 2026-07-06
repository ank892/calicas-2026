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

  // Controles con pointer events + captura para que el touch no se quede pegado.
  // Guardamos un contador por accion (si dos pointers presionan a la vez).
  const pressCount = useRef<Record<keyof GameInput, number>>({ left: 0, right: 0, jump: 0 });
  const setKey = (k: keyof GameInput, delta: number) => {
    const next = Math.max(0, pressCount.current[k] + delta);
    pressCount.current[k] = next;
    inputRef.current[k] = next > 0;
  };
  const clearAll = () => {
    (["left", "right", "jump"] as const).forEach((k) => {
      pressCount.current[k] = 0;
      inputRef.current[k] = false;
    });
  };
  const btnProps = (k: keyof GameInput) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setKey(k, +1);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      setKey(k, -1);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      setKey(k, -1);
    },
    onLostPointerCapture: () => setKey(k, -1),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Salvavidas: si el usuario suelta fuera del boton o cambia de pestana,
  // limpiamos todo. Sin esto el boton se queda "trabado".
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
        <div className="rounded-xl overflow-hidden border-2 border-csh-red bg-black relative select-none">
          <canvas
            ref={canvasRef}
            width={320}
            height={200}
            className="w-full h-auto block"
            style={{ imageRendering: "pixelated", touchAction: "none" }}
          />
        </div>

        {/* Controles fijos abajo, dedos gordos friendly */}
        <div
          className="fixed bottom-16 left-0 right-0 z-40 flex items-end justify-between px-4 pointer-events-none"
          style={{ touchAction: "none" }}
        >
          <div className="flex gap-3 pointer-events-auto">
            <button
              {...btnProps("left")}
              aria-label="Izquierda"
              className="w-16 h-16 rounded-full bg-csh-red text-white text-3xl font-black shadow-2xl border-b-4 border-red-900 active:scale-95 active:bg-red-700"
              style={{ touchAction: "none" }}
            >
              ◀
            </button>
            <button
              {...btnProps("right")}
              aria-label="Derecha"
              className="w-16 h-16 rounded-full bg-csh-red text-white text-3xl font-black shadow-2xl border-b-4 border-red-900 active:scale-95 active:bg-red-700"
              style={{ touchAction: "none" }}
            >
              ▶
            </button>
          </div>
          <button
            {...btnProps("jump")}
            aria-label="Saltar"
            className="w-20 h-20 rounded-full bg-csh-yellow text-black text-4xl font-black shadow-2xl border-b-4 border-yellow-700 active:scale-95 active:bg-yellow-300 pointer-events-auto"
            style={{ touchAction: "none" }}
          >
            🦘
          </button>
        </div>

        <div className="text-[10px] text-[var(--muted)] text-center pt-1 pb-24">
          Tip: soltar el 🦘 antes hace saltos más cortos. Tenés medio segundo de "coyote" al caer.
        </div>

        <button
          onClick={() => { engineRef.current?.stop(); clearAll(); setScreen("menu"); }}
          className="btn-ghost w-full text-xs fixed bottom-2 left-0 right-0 max-w-sm mx-auto z-30"
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
