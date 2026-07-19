"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import {
  FINAL_MATCH_ID, SQUADS, TOTAL_GOALS_RANGES, CORNERS_RANGES, HOW_DEFINED, YELLOW_CARDS_RANGES,
  type FinalResults,
} from "@/lib/final-bonus";

const ADMIN_EMAILS = new Set(["ank892@gmail.com", "mfuentes@miguelfuentes.org"]);

export default function AdminFinalPage() {
  const [me, setMe] = useState(getLocalUser());
  const [results, setResults] = useState<FinalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setMe(getLocalUser()); }, []);

  const isAdmin = me && ADMIN_EMAILS.has(me.email.toLowerCase());

  const load = useCallback(async () => {
    const { data } = await supabase.from("ed26_calicas_final_results")
      .select("*").eq("match_id", FINAL_MATCH_ID).maybeSingle();
    setResults((data ?? {
      match_id: FINAL_MATCH_ID, btts: null, first_scorer: null, total_goals_exact: null,
      how_defined: null, goal_after_85: null, corners_range: null,
      red_card: null, header_goal: null, penalty_scored: null, mvp: null,
      goal_first_15: null, hat_trick: null, messi_scores: null, own_goal: null, yellow_cards_range: null,
    }) as FinalResults);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!me) return <div className="p-6 text-sm">Ingresá tu email en Perfil primero.</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-csh-red">🚫 No autorizado. Solo el admin puede ver esta pantalla.</div>;
  if (loading || !results) return <div className="p-6 text-sm text-[var(--muted)]">Cargando…</div>;

  const set = <K extends keyof FinalResults>(k: K, v: FinalResults[K]) => {
    setResults({ ...results, [k]: v });
    setMsg(null);
  };

  const call = async (path: string, action: string) => {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: me.email }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(`❌ ${j.error ?? "error"}: ${j.details ?? ""}`);
      } else {
        setMsg(`✅ ${action}: ${JSON.stringify(j)}`);
        if (action === "auto") await load();
      }
    } catch (e) {
      setMsg(`❌ ${String(e)}`);
    } finally {
      setBusy("");
    }
  };

  const saveManual = async () => {
    setBusy("save");
    setMsg(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from("ed26_calicas_final_results").upsert({
      ...results,
      resolved_manual_at: now,
      updated_at: now,
    }, { onConflict: "match_id" });
    setBusy("");
    setMsg(error ? `❌ ${error.message}` : "✅ Guardado. Ahora corré Recalcular Puntos.");
  };

  return (
    <div className="space-y-3 pb-8">
      <div className="card p-4 border-csh-yellow">
        <div className="text-[10px] font-bold tracking-widest text-csh-yellow">ADMIN — RESOLUCIÓN FINAL</div>
        <div className="text-sm font-bold mt-1">Match {FINAL_MATCH_ID} · España vs Argentina</div>
        <div className="text-[11px] text-[var(--muted)] mt-1">
          Flujo: <b>1)</b> Resolver auto (btts, primer goleador, total, cómo se define, gol 85+).
          <b> 2)</b> Rellená las manuales (corners, roja, cabeza, penal, MVP) y guardá.
          <b> 3)</b> Recalcular puntos.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy !== ""} onClick={() => call("/api/final/resolve-auto", "auto")}
          className="bg-csh-yellow text-black font-black py-3 rounded-xl text-xs">
          {busy === "auto" ? "…" : "🤖 Resolver Auto"}
        </button>
        <button disabled={busy !== ""} onClick={() => call("/api/final/recompute", "recompute")}
          className="bg-csh-red text-white font-black py-3 rounded-xl text-xs">
          {busy === "recompute" ? "…" : "🧮 Recalcular Puntos"}
        </button>
      </div>

      {msg && <div className="card p-2 text-[11px] whitespace-pre-wrap break-all">{msg}</div>}

      <div className="card p-3">
        <div className="text-[10px] font-bold tracking-widest text-csh-yellow mb-2">CAMPOS AUTO (editables)</div>

        <Row label="Ambos anotan (btts)">
          <YesNo v={results.btts} on={(x) => set("btts", x)} />
        </Row>
        <Row label="Primer goleador">
          <select className="input w-full text-xs" value={results.first_scorer ?? ""} onChange={(e) => set("first_scorer", e.target.value || null)}>
            <option value="">—</option>
            <option value="no_goal">Sin goles</option>
            {Object.entries(SQUADS).map(([t, s]) => (
              <optgroup key={t} label={`${s.flag} ${t}`}>
                {s.players.map((p) => <option key={p}>{p}</option>)}
              </optgroup>
            ))}
          </select>
        </Row>
        <Row label="Total goles (exacto)">
          <input type="number" min={0} max={12} className="input w-20 text-center text-xs"
            value={results.total_goals_exact ?? ""}
            onChange={(e) => set("total_goals_exact", e.target.value === "" ? null : Number(e.target.value))} />
        </Row>
        <Row label="Cómo se define">
          <select className="input w-full text-xs" value={results.how_defined ?? ""} onChange={(e) => set("how_defined", e.target.value || null)}>
            <option value="">—</option>
            {HOW_DEFINED.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Row>
        <Row label="Gol después del 85'">
          <YesNo v={results.goal_after_85} on={(x) => set("goal_after_85", x)} />
        </Row>
        <Row label="⚡ Gol en primeros 15'">
          <YesNo v={results.goal_first_15} on={(x) => set("goal_first_15", x)} />
        </Row>
        <Row label="🎩 Hat-trick">
          <YesNo v={results.hat_trick} on={(x) => set("hat_trick", x)} />
        </Row>
        <Row label="🐐 Messi anota">
          <YesNo v={results.messi_scores} on={(x) => set("messi_scores", x)} />
        </Row>
      </div>

      <div className="card p-3">
        <div className="text-[10px] font-bold tracking-widest text-csh-yellow mb-2">CAMPOS MANUALES</div>

        <Row label="Corners (rango)">
          <select className="input w-full text-xs" value={results.corners_range ?? ""} onChange={(e) => set("corners_range", e.target.value || null)}>
            <option value="">—</option>
            {CORNERS_RANGES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Row>
        <Row label="Tarjeta roja"><YesNo v={results.red_card} on={(x) => set("red_card", x)} /></Row>
        <Row label="Gol de cabeza"><YesNo v={results.header_goal} on={(x) => set("header_goal", x)} /></Row>
        <Row label="Penal cobrado"><YesNo v={results.penalty_scored} on={(x) => set("penalty_scored", x)} /></Row>
        <Row label="MVP">
          <select className="input w-full text-xs" value={results.mvp ?? ""} onChange={(e) => set("mvp", e.target.value || null)}>
            <option value="">—</option>
            {Object.entries(SQUADS).map(([t, s]) => (
              <optgroup key={t} label={`${s.flag} ${t}`}>
                {s.players.map((p) => <option key={p}>{p}</option>)}
              </optgroup>
            ))}
          </select>
        </Row>
        <Row label="🤦 Autogol"><YesNo v={results.own_goal} on={(x) => set("own_goal", x)} /></Row>
        <Row label="🟨 Amarillas (rango)">
          <select className="input w-full text-xs" value={results.yellow_cards_range ?? ""} onChange={(e) => set("yellow_cards_range", e.target.value || null)}>
            <option value="">—</option>
            {YELLOW_CARDS_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Row>
      </div>

      <button disabled={busy !== ""} onClick={saveManual}
        className="w-full bg-csh-red text-white font-black py-4 rounded-xl text-base">
        {busy === "save" ? "Guardando…" : "💾 Guardar resultado oficial"}
      </button>

      <div className="text-[10px] text-[var(--muted)] text-center">
        Ver los rangos para referencia: total goles {TOTAL_GOALS_RANGES.join("/")} · corners {CORNERS_RANGES.join("/")}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 gap-2 border-b border-[var(--border)] last:border-0">
      <div className="text-xs text-[var(--muted)] flex-1">{label}</div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function YesNo({ v, on }: { v: boolean | null; on: (x: boolean | null) => void }) {
  return (
    <div className="flex gap-1">
      <button onClick={() => on(true)} className={`px-2 py-1 text-[10px] font-bold rounded ${v === true ? "bg-csh-red text-white" : "bg-[var(--surface-2)]"}`}>Sí</button>
      <button onClick={() => on(false)} className={`px-2 py-1 text-[10px] font-bold rounded ${v === false ? "bg-csh-red text-white" : "bg-[var(--surface-2)]"}`}>No</button>
      <button onClick={() => on(null)} className={`px-2 py-1 text-[10px] font-bold rounded ${v === null ? "bg-[var(--border)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>—</button>
    </div>
  );
}
