"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeGroupStandings, matchesOfGroup, teamRecentMatches, type Match, type StandingRow } from "@/lib/standings";
import { formatCR } from "@/lib/time";
import { flagFor } from "@/lib/flags";

// Muestra la tabla del grupo + últimos resultados de los dos equipos del partido.
export function StandingsModal({ group, homeTeam, awayTeam, onClose }: {
  group: string;
  homeTeam?: string;
  awayTeam?: string;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusTeam, setFocusTeam] = useState<string | undefined>(homeTeam);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("ed26_calicas_matches")
        .select("id, home_team_name, away_team_name, home_score, away_score, phase, matchday, group_letter, kickoff_utc, finished, status")
        .order("kickoff_utc", { ascending: true });
      if (!alive) return;
      setMatches((data as Match[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const standings: StandingRow[] = computeGroupStandings(matches, group);
  const groupMatches = matchesOfGroup(matches, group);
  const focusRecent = focusTeam ? teamRecentMatches(matches, focusTeam, 5) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="csh-stripe h-1.5 w-full" />
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Grupo</div>
            <div className="text-lg font-black">Grupo {group}</div>
          </div>
          <button onClick={onClose} className="btn-ghost text-sm py-1 px-3">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && <div className="p-4 text-sm text-[var(--muted)] text-center">Cargando…</div>}

          {!loading && (
            <>
              <div className="px-3 pt-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-csh-yellow mb-1.5">📊 Posiciones</div>
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[1.4rem_1fr_1.6rem_1.6rem_1.6rem_2rem] gap-1 px-2 py-1.5 text-[9px] font-bold uppercase text-[var(--muted)] border-b border-[var(--border)]">
                    <div>#</div><div>Equipo</div><div className="text-center">PJ</div><div className="text-center">DG</div><div className="text-center">GF</div><div className="text-center">Pts</div>
                  </div>
                  {standings.map((r, i) => {
                    const focused = focusTeam === r.team;
                    const qualifies = i < 2;
                    return (
                      <button key={r.team} onClick={() => setFocusTeam(r.team)}
                        className={`grid grid-cols-[1.4rem_1fr_1.6rem_1.6rem_1.6rem_2rem] gap-1 px-2 py-1.5 items-center text-xs border-b border-[var(--border)] last:border-b-0 w-full text-left ${focused ? "bg-[rgba(255,212,0,0.10)]" : ""}`}>
                        <div className={`font-black tabular-nums ${qualifies ? "text-csh-yellow" : i === 2 ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{i + 1}</div>
                        <div className="flex items-center gap-1 truncate">
                          <span className="shrink-0">{flagFor(r.team)}</span>
                          <span className="truncate text-[11px]">{r.team}</span>
                        </div>
                        <div className="text-center tabular-nums text-[var(--muted)]">{r.played}</div>
                        <div className={`text-center tabular-nums ${r.gd > 0 ? "text-green-400" : r.gd < 0 ? "text-red-400" : "text-[var(--muted)]"}`}>{r.gd > 0 ? `+${r.gd}` : r.gd}</div>
                        <div className="text-center tabular-nums text-[var(--muted)]">{r.gf}</div>
                        <div className="text-center font-black tabular-nums text-csh-yellow">{r.points}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-1">🟡 = 1ro y 2do clasifican directo · 3ro puede entrar como mejor tercero.</div>
              </div>

              <div className="px-3 pt-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-csh-yellow mb-1.5">⚽ Partidos del grupo</div>
                <div className="space-y-1.5">
                  {groupMatches.map((m) => {
                    const played = m.finished || m.status === "live";
                    return (
                      <div key={m.id} className="card p-2 flex items-center gap-2 text-xs">
                        <div className="text-[10px] text-[var(--muted)] shrink-0 w-12">{m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleDateString("es-CR", { day: "2-digit", month: "short" }) : "—"}</div>
                        <div className="flex-1 flex items-center justify-end gap-1 truncate">
                          <span className="truncate">{m.home_team_name}</span><span>{flagFor(m.home_team_name)}</span>
                        </div>
                        <div className="font-black tabular-nums px-1 shrink-0">
                          {played ? `${m.home_score ?? 0}-${m.away_score ?? 0}` : "vs"}
                        </div>
                        <div className="flex-1 flex items-center gap-1 truncate">
                          <span>{flagFor(m.away_team_name)}</span><span className="truncate">{m.away_team_name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {focusTeam && focusRecent.length > 0 && (
                <div className="px-3 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-csh-yellow mb-1.5">
                    📜 Últimos resultados · {flagFor(focusTeam)} {focusTeam}
                  </div>
                  <div className="space-y-1.5">
                    {focusRecent.map((m) => {
                      const isHome = m.home_team_name === focusTeam;
                      const myScore = isHome ? m.home_score ?? 0 : m.away_score ?? 0;
                      const oppScore = isHome ? m.away_score ?? 0 : m.home_score ?? 0;
                      const opp = isHome ? m.away_team_name : m.home_team_name;
                      const result = myScore > oppScore ? "G" : myScore < oppScore ? "P" : "E";
                      return (
                        <div key={m.id} className="card p-2 flex items-center gap-2 text-xs">
                          <div className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                            result === "G" ? "bg-green-500/20 text-green-400" :
                            result === "P" ? "bg-red-500/20 text-red-400" :
                            "bg-yellow-500/20 text-yellow-400"
                          }`}>{result}</div>
                          <div className="text-[10px] text-[var(--muted)] shrink-0">{m.kickoff_utc ? formatCR(m.kickoff_utc, { hour: undefined, minute: undefined }) : "—"}</div>
                          <div className="flex-1 truncate">{isHome ? "vs " : "@ "}{flagFor(opp)} {opp}</div>
                          <div className="font-black tabular-nums">{myScore}-{oppScore}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!focusTeam && (homeTeam || awayTeam) && (
                <div className="px-3 py-3 text-[10px] text-[var(--muted)] text-center">
                  Tocá un equipo de la tabla para ver sus últimos resultados.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
