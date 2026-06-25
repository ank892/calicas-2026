"use client";

import { useEffect, useState } from "react";
import { ClanManager } from "./ClanManager";

const STORAGE_KEY = "calicas-onboarding-v3-seen";

// Modal de bienvenida que se muestra una sola vez para introducir
// las mejoras nuevas (banderas, clanes, batalla de clanes).
export function WelcomeModal() {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden">
        <div className="csh-stripe h-1.5 w-full" />
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">NOVEDADES v3</div>
          <div className="text-lg font-black">
            <span className="text-csh-red">CALICAS</span>{" "}
            <span className="text-csh-yellow">2026</span> 🎯
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4 text-sm">
          <div className="space-y-2">
            <div className="font-bold">✨ Qué hay de nuevo</div>
            <ul className="space-y-1.5 text-[13px] text-[var(--muted)] list-disc pl-5">
              <li>📊 <b className="text-[var(--text)]">Tabla del grupo</b> en cada partido: tocá el badge <b>G{"{X}"} 📊</b> para ver posiciones y últimos resultados de los equipos.</li>
              <li>🎯 <b className="text-[var(--text)]">Bonus de grupos</b>: pronosticá 1ro (5 pts), 2do (3 pts) y mejor 3ro (4 pts) de cada grupo. Botón rojo en la sección de Partidos.</li>
              <li>📧 <b className="text-[var(--text)]">Recordatorios por correo</b>: si te falta un pronóstico para un partido del día siguiente, te llega un email automático.</li>
              <li>🛡️ <b className="text-[var(--text)]">Hasta 4 clanes</b> por usuario (antes eran 2).</li>
            </ul>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div>
            <div className="font-bold mb-2">🛡️ Revisá tus clanes</div>
            <div className="text-[11px] text-[var(--muted)] mb-3">
              Podés crear o unirte a hasta 4 clanes. También desde tu Perfil.
            </div>
            <ClanManager compact />
          </div>
        </div>

        <div className="p-3 border-t border-[var(--border)] flex gap-2">
          <button onClick={close} className="btn-primary flex-1 py-2.5 text-sm">¡Listo, vamos!</button>
        </div>
      </div>
    </div>
  );
}
