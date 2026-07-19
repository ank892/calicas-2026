"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "calicas-final-bonus-seen-v2";

export function FinalBonusModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, []);

  function close() {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-3 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(255,212,0,0.4)]"
        style={{ border: "2px solid var(--csh-yellow, #FFD400)" }}>
        {/* Header gradient */}
        <div className="relative p-5 text-center"
          style={{ background: "linear-gradient(135deg, #CF142B 0%, #8B0F1F 50%, #FFD400 100%)" }}>
          <div className="csh-stripe absolute top-0 left-0 right-0 h-1.5" />
          <div className="text-6xl mb-2 animate-bounce">🏆</div>
          <div className="text-[10px] font-black tracking-[0.3em] text-white/90">GRAN FINAL DEL MUNDIAL</div>
          <div className="text-3xl font-black text-white mt-2 drop-shadow-lg">
            +185 PUNTOS
          </div>
          <div className="text-[11px] font-bold text-white/95 mt-1">EN JUEGO ESTE 19 DE JULIO</div>
        </div>

        {/* Body */}
        <div className="bg-[var(--bg)] p-5 space-y-3 text-sm">
          <div className="text-center">
            <div className="text-lg font-black">🇪🇸 España vs Argentina 🇦🇷</div>
            <div className="text-[12px] text-[var(--muted)]">Domingo 13:00 hora Costa Rica</div>
          </div>

          <p className="text-[13px]">
            Habilitamos una <b className="text-csh-yellow">quiniela especial</b> con <b>15 predicciones extra</b> para
            revolver la tabla en el último partido:
          </p>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Chip>🥅 Primer goleador</Chip>
            <Chip>⚡ Gol en los 15'</Chip>
            <Chip>🎩 Hat-trick</Chip>
            <Chip>🐐 Messi anota</Chip>
            <Chip>🤦 Autogol</Chip>
            <Chip>🟨 Amarillas</Chip>
            <Chip>🚩 Corners</Chip>
            <Chip>👑 MVP</Chip>
            <Chip>🎯 Penal</Chip>
            <Chip>🧠 Cómo se define</Chip>
          </div>

          <div className="rounded-lg border border-csh-yellow/40 bg-[rgba(255,212,0,0.08)] p-3 text-[12px] text-center">
            ⏰ Cierra al <b className="text-csh-yellow">pitazo inicial</b>. ¡No te dejés ganar!
          </div>
        </div>

        <div className="bg-[var(--bg)] p-3 border-t border-[var(--border)]">
          <Link href="/final" onClick={close}
            className="block w-full py-3.5 text-center font-black text-white rounded-lg active:scale-95 transition text-base"
            style={{ background: "linear-gradient(90deg, #CF142B, #FFD400)" }}>
            🚀 IR A LA QUINIELA FINAL
          </Link>
          <button onClick={close} className="w-full mt-2 py-1.5 text-[11px] text-[var(--muted)]">Después</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1.5 font-semibold text-center">
      {children}
    </div>
  );
}
