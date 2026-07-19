"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import { formatCR } from "@/lib/time";
import { PHASE_LABELS } from "@/lib/scoring";
import { PredictionsModal } from "@/components/PredictionsModal";
import { flagFor } from "@/lib/flags";

type Match = {
  id: string; home_team_name: string; away_team_name: string;
  home_score: number | null; away_score: number | null;
  phase: string; matchday: number | null; group_letter: string | null;
  kickoff_utc: string | null; finished: boolean; status: string;
};
type Pred = { match_id: string; pred_home: number; pred_away: number; points: number };

export default function Dashboard() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [preds, setPreds] = useState<Pred[]>([]);
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<{ rank: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const u = getLocalUser();
    if (!u) return;
    setLoading(true);

    const [{ data: ms }, { data: ps }, { data: lb }] = await Promise.all([
      supabase.from("ed26_calicas_matches")
        .select("id, home_team_name, away_team_name, home_score, away_score, phase, matchday, group_letter, kickoff_utc, finished, status")
        .order("kickoff_utc", { ascending: true }),
      supabase.from("ed26_calicas_predictions")
        .select("match_id, pred_home, pred_away, points")
        .eq("user_id", u.id),
      supabase.from("ed26_calicas_leaderboard")
        .select("user_id, total_points")
        .order("total_points", { ascending: false }),
    ]);

    setMatches((ms as Match[]) ?? []);
    setPreds((ps as Pred[]) ?? []);
    if (lb) {
      const idx = lb.findIndex((r) => r.user_id === u.id);
      const me = lb.find((r) => r.user_id === u.id);
      setMyPoints(me?.total_points ?? 0);
      setMyRank(idx >= 0 ? { rank: idx + 1, total: lb.length } : null);
    }
    setLoading(false);
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { cache: "no-store" });
      setLastSync(new Date());
      await load();
    } finally { setSyncing(false); }
  }, [load]);

  useEffect(() => {
    load();
    triggerSync();

    const ch = supabase.channel("calicas-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_matches" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_predictions" }, () => load())
      .subscribe();

    const interval = setInterval(triggerSync, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [load, triggerSync]);

  const now = Date.now();
  const upcoming = useMemo(() =>
    matches.filter((m) => m.kickoff_utc && new Date(m.kickoff_utc).getTime() > now)
      .slice(0, 5), [matches, now]);
  const live = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);
  const recent = useMemo(() =>
    matches.filter((m) => m.finished).slice(-3).reverse(), [matches]);

  const predMap = useMemo(() => new Map(preds.map((p) => [p.match_id, p])), [preds]);
  const acertados = preds.filter((p) => p.points > 0).length;

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Mi Quiniela</div>
          <button onClick={triggerSync} disabled={syncing}
            className="btn-ghost text-[11px] py-1.5 px-2.5 flex items-center gap-1.5">
            <span className={syncing ? "animate-spin inline-block" : ""}>🔄</span>
            <span>{syncing ? "Sincronizando" : "Actualizar"}</span>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <Stat title="Puntos" value={myPoints ?? "—"} accent />
          <Stat title="Ranking" value={myRank ? `#${myRank.rank}/${myRank.total}` : "—"} />
          <Stat title="Aciertos" value={acertados} />
        </div>
        {lastSync && (
          <p className="mt-3 text-[10px] text-[var(--muted)] text-right">
            Última actualización: {formatCR(lastSync, { hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: undefined, day: undefined, month: undefined })}
          </p>
        )}
      </section>

      <FinalBonusBanner />

      {live.length > 0 && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="dot-live" /> En vivo
          </h2>
          <div className="space-y-2">
            {live.map((m) => <MatchPreview key={m.id} m={m} pred={predMap.get(m.id)} onOpen={() => setOpenMatch(m)} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-black uppercase tracking-widest mb-2 text-[var(--muted)]">Próximos partidos</h2>
        <div className="space-y-2">
          {loading && <div className="text-sm text-[var(--muted)]">Cargando partidos…</div>}
          {!loading && upcoming.length === 0 && <div className="text-sm text-[var(--muted)]">Sin partidos pendientes 🎉</div>}
          {upcoming.map((m) => <MatchPreview key={m.id} m={m} pred={predMap.get(m.id)} />)}
        </div>
        <Link href="/matches" className="btn-ghost mt-3 w-full text-center block">Ver todos los partidos →</Link>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest mb-2 text-[var(--muted)]">Resultados recientes</h2>
          <div className="space-y-2">
            {recent.map((m) => <MatchPreview key={m.id} m={m} pred={predMap.get(m.id)} onOpen={() => setOpenMatch(m)} />)}
          </div>
        </section>
      )}

      {openMatch && <PredictionsModal match={openMatch} onClose={() => setOpenMatch(null)} />}
    </div>
  );
}

function FinalBonusBanner() {
  const KICK_MS = Date.UTC(2026, 6, 19, 19, 0, 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const diff = KICK_MS - now;
  if (diff < -3 * 60 * 60 * 1000) return null;
  const locked = diff <= 0;
  const days = Math.max(0, Math.floor(diff / 86400000));
  const hrs = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const mins = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const secs = Math.max(0, Math.floor((diff % 60000) / 1000));
  return (
    <Link href="/final" className="block rounded-xl overflow-hidden border-2 border-csh-yellow active:scale-[0.99] transition"
      style={{ background: "linear-gradient(135deg, rgba(207,20,43,0.35), rgba(255,212,0,0.25))" }}>
      <div className="csh-stripe h-1" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black tracking-widest text-csh-yellow">🏆 BONUS FINAL</div>
            <div className="text-base font-black mt-0.5">185 puntos extra en juego</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">🇪🇸 España vs Argentina 🇦🇷 · 19 jul · 13:00 CR</div>
          </div>
          <div className="text-right">
            {locked
              ? <div className="text-[10px] font-black text-csh-red">🔒 CERRADO</div>
              : <>
                  <div className="text-[9px] font-bold tracking-widest text-[var(--muted)]">CIERRA EN</div>
                  <div className="text-xl font-black tabular-nums">
                    {days > 0 ? `${days}d ${hrs}h` : `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}
                  </div>
                </>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stat({ title, value, accent }: { title: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center border ${accent ? "border-csh-yellow/40 bg-[rgba(255,212,0,0.08)]" : "border-[var(--border)] bg-[rgba(255,255,255,0.03)]"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{title}</div>
      <div className={`text-2xl font-black mt-0.5 ${accent ? "text-csh-yellow" : ""}`}>{value}</div>
    </div>
  );
}

function MatchPreview({ m, pred, onOpen }: { m: Match; pred?: Pred; onOpen?: () => void }) {
  const kickoff = m.kickoff_utc ? new Date(m.kickoff_utc) : null;
  const phase = PHASE_LABELS[m.phase] ?? m.phase;
  const isLive = m.status === "live";
  const clickable = onOpen && (isLive || m.finished);

  const content = (
    <>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex gap-1.5 items-center">
          <span>{phase}</span>
          {m.group_letter && <span className="text-csh-yellow">· Grupo {m.group_letter}</span>}
          {isLive && <span className="badge badge-live ml-1"><span className="dot-live" />LIVE</span>}
        </div>
        <div className="font-bold truncate flex items-center gap-1">
          <span className="shrink-0">{flagFor(m.home_team_name)}</span>
          <span className="truncate">{m.home_team_name}</span>
          <span className="text-[var(--muted)]">vs</span>
          <span className="shrink-0">{flagFor(m.away_team_name)}</span>
          <span className="truncate">{m.away_team_name}</span>
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5">
          {kickoff ? formatCR(kickoff) : "—"} CR
        </div>
      </div>
      <div className="text-right">
        {m.finished || isLive ? (
          <div className="text-2xl font-black tabular-nums">
            {m.home_score ?? 0}–{m.away_score ?? 0}
          </div>
        ) : pred ? (
          <div>
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Tu pick</div>
            <div className="text-xl font-black tabular-nums text-csh-yellow">{pred.pred_home}–{pred.pred_away}</div>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--muted)]">Pronosticar →</div>
        )}
        {pred && m.finished && (
          <div className={`text-[10px] mt-1 font-bold ${pred.points > 0 ? "text-green-400" : "text-red-400"}`}>
            {pred.points > 0 ? `+${pred.points} pts` : "0 pts"}
          </div>
        )}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button onClick={onOpen} className="card p-3 flex items-center justify-between gap-3 active:scale-[0.99] transition w-full text-left">
        {content}
      </button>
    );
  }
  return (
    <Link href="/matches" className="card p-3 flex items-center justify-between gap-3 active:scale-[0.99] transition">
      {content}
    </Link>
  );
}
