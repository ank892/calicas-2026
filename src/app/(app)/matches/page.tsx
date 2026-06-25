"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import { formatCR, formatCRDateOnly, crDateKey } from "@/lib/time";
import { PHASES, PHASE_LABELS, scorePrediction } from "@/lib/scoring";
import { PredictionsModal } from "@/components/PredictionsModal";
import { StandingsModal } from "@/components/StandingsModal";
import { GroupPicksModal } from "@/components/GroupPicksModal";
import { flagFor } from "@/lib/flags";

type Match = {
  id: string; home_team_name: string; away_team_name: string;
  home_score: number | null; away_score: number | null;
  phase: string; matchday: number | null; group_letter: string | null;
  kickoff_utc: string | null; kickoff_local: string | null;
  finished: boolean; status: string;
};
type Pred = { match_id: string; pred_home: number; pred_away: number; points: number };

// Inicio de la quiniela: lunes 15 de junio 2026 a las 00:00 hora CR
const START_DATE_CR = new Date("2026-06-15T06:00:00.000Z"); // 00:00 CR (UTC-6)

// Cierre de pronosticos: 30 minutos antes del kickoff
const LOCK_BEFORE_MS = 30 * 60 * 1000;

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [preds, setPreds] = useState<Pred[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<string>("group");
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  const [openStandings, setOpenStandings] = useState<{ group: string; home?: string; away?: string } | null>(null);
  const [openGroupPicks, setOpenGroupPicks] = useState(false);
  const [didAutoFocus, setDidAutoFocus] = useState(false);
  const dateRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const scrolledForPhase = useRef<string | null>(null);

  const load = useCallback(async () => {
    const u = getLocalUser();
    if (!u) return;
    setLoading(true);
    const [{ data: ms }, { data: ps }] = await Promise.all([
      supabase.from("ed26_calicas_matches")
        .select("id, home_team_name, away_team_name, home_score, away_score, phase, matchday, group_letter, kickoff_utc, kickoff_local, finished, status")
        .order("kickoff_utc", { ascending: true }),
      supabase.from("ed26_calicas_predictions").select("match_id, pred_home, pred_away, points").eq("user_id", u.id),
    ]);
    setMatches((ms as Match[]) ?? []);
    setPreds((ps as Pred[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("calicas-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_matches" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const phasesAvailable = useMemo(() => {
    // Una fase queda visible si la previa terminó o si tiene partidos programados.
    // Excepción: 'group' siempre visible.
    const counts = new Map<string, { total: number; finished: number; hasMatches: boolean }>();
    for (const m of matches) {
      const c = counts.get(m.phase) ?? { total: 0, finished: 0, hasMatches: true };
      c.total++; if (m.finished) c.finished++; c.hasMatches = true;
      counts.set(m.phase, c);
    }
    const result: { phase: string; unlocked: boolean; total: number; finished: number }[] = [];
    let prevDone = true;
    for (const ph of PHASES) {
      const c = counts.get(ph) ?? { total: 0, finished: 0, hasMatches: false };
      if (!c.hasMatches) {
        result.push({ phase: ph, unlocked: false, total: 0, finished: 0 });
        prevDone = false; continue;
      }
      const unlocked = ph === "group" ? true : prevDone;
      result.push({ phase: ph, unlocked, total: c.total, finished: c.finished });
      prevDone = c.total > 0 && c.finished === c.total;
    }
    return result;
  }, [matches]);

  const matchesOfPhase = useMemo(() =>
    matches.filter((m) => m.phase === activePhase), [matches, activePhase]);

  // Agrupar por fecha (en CR)
  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matchesOfPhase) {
      const k = m.kickoff_utc ? formatCRDateOnly(m.kickoff_utc) : "Por programar";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return [...map.entries()];
  }, [matchesOfPhase]);

  const predMap = useMemo(() => new Map(preds.map((p) => [p.match_id, p])), [preds]);
  const phaseInfo = phasesAvailable.find((p) => p.phase === activePhase);

  // Día de hoy en zona CR (key YYYY-MM-DD)
  const todayKey = useMemo(() => crDateKey(new Date()), []);

  // En cada fase, el día "objetivo" para scroll = hoy si tiene partidos, sino el próximo día con partidos.
  const targetDateLabelByPhase = useMemo(() => {
    const out = new Map<string, string>();
    const byPhase = new Map<string, Match[]>();
    for (const m of matches) {
      if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
      byPhase.get(m.phase)!.push(m);
    }
    for (const [phase, list] of byPhase) {
      const sorted = [...list].sort((a, b) =>
        (a.kickoff_utc || "").localeCompare(b.kickoff_utc || ""));
      let target = sorted.find((m) => m.kickoff_utc && crDateKey(m.kickoff_utc) === todayKey);
      if (!target) {
        target = sorted.find((m) => m.kickoff_utc && crDateKey(m.kickoff_utc) > todayKey);
      }
      if (!target) target = sorted[sorted.length - 1]; // último día si todo ya pasó
      if (target?.kickoff_utc) out.set(phase, formatCRDateOnly(target.kickoff_utc));
    }
    return out;
  }, [matches, todayKey]);

  // Al cargar por primera vez, elegir la fase desbloqueada que tenga partidos hoy (o más próximos).
  useEffect(() => {
    if (didAutoFocus || matches.length === 0) return;
    const unlocked = phasesAvailable.filter((p) => p.unlocked).map((p) => p.phase);
    if (unlocked.length === 0) return;
    // Buscar fase con un partido HOY
    let chosen = unlocked.find((ph) =>
      matches.some((m) => m.phase === ph && m.kickoff_utc && crDateKey(m.kickoff_utc) === todayKey));
    // Si no hay hoy, fase con próximo partido más cercano en el futuro
    if (!chosen) {
      let bestPhase: string | null = null;
      let bestKey = "9999-99-99";
      for (const ph of unlocked) {
        const next = matches
          .filter((m) => m.phase === ph && m.kickoff_utc && crDateKey(m.kickoff_utc) >= todayKey)
          .sort((a, b) => (a.kickoff_utc || "").localeCompare(b.kickoff_utc || ""))[0];
        if (next?.kickoff_utc) {
          const k = crDateKey(next.kickoff_utc);
          if (k < bestKey) { bestKey = k; bestPhase = ph; }
        }
      }
      chosen = bestPhase ?? unlocked[unlocked.length - 1];
    }
    if (chosen && chosen !== activePhase) setActivePhase(chosen);
    setDidAutoFocus(true);
  }, [matches, phasesAvailable, todayKey, didAutoFocus, activePhase]);

  // Scroll suave al día objetivo SOLO cuando cambia la fase (no en cada reload tras guardar)
  useEffect(() => {
    if (loading || grouped.length === 0) return;
    if (scrolledForPhase.current === activePhase) return;
    const target = targetDateLabelByPhase.get(activePhase);
    if (!target) return;
    const el = dateRefs.current.get(target);
    if (el) {
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        scrolledForPhase.current = activePhase;
      }, 60);
      return () => clearTimeout(t);
    }
  }, [activePhase, loading, grouped, targetDateLabelByPhase]);

  const jumpToToday = () => {
    const target = targetDateLabelByPhase.get(activePhase);
    if (!target) return;
    const el = dateRefs.current.get(target);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-thin">
        <div className="flex gap-2 min-w-max pb-2">
          {phasesAvailable.map((p) => (
            <button key={p.phase}
              onClick={() => p.unlocked && setActivePhase(p.phase)}
              disabled={!p.unlocked}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition
                ${activePhase === p.phase ? "bg-csh-red text-white border-csh-yellow" :
                  p.unlocked ? "border-[var(--border)] text-[var(--text)] bg-[rgba(255,255,255,0.04)]" :
                  "border-[var(--border)] text-[var(--muted)] opacity-60"}`}>
              {!p.unlocked && "🔒 "}
              {PHASE_LABELS[p.phase]}
            </button>
          ))}
        </div>
      </div>

      {phaseInfo && !phaseInfo.unlocked && (
        <div className="card p-4 text-center text-sm text-[var(--muted)]">
          🔒 Esta fase se desbloquea cuando termine la fase anterior.
        </div>
      )}

      {phaseInfo?.unlocked && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-[var(--muted)] uppercase tracking-widest font-bold">
            {PHASE_LABELS[activePhase]} · {phaseInfo.finished}/{phaseInfo.total} jugados
          </div>
          <div className="flex items-center gap-2">
            {activePhase === "group" && (
              <button onClick={() => setOpenGroupPicks(true)}
                className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-csh-red text-white bg-csh-red active:scale-95 transition">
                🎯 Bonus de grupos
              </button>
            )}
            {targetDateLabelByPhase.get(activePhase) && (
              <button onClick={jumpToToday}
                className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-csh-yellow text-csh-yellow bg-[rgba(255,221,0,0.08)] active:scale-95 transition">
                ↓ Hoy
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-[var(--muted)]">Cargando…</div>}

      {grouped.map(([date, list]) => {
        const isToday = list.some((m) => m.kickoff_utc && crDateKey(m.kickoff_utc) === todayKey);
        return (
          <div key={date}
            ref={(el) => { dateRefs.current.set(date, el); }}
            className="space-y-2 scroll-mt-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-csh-yellow flex items-center gap-2">
              <span>{date}</span>
              {isToday && <span className="px-1.5 py-0.5 rounded-full bg-csh-red text-white text-[9px] tracking-wider">HOY</span>}
            </div>
            {list.map((m) => (
              <MatchCard key={m.id} m={m} pred={predMap.get(m.id)} onSaved={load}
                onOpenPredictions={() => setOpenMatch(m)}
                onOpenStandings={() => m.group_letter && setOpenStandings({ group: m.group_letter, home: m.home_team_name, away: m.away_team_name })} />
            ))}
          </div>
        );
      })}

      {phaseInfo?.unlocked && grouped.length === 0 && (
        <div className="card p-4 text-center text-sm text-[var(--muted)]">Sin partidos en esta fase aún.</div>
      )}

      {openMatch && <PredictionsModal match={openMatch} onClose={() => setOpenMatch(null)} />}
      {openStandings && <StandingsModal group={openStandings.group} homeTeam={openStandings.home} awayTeam={openStandings.away} onClose={() => setOpenStandings(null)} />}
      {openGroupPicks && <GroupPicksModal matches={matches} onClose={() => setOpenGroupPicks(false)} />}
    </div>
  );
}

function MatchCard({ m, pred, onSaved, onOpenPredictions, onOpenStandings }: {
  m: Match; pred?: Pred; onSaved: () => void; onOpenPredictions: () => void; onOpenStandings: () => void;
}) {
  const kickoff = m.kickoff_utc ? new Date(m.kickoff_utc) : null;
  const now = Date.now();
  const lockTime = kickoff ? kickoff.getTime() - LOCK_BEFORE_MS : Infinity;
  const isLockedByTime = !!(kickoff && now >= lockTime);
  const isLocked = isLockedByTime || m.status !== "notstarted" || m.finished;
  // CALICAS empieza el lunes 15 de junio 2026 — los partidos del 11-14 de junio
  // se muestran como referencia pero NO permiten predicciones.
  const beforeStart = kickoff ? kickoff.getTime() < START_DATE_CR.getTime() : false;
  const canPredict = !isLocked && !beforeStart;
  const showPredictionsBtn = m.status === "live" || m.finished;

  const [home, setHome] = useState<string>(pred?.pred_home?.toString() ?? "");
  const [away, setAway] = useState<string>(pred?.pred_away?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setHome(pred?.pred_home?.toString() ?? "");
    setAway(pred?.pred_away?.toString() ?? "");
  }, [pred?.pred_home, pred?.pred_away]);

  async function save() {
    const u = getLocalUser();
    if (!u || !canPredict) return;
    setErr(null);
    const ph = parseInt(home, 10);
    const pa = parseInt(away, 10);
    if (!Number.isInteger(ph) || !Number.isInteger(pa) || ph < 0 || pa < 0) {
      setErr("Marcador inválido"); return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("ed26_calicas_predictions")
      .upsert({
        user_id: u.id, match_id: m.id,
        pred_home: ph, pred_away: pa,
        points: 0, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,match_id" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSavedOk(true); setTimeout(() => setSavedOk(false), 1600);
    onSaved();
  }

  // Si finalizado y hay pick, calcular puntos para mostrar
  const pickPoints = (pred && m.finished && m.home_score != null && m.away_score != null)
    ? scorePrediction(pred.pred_home, pred.pred_away, m.home_score, m.away_score, m.phase, m.finished)
    : pred?.points ?? null;

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between text-[11px]">
        <div className="text-[var(--muted)]">
          {kickoff ? formatCR(kickoff) : "—"} <span className="opacity-70">CR</span>
          {m.group_letter && (
            <button onClick={onOpenStandings} className="ml-2 text-csh-yellow font-bold hover:underline">
              G{m.group_letter} 📊
            </button>
          )}
          {m.matchday && <span className="ml-2 text-[var(--muted)]">J{m.matchday}</span>}
        </div>
        {m.status === "live" ? (
          <button onClick={onOpenPredictions} className="badge badge-live cursor-pointer hover:opacity-80"><span className="dot-live" />LIVE · Ver picks</button>
        ) : m.finished ? (
          <button onClick={onOpenPredictions} className="badge badge-finished cursor-pointer hover:opacity-80">FIN · Ver picks</button>
        ) : beforeStart ? (
          <span className="badge badge-locked">Fuera de quiniela</span>
        ) : isLocked ? (
          <span className="badge badge-locked">🔒 Cerrado</span>
        ) : kickoff ? (
          <CountdownBadge kickoff={kickoff} />
        ) : (
          <span className="badge badge-soon">Abierto</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <div className="font-bold leading-tight flex items-center justify-end gap-1.5">
            <span className="truncate">{m.home_team_name}</span>
            <span className="text-base shrink-0">{flagFor(m.home_team_name)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(m.finished || m.status === "live") ? (
            <div className="text-3xl font-black tabular-nums">
              {m.home_score ?? 0}<span className="text-[var(--muted)] mx-1">–</span>{m.away_score ?? 0}
            </div>
          ) : (
            <>
              <input
                className="score-input" type="number" min={0} max={30} inputMode="numeric"
                value={home} onChange={(e) => setHome(e.target.value)}
                disabled={!canPredict}
              />
              <span className="text-[var(--muted)] font-bold">–</span>
              <input
                className="score-input" type="number" min={0} max={30} inputMode="numeric"
                value={away} onChange={(e) => setAway(e.target.value)}
                disabled={!canPredict}
              />
            </>
          )}
        </div>
        <div className="flex-1">
          <div className="font-bold leading-tight flex items-center gap-1.5">
            <span className="text-base shrink-0">{flagFor(m.away_team_name)}</span>
            <span className="truncate">{m.away_team_name}</span>
          </div>
        </div>
      </div>

      {pred && (
        <div className="text-[11px] text-[var(--muted)] flex items-center justify-between">
          <span>Tu pick: <b className="text-[var(--text)] tabular-nums">{pred.pred_home}–{pred.pred_away}</b></span>
          {pickPoints != null && m.finished && (
            <span className={`font-bold ${pickPoints > 0 ? "text-green-400" : "text-red-400"}`}>
              {pickPoints > 0 ? `+${pickPoints} pts` : "0 pts"}
            </span>
          )}
        </div>
      )}

      {canPredict && (
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !home || !away} className="btn-primary flex-1 py-2 text-sm">
            {saving ? "Guardando…" : pred ? "Actualizar pronóstico" : "Guardar pronóstico"}
          </button>
          {savedOk && <span className="text-green-400 text-xs font-bold">✓ Guardado</span>}
        </div>
      )}
      {showPredictionsBtn && (
        <button onClick={onOpenPredictions} className="btn-ghost w-full py-2 text-sm">
          👀 Ver pronósticos de todos
        </button>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

function CountdownBadge({ kickoff }: { kickoff: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  const lockAt = kickoff.getTime() - LOCK_BEFORE_MS;
  const ms = lockAt - now;
  if (ms <= 0) return <span className="badge badge-locked">🔒 Cerrado</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const label = h >= 24 ? `Cierra en ${Math.floor(h / 24)}d ${h % 24}h`
    : h > 0 ? `Cierra en ${h}h ${m}m`
    : `Cierra en ${m}m`;
  return <span className="badge badge-soon">{label}</span>;
}
