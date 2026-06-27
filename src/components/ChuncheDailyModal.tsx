"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { phraseForToday } from "@/lib/chunche-phrases";

const STORAGE_PREFIX = "calicas-chunche-";

// Modal diario con la postal del Chunche y una frase rotativa.
// Se muestra una vez por dia (zona horaria de Costa Rica) hasta que el
// usuario presiona OK; vuelve a aparecer al dia siguiente con otra frase.
export function ChuncheDailyModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ phrase: string; dayKey: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = phraseForToday();
    const seen = localStorage.getItem(STORAGE_PREFIX + t.dayKey);
    setData({ phrase: t.phrase, dayKey: t.dayKey });
    if (!seen) setOpen(true);
  }, []);

  function close() {
    if (data && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_PREFIX + data.dayKey, "1");
    }
    setOpen(false);
  }

  if (!open || !data) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3">
      <div className="card w-full max-w-sm rounded-2xl overflow-hidden flex flex-col">
        <div className="csh-stripe h-1.5 w-full" />
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">PASTILLA DEL DIA</div>
            <div className="text-base font-black">
              <span className="text-csh-red">El Chunche</span>{" "}
              <span className="text-csh-yellow">dijo…</span>
            </div>
          </div>
          <div className="text-2xl">⚽</div>
        </div>

        <div className="relative w-full bg-[#0a0e1a] aspect-square">
          <Image
            src="/chunche.png"
            alt="El Chunche"
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-contain"
            priority
          />
        </div>

        <div className="px-4 py-4 border-t border-[var(--border)]">
          <blockquote className="text-sm italic leading-relaxed text-center">
            “{data.phrase}”
          </blockquote>
        </div>

        <div className="p-3 pt-0">
          <button
            onClick={close}
            className="w-full rounded-xl bg-csh-red text-white font-black py-3 text-sm tracking-wide hover:opacity-90 transition"
          >
            OK, ¡pura vida!
          </button>
        </div>
      </div>
    </div>
  );
}
