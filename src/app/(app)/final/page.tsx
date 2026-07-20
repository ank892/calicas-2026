"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import {
  FINAL_MATCH_ID, SQUADS, TOTAL_GOALS_RANGES, CORNERS_RANGES, HOW_DEFINED, YELLOW_CARDS_RANGES,
  MAX_POINTS, type FinalPick, type FinalResults, scoreFinalPick,
} from "@/lib/final-bonus";

type Match = {
  id: string; home_team_name: string | null; away_team_name: string | null;
  kickoff_utc: string | null; finished: boolean;
  home_score: number | null; away_score: number | null;
};

export default function FinalPage() {
  const [me, setMe] = useState(getLocalUser());
  const [match, setMatch] = useState<Match | null>(null);
  const [pick, setPick] = useState<FinalPick | null>(null);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setMe(getLocalUser());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const m = getLocalUser();
    const [{ data: mm }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("ed26_calicas_matches")
        .select("id, home_team_name, away_team_name, kickoff_utc, finished, home_score, away_score")
        .eq("id", FINAL_MATCH_ID).maybeSingle(),
      supabase.from("ed26_calicas_final_results").select("*").eq("match_id", FINAL_MATCH_ID).maybeSingle(),
      m ? supabase.from("ed26_calicas_final_picks").select("*")
            .eq("user_id", m.id).eq("match_id", FINAL_MATCH_ID).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setMatch((mm ?? null) as Match | null);
    setResults((r ?? null) as FinalResults | null);
    setPick((p as FinalPick | null) ?? blankPick(m?.id ?? ""));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kickoffMs = match?.kickoff_utc ? new Date(match.kickoff_utc).getTime() : 0;
  const isLocked = kickoffMs > 0 && now >= kickoffMs;
  const minutesLeft = Math.max(0, Math.floor((kickoffMs - now) / 60000));
  const hoursLeft = Math.floor(minutesLeft / 60);
  const minsLeft = minutesLeft % 60;

  const allPlayers = useMemo(() => {
    const list: { name: string; team: string; flag: string }[] = [];
    for (const [team, s] of Object.entries(SQUADS)) {
      for (const n of s.players) list.push({ name: n, team, flag: s.flag });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const set = <K extends keyof FinalPick>(k: K, v: FinalPick[K]) => {
    setPick((p) => (p ? { ...p, [k]: v } : p));
    setSaved(null);
  };

  const save = async () => {
    if (!me || !pick || isLocked) return;
    setSaving(true);
    setSaved(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from("ed26_calicas_final_picks").upsert({
      user_id: me.id,
      match_id: FINAL_MATCH_ID,
      btts: pick.btts,
      first_scorer: pick.first_scorer,
      total_goals_range: pick.total_goals_range,
      total_goals_exact: pick.total_goals_exact,
      how_defined: pick.how_defined,
      goal_after_85: pick.goal_after_85,
      corners_range: pick.corners_range,
      red_card: pick.red_card,
      header_goal: pick.header_goal,
      penalty_scored: pick.penalty_scored,
      mvp: pick.mvp,
      goal_first_15: pick.goal_first_15,
      hat_trick: pick.hat_trick,
      messi_scores: pick.messi_scores,
      own_goal: pick.own_goal,
      yellow_cards_range: pick.yellow_cards_range,
      updated_at: now,
    }, { onConflict: "user_id,match_id" });
    setSaving(false);
    setSaved(error ? `❌ ${error.message}` : "✅ Guardado");
  };

  if (!me) return <div className="p-6 text-sm">Ingresá tu email en Perfil primero.</div>;
  if (loading || !pick) return <div className="p-6 text-sm text-[var(--muted)]">Cargando…</div>;

  // Si ya hay resultados calculados, mostramos breakdown
  const showResults = results && (results.btts !== null || results.first_scorer !== null);
  const scored = showResults ? scoreFinalPick(pick, results!) : null;
  const breakdownMap = new Map((scored?.breakdown ?? []).map((b) => [b.key, b]));

  return (
    <div className="space-y-3 pb-8">
      <div className="card p-4 bg-gradient-to-br from-csh-red/30 to-csh-yellow/20 border-csh-yellow">
        <div className="text-[10px] font-bold tracking-[0.2em] text-csh-yellow">🏆 BONUS FINAL — 185 PTS</div>
        <div className="text-lg font-black leading-tight mt-1">
          {SQUADS[match?.home_team_name ?? ""]?.flag ?? "🏳️"} {match?.home_team_name} vs {match?.away_team_name} {SQUADS[match?.away_team_name ?? ""]?.flag ?? "🏳️"}
        </div>
        {isLocked ? (
          <div className="text-[12px] text-csh-yellow font-bold mt-1">🔒 Cerrado — el partido ya empezó</div>
        ) : (
          <div className="text-[12px] text-[var(--muted)] mt-1">
            Cierra al kickoff · <b className="text-csh-yellow">{hoursLeft > 0 ? `${hoursLeft}h ` : ""}{minsLeft}min</b>
          </div>
        )}
      </div>

      {scored && (
        <div className="rounded-2xl overflow-hidden border-2 border-csh-yellow shadow-[0_0_40px_rgba(255,212,0,0.25)]">
          <div className="p-5 text-center"
            style={{ background: "linear-gradient(135deg, #CF142B 0%, #8B0F1F 50%, #FFD400 100%)" }}>
            <div className="text-[10px] font-black tracking-[0.3em] text-white/90">TU PUNTAJE FINAL</div>
            <div className="text-5xl font-black text-white mt-1 drop-shadow-lg tabular-nums">
              {scored.total}
              <span className="text-2xl text-white/70"> / {MAX_POINTS}</span>
            </div>
            <div className="text-[11px] text-white/90 mt-1 font-bold">
              {scored.breakdown.filter((b) => b.points > 0).length} de {scored.breakdown.length} predicciones acertadas
            </div>
          </div>
        </div>
      )}

      {/* Card de cada predicción */}
      <SectionYesNo label="1. ¿Ambos equipos anotan?" points={10} value={pick.btts} onChange={(v) => set("btts", v)} disabled={isLocked} real={results?.btts} score={breakdownMap.get("btts")} />

      <Section label="2. Primer goleador del partido" points={25} real={results?.first_scorer} realLabel={(v) => v === "no_goal" ? "Sin goles" : String(v)} score={breakdownMap.get("first_scorer")}>
        <select value={pick.first_scorer ?? ""} onChange={(e) => set("first_scorer", e.target.value || null)} disabled={isLocked}
          className="input w-full text-sm">
          <option value="">— Elegí —</option>
          <option value="no_goal">🚫 Sin goles (0-0)</option>
          {Object.entries(SQUADS).map(([team, s]) => (
            <optgroup key={team} label={`${s.flag} ${team}`}>
              {s.players.map((p) => <option key={p} value={p}>{p}</option>)}
            </optgroup>
          ))}
        </select>
      </Section>

      <Section label="3. Total de goles" points={10} pointsExtra="+10 exacto"
        real={results?.total_goals_exact !== null && results?.total_goals_exact !== undefined ? String(results.total_goals_exact) : null}
        score={breakdownMap.get("total_goals_range")} scoreExtra={breakdownMap.get("total_goals_exact")}>
        <div className="grid grid-cols-3 gap-1">
          {TOTAL_GOALS_RANGES.map((r) => (
            <button key={r} disabled={isLocked}
              onClick={() => set("total_goals_range", r)}
              className={`py-2 rounded-lg text-xs font-bold ${pick.total_goals_range === r ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
              {r === "0-1" ? "0-1 goles" : r === "2-3" ? "2-3 goles" : "4 o más"}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="text-[var(--muted)]">Bonus exacto:</span>
          <input type="number" min={0} max={12} value={pick.total_goals_exact ?? ""}
            onChange={(e) => set("total_goals_exact", e.target.value === "" ? null : Number(e.target.value))}
            disabled={isLocked} className="input w-16 text-center" placeholder="?" />
          <span className="text-[10px] text-[var(--muted)]">goles exactos</span>
        </div>
      </Section>

      <Section label="4. ¿Cómo se define?" points={15} real={results?.how_defined} realLabel={howLabel} score={breakdownMap.get("how_defined")}>
        <div className="grid grid-cols-3 gap-1">
          {HOW_DEFINED.map((h) => (
            <button key={h} disabled={isLocked}
              onClick={() => set("how_defined", h)}
              className={`py-2 rounded-lg text-xs font-bold ${pick.how_defined === h ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
              {howLabel(h)}
            </button>
          ))}
        </div>
      </Section>

      <SectionYesNo label="5. ¿Habrá gol después del minuto 85?" points={10} value={pick.goal_after_85} onChange={(v) => set("goal_after_85", v)} disabled={isLocked} real={results?.goal_after_85} score={breakdownMap.get("goal_after_85")} />

      <Section label="6. Total de tiros de esquina" points={10} real={results?.corners_range} score={breakdownMap.get("corners_range")}>
        <div className="grid grid-cols-3 gap-1">
          {CORNERS_RANGES.map((r) => (
            <button key={r} disabled={isLocked}
              onClick={() => set("corners_range", r)}
              className={`py-2 rounded-lg text-xs font-bold ${pick.corners_range === r ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
              {r === "<=7" ? "7 o menos" : r === "8-11" ? "8 a 11" : "12 o más"}
            </button>
          ))}
        </div>
      </Section>

      <SectionYesNo label="7. ¿Habrá tarjeta roja?" points={10} value={pick.red_card} onChange={(v) => set("red_card", v)} disabled={isLocked} real={results?.red_card} score={breakdownMap.get("red_card")} />
      <SectionYesNo label="8. ¿Habrá gol de cabeza?" points={10} value={pick.header_goal} onChange={(v) => set("header_goal", v)} disabled={isLocked} real={results?.header_goal} score={breakdownMap.get("header_goal")} />
      <SectionYesNo label="9. ¿Se cobrará algún penal?" points={10} value={pick.penalty_scored} onChange={(v) => set("penalty_scored", v)} disabled={isLocked} real={results?.penalty_scored} score={breakdownMap.get("penalty_scored")} />

      <Section label="10. MVP del partido" points={10} real={results?.mvp} score={breakdownMap.get("mvp")}>
        <select value={pick.mvp ?? ""} onChange={(e) => set("mvp", e.target.value || null)} disabled={isLocked}
          className="input w-full text-sm">
          <option value="">— Elegí —</option>
          {Object.entries(SQUADS).map(([team, s]) => (
            <optgroup key={team} label={`${s.flag} ${team}`}>
              {s.players.map((p) => <option key={p} value={p}>{p}</option>)}
            </optgroup>
          ))}
        </select>
      </Section>

      <div className="mt-2 rounded-xl p-2 text-center border border-csh-yellow/40 bg-[rgba(255,212,0,0.06)]">
        <div className="text-[10px] font-black tracking-widest text-csh-yellow">🎲 EXTRAS DIVERTIDAS · +55 PTS</div>
      </div>

      <SectionYesNo label="11. ⚡ ¿Gol en los primeros 15 minutos?" points={10} value={pick.goal_first_15} onChange={(v) => set("goal_first_15", v)} disabled={isLocked} real={results?.goal_first_15} score={breakdownMap.get("goal_first_15")} />
      <SectionYesNo label="12. 🎩 ¿Habrá un hat-trick? (3+ goles del mismo)" points={15} value={pick.hat_trick} onChange={(v) => set("hat_trick", v)} disabled={isLocked} real={results?.hat_trick} score={breakdownMap.get("hat_trick")} />
      <SectionYesNo label="13. 🐐 ¿Messi anota gol?" points={10} value={pick.messi_scores} onChange={(v) => set("messi_scores", v)} disabled={isLocked} real={results?.messi_scores} score={breakdownMap.get("messi_scores")} />
      <SectionYesNo label="14. 🤦 ¿Habrá autogol?" points={10} value={pick.own_goal} onChange={(v) => set("own_goal", v)} disabled={isLocked} real={results?.own_goal} score={breakdownMap.get("own_goal")} />

      <Section label="15. 🟨 Total de tarjetas amarillas" points={10} real={results?.yellow_cards_range} score={breakdownMap.get("yellow_cards_range")}>
        <div className="grid grid-cols-4 gap-1">
          {YELLOW_CARDS_RANGES.map((r) => (
            <button key={r} disabled={isLocked}
              onClick={() => set("yellow_cards_range", r)}
              className={`py-2 rounded-lg text-[11px] font-bold ${pick.yellow_cards_range === r ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
              {r}
            </button>
          ))}
        </div>
      </Section>

      {!isLocked && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-csh-red text-white font-black py-4 rounded-xl text-base sticky bottom-16 shadow-2xl border-b-4 border-red-900"
        >
          {saving ? "Guardando…" : "💾 Guardar pronósticos"}
        </button>
      )}
      {saved && <div className="text-center text-xs text-csh-yellow font-bold">{saved}</div>}

      {scored && (
        <div className="card p-4">
          <div className="text-[10px] font-bold tracking-widest text-csh-yellow">DETALLE</div>
          <div className="space-y-1 mt-2 text-xs">
            {scored.breakdown.map((b) => (
              <div key={b.key} className="flex justify-between border-b border-[var(--border)] py-1">
                <span className="text-[var(--muted)]">{b.label}</span>
                <span className={b.points > 0 ? "text-csh-yellow font-bold" : "text-[var(--muted)]"}>
                  {b.points}/{b.max}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ver picks de otros (solo si esta cerrado) */}
      {isLocked && <OthersPicks />}
    </div>
  );
}

function howLabel(v: unknown): string {
  return v === "regular" ? "Tiempo regular" : v === "extra" ? "Prórroga" : v === "penalties" ? "Penales" : "?";
}

function blankPick(userId: string): FinalPick {
  return {
    user_id: userId, match_id: FINAL_MATCH_ID,
    btts: null, first_scorer: null, total_goals_range: null, total_goals_exact: null,
    how_defined: null, goal_after_85: null, corners_range: null,
    red_card: null, header_goal: null, penalty_scored: null, mvp: null,
    goal_first_15: null, hat_trick: null, messi_scores: null, own_goal: null, yellow_cards_range: null,
  };
}

function Section({ label, points, pointsExtra, real, realLabel, score, scoreExtra, children }: {
  label: string; points: number; pointsExtra?: string;
  real?: unknown; realLabel?: (v: unknown) => string;
  score?: { points: number; max: number };
  scoreExtra?: { points: number; max: number };
  children: React.ReactNode;
}) {
  // Badge de resultado del pick, si ya tenemos scoring
  const hasScore = score !== undefined;
  const won = hasScore && score.points > 0;
  const wonExtra = scoreExtra !== undefined && scoreExtra.points > 0;
  const totalWon = (score?.points ?? 0) + (scoreExtra?.points ?? 0);
  const totalMax = (score?.max ?? points) + (scoreExtra?.max ?? 0);
  return (
    <div className={`card p-3 ${hasScore ? (won ? "border-green-500/60" : "border-red-500/40") : ""}`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="text-sm font-bold flex-1">{label}</div>
        {hasScore ? (
          <div className={`text-[10px] font-black whitespace-nowrap px-2 py-1 rounded-full ${
            won ? "bg-green-500 text-black" : "bg-red-500/30 text-red-300"
          }`}>
            {won ? "✅" : "❌"} {totalWon}/{totalMax} pts
          </div>
        ) : (
          <div className="text-[10px] font-bold text-csh-yellow whitespace-nowrap">
            {points} pts{pointsExtra ? ` ${pointsExtra}` : ""}
          </div>
        )}
      </div>
      {children}
      {real !== null && real !== undefined && (
        <div className="mt-2 text-[11px] border-t border-[var(--border)] pt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span><span className="text-[var(--muted)]">Real:</span> <b className="text-csh-yellow">{realLabel ? realLabel(real) : String(real)}</b></span>
          {scoreExtra && (
            <span className={wonExtra ? "text-green-400 font-bold" : "text-red-400/70"}>
              {wonExtra ? "✅" : "❌"} Bonus exacto: {scoreExtra.points}/{scoreExtra.max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionYesNo({ label, points, value, onChange, disabled, real, score }: {
  label: string; points: number; value: boolean | null; onChange: (v: boolean) => void;
  disabled: boolean; real?: boolean | null; score?: { points: number; max: number };
}) {
  return (
    <Section label={label} points={points} real={real} realLabel={(v) => v ? "Sí" : "No"} score={score}>
      <div className="grid grid-cols-2 gap-1">
        <button disabled={disabled} onClick={() => onChange(true)}
          className={`py-2 rounded-lg text-xs font-bold ${value === true ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
          ✅ Sí
        </button>
        <button disabled={disabled} onClick={() => onChange(false)}
          className={`py-2 rounded-lg text-xs font-bold ${value === false ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
          ❌ No
        </button>
      </div>
    </Section>
  );
}

function OthersPicks() {
  const [rows, setRows] = useState<Array<{ user_id: string; points: number; display_name: string; avatar_emoji: string }>>([]);
  useEffect(() => {
    (async () => {
      const [{ data: picks }, { data: users }] = await Promise.all([
        supabase.from("ed26_calicas_final_picks").select("user_id, points").eq("match_id", FINAL_MATCH_ID),
        supabase.from("ed26_calicas_users").select("id, display_name, avatar_emoji"),
      ]);
      const um = new Map((users ?? []).map((u) => [u.id, u]));
      const r = ((picks ?? []) as Array<{ user_id: string; points: number }>)
        .map((p) => ({ ...p, display_name: um.get(p.user_id)?.display_name ?? "?", avatar_emoji: um.get(p.user_id)?.avatar_emoji ?? "⭐" }))
        .sort((a, b) => b.points - a.points);
      setRows(r);
    })();
  }, []);
  if (rows.length === 0) return null;
  return (
    <div className="card p-4">
      <div className="text-[10px] font-bold tracking-widest text-csh-yellow">RANKING BONUS FINAL</div>
      <div className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <div key={r.user_id} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--border)]">
            <span className="w-6 text-center font-black text-[var(--muted)]">{i + 1}</span>
            <span>{r.avatar_emoji}</span>
            <span className="flex-1 font-bold">{r.display_name}</span>
            <span className="font-black text-csh-yellow">{r.points} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}
