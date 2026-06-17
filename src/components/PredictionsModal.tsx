"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCR } from "@/lib/time";
import { scorePrediction } from "@/lib/scoring";
import { flagFor } from "@/lib/flags";
import { ClanFilter } from "@/components/ClanFilter";
import { fetchUserClans, fetchClanMembers, type ClanMembership } from "@/lib/clans";
import { getLocalUser } from "@/lib/session";

type Match = {
  id: string; home_team_name: string; away_team_name: string;
  home_score: number | null; away_score: number | null;
  phase: string; finished: boolean; status: string; kickoff_utc: string | null;
};

type PredRow = {
  user_id: string; pred_home: number; pred_away: number; points: number;
  ed26_calicas_users: { display_name: string; avatar_emoji: string } | null;
};

export function PredictionsModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const [rows, setRows] = useState<PredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clans, setClans] = useState<ClanMembership[]>([]);
  const [clanFilter, setClanFilter] = useState<string>("all");
  const [clanMembers, setClanMembers] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const me = getLocalUser();
    if (!me) return;
    fetchUserClans(me.id).then(setClans);
    fetchClanMembers().then(setClanMembers);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data } = await supabase
        .from("ed26_calicas_predictions")
        .select("user_id, pred_home, pred_away, points, ed26_calicas_users(display_name, avatar_emoji)")
        .eq("match_id", match.id);
      if (!alive) return;
      const list = ((data ?? []) as unknown as PredRow[]).slice();
      // ordenar: puntos desc, luego nombre
      list.sort((a, b) => (b.points ?? 0) - (a.points ?? 0)
        || (a.ed26_calicas_users?.display_name ?? "").localeCompare(b.ed26_calicas_users?.display_name ?? ""));
      setRows(list);
      setLoading(false);
    }
    load();

    const ch = supabase.channel(`calicas-modal-${match.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "ed26_calicas_predictions",
        filter: `match_id=eq.${match.id}`,
      }, () => load())
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [match.id]);

  const liveOrFinished = match.status === "live" || match.finished;
  const realHome = match.home_score ?? 0;
  const realAway = match.away_score ?? 0;

  // Si el partido está en vivo, calculamos puntos "provisionales" con el resultado actual.
  const provisional = useMemo(() => {
    let list = rows.map((r) => {
      const pts = liveOrFinished
        ? scorePrediction(r.pred_home, r.pred_away, realHome, realAway, match.phase, true)
        : 0;
      return { ...r, _pts: match.finished ? r.points : pts };
    }).sort((a, b) => b._pts - a._pts);
    if (clanFilter !== "all") {
      const allowed = clanMembers.get(clanFilter) ?? new Set<string>();
      list = list.filter((r) => allowed.has(r.user_id));
    }
    return list;
  }, [rows, liveOrFinished, realHome, realAway, match.phase, match.finished, clanFilter, clanMembers]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
         onClick={onClose}>
      <div className="card w-full max-w-md max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="csh-stripe h-1.5 w-full" />
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {match.status === "live" ? "🔴 EN VIVO" : match.finished ? "✓ TERMINADO" : ""}
            </div>
            <div className="font-black flex items-center gap-1.5 flex-wrap">
              <span>{flagFor(match.home_team_name)}</span>
              <span>{match.home_team_name}</span>
              <span className="text-[var(--muted)]">vs</span>
              <span>{flagFor(match.away_team_name)}</span>
              <span>{match.away_team_name}</span>
            </div>
            <div className="text-3xl font-black tabular-nums mt-1">
              {realHome}<span className="text-[var(--muted)] mx-2">–</span>{realAway}
            </div>
            {match.kickoff_utc && (
              <div className="text-[11px] text-[var(--muted)] mt-1">{formatCR(match.kickoff_utc)} CR</div>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost text-sm py-1 px-3">✕</button>
        </div>

        {clans.length > 0 && (
          <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
            <ClanFilter clans={clans} value={clanFilter} onChange={setClanFilter} label="Ver picks de" />
            <span className="text-[10px] text-[var(--muted)] tabular-nums">{provisional.length} jugadores</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-2">
          {loading && <div className="p-4 text-sm text-[var(--muted)] text-center">Cargando…</div>}
          {!loading && provisional.length === 0 && (
            <div className="p-6 text-center text-sm text-[var(--muted)]">
              Nadie pronosticó este partido 😴
            </div>
          )}
          {!loading && provisional.map((r) => {
            const exact = liveOrFinished && r.pred_home === realHome && r.pred_away === realAway;
            const points = r._pts;
            return (
              <div key={r.user_id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${exact ? "bg-[rgba(0,166,81,0.10)] border border-green-500/30" : ""}`}>
                <div className="text-2xl">{r.ed26_calicas_users?.avatar_emoji ?? "⚽"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">
                    {r.ed26_calicas_users?.display_name ?? "Anónimo"}
                    {exact && <span className="ml-1.5 text-[10px] text-green-400 font-black">EXACTO 🎯</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">Pronóstico</div>
                </div>
                <div className="text-xl font-black tabular-nums text-csh-yellow">
                  {r.pred_home}–{r.pred_away}
                </div>
                {liveOrFinished && (
                  <div className={`min-w-[3.5rem] text-right text-xs font-black ${
                    points >= 5 ? "text-green-400" : points > 0 ? "text-yellow-400" : "text-[var(--muted)]"
                  }`}>
                    {points > 0 ? `+${points}` : "0"} pts
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {match.status === "live" && (
          <div className="px-4 py-2 text-[10px] text-[var(--muted)] text-center border-t border-[var(--border)]">
            Puntos provisionales — se actualizarán cuando termine el partido.
          </div>
        )}
      </div>
    </div>
  );
}
