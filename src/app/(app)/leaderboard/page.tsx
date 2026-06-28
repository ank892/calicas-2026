"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLocalUser } from "@/lib/session";
import { PHASES, PHASE_LABELS } from "@/lib/scoring";
import { ClanFilter } from "@/components/ClanFilter";
import { fetchAllClans, fetchClanMembers, fetchUserClans, type Clan, type ClanMembership } from "@/lib/clans";

type Row = {
  user_id: string; display_name: string; avatar_emoji: string;
  total_points: number; exactos: number; parciales: number; resultados: number; fallos: number; predicciones_totales: number;
};
type Winner = { phase: string; user_id: string; points: number };
type UserMin = { id: string; display_name: string; avatar_emoji: string };
type PredRow = { user_id: string; points: number; ed26_calicas_matches: { phase: string } | null };
type GroupPickRow = { user_id: string; points: number };

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [users, setUsers] = useState<Map<string, UserMin>>(new Map());
  const [allClans, setAllClans] = useState<Clan[]>([]);
  const [myClans, setMyClans] = useState<ClanMembership[]>([]);
  const [clanMembers, setClanMembers] = useState<Map<string, Set<string>>>(new Map());
  const [clanFilter, setClanFilter] = useState<string>("all");
  const [phasePoints, setPhasePoints] = useState<Map<string, Map<string, number>>>(new Map());
  const [selectedPhase, setSelectedPhase] = useState<string>("group");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const me = getLocalUser();
    const [{ data: lb }, { data: w }, { data: us }, { data: preds }, { data: gpicks }, ac, cm, mc] = await Promise.all([
      supabase.from("ed26_calicas_leaderboard").select("*").order("total_points", { ascending: false }),
      supabase.from("ed26_calicas_phase_winners").select("phase, user_id, points"),
      supabase.from("ed26_calicas_users").select("id, display_name, avatar_emoji"),
      supabase.from("ed26_calicas_predictions").select("user_id, points, ed26_calicas_matches!inner(phase)"),
      supabase.from("ed26_calicas_group_picks").select("user_id, points"),
      fetchAllClans(),
      fetchClanMembers(),
      me ? fetchUserClans(me.id) : Promise.resolve([] as ClanMembership[]),
    ]);
    setRows((lb as Row[]) ?? []);
    setWinners((w as Winner[]) ?? []);
    setUsers(new Map(((us as UserMin[]) ?? []).map((u) => [u.id, u])));
    setAllClans(ac); setClanMembers(cm); setMyClans(mc);

    // Suma puntos por fase y por usuario (predictions + bonus de grupos)
    const pp = new Map<string, Map<string, number>>();
    for (const ph of PHASES) pp.set(ph, new Map());
    for (const p of ((preds as unknown as PredRow[]) ?? [])) {
      const ph = p.ed26_calicas_matches?.phase;
      if (!ph || !pp.has(ph)) continue;
      const m = pp.get(ph)!;
      m.set(p.user_id, (m.get(p.user_id) ?? 0) + (p.points ?? 0));
    }
    const groupMap = pp.get("group")!;
    for (const g of ((gpicks as GroupPickRow[]) ?? [])) {
      groupMap.set(g.user_id, (groupMap.get(g.user_id) ?? 0) + (g.points ?? 0));
    }
    setPhasePoints(pp);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("calicas-lb")
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_predictions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_phase_winners" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_group_picks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_clans" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_clan_members" }, () => load())
      .subscribe();
    const interval = setInterval(load, 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  const me = getLocalUser();

  // Filtra el leaderboard según el clan seleccionado
  const filteredRows = useMemo(() => {
    if (clanFilter === "all") return rows;
    const allowed = clanMembers.get(clanFilter) ?? new Set<string>();
    return rows.filter((r) => allowed.has(r.user_id));
  }, [rows, clanFilter, clanMembers]);

  const winnersByPhase = new Map<string, Winner[]>();
  for (const w of winners) {
    if (!winnersByPhase.has(w.phase)) winnersByPhase.set(w.phase, []);
    winnersByPhase.get(w.phase)!.push(w);
  }

  // Encuentro mi posición en la lista filtrada
  const myPosition = me ? filteredRows.findIndex((r) => r.user_id === me.id) + 1 : 0;
  const filterLabel = clanFilter === "all"
    ? "Todos los jugadores"
    : allClans.find((c) => c.id === clanFilter)?.name ?? "";

  // Batalla de clanes: por cada clan calcular total + promedio
  const clanBattle = useMemo(() => {
    const pointsByUser = new Map(rows.map((r) => [r.user_id, r.total_points]));
    return allClans.map((c) => {
      const memberIds = [...(clanMembers.get(c.id) ?? new Set<string>())];
      const memberCount = memberIds.length;
      const total = memberIds.reduce((s, uid) => s + (pointsByUser.get(uid) ?? 0), 0);
      const avg = memberCount > 0 ? total / memberCount : 0;
      const myClan = me ? memberIds.includes(me.id) : false;
      return { clan: c, memberCount, total, avg, myClan };
    }).filter((x) => x.memberCount > 0)
      .sort((a, b) => b.avg - a.avg || b.total - a.total);
  }, [allClans, clanMembers, rows, me]);

  // Tabla por fase: por cada fase, ordenar usuarios por puntos en esa fase.
  const phaseRows = useMemo(() => {
    const map = phasePoints.get(selectedPhase) ?? new Map<string, number>();
    const allowedClan = clanFilter === "all" ? null : (clanMembers.get(clanFilter) ?? new Set<string>());
    return rows
      .filter((r) => !allowedClan || allowedClan.has(r.user_id))
      .map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        avatar_emoji: r.avatar_emoji,
        points: map.get(r.user_id) ?? 0,
      }))
      .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name));
  }, [rows, phasePoints, selectedPhase, clanFilter, clanMembers]);

  const myPhasePosition = me ? phaseRows.findIndex((r) => r.user_id === me.id) + 1 : 0;
  const phaseHasPoints = phaseRows.some((r) => r.points > 0);

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-black uppercase tracking-widest">🏆 Tabla Acumulada</h2>
          {myClans.length > 0 && (
            <ClanFilter clans={myClans} value={clanFilter} onChange={setClanFilter} />
          )}
        </div>

        {clanFilter !== "all" && me && myPosition > 0 && (
          <div className="text-[11px] text-csh-yellow font-bold mb-2">
            🛡️ {filterLabel} · Tu posición: <b>#{myPosition}</b> de {filteredRows.length}
          </div>
        )}
        {clanFilter === "all" && me && myPosition > 0 && (
          <div className="text-[11px] text-[var(--muted)] mb-2">
            🌎 Tu posición global: <b className="text-csh-yellow">#{myPosition}</b> de {filteredRows.length}
          </div>
        )}

        {loading && <div className="text-sm text-[var(--muted)]">Cargando…</div>}
        <div className="card overflow-hidden">
          {filteredRows.map((r, i) => {
            const isMe = me?.id === r.user_id;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
            return (
              <div key={r.user_id}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 ${isMe ? "bg-[rgba(255,212,0,0.08)]" : ""}`}>
                <div className={`w-8 text-center font-black tabular-nums ${i < 3 ? "text-csh-yellow" : "text-[var(--muted)]"}`}>
                  {medal || `#${i + 1}`}
                </div>
                <div className="text-2xl">{r.avatar_emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">
                    {r.display_name}{isMe && <span className="ml-2 text-[10px] text-csh-yellow">(tú)</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    🎯 {r.exactos} · ✅ {r.parciales + r.resultados} · ❌ {r.fallos}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-csh-yellow tabular-nums">{r.total_points}</div>
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">pts</div>
                </div>
              </div>
            );
          })}
          {!loading && filteredRows.length === 0 && (
            <div className="p-4 text-sm text-[var(--muted)] text-center">
              {clanFilter === "all" ? "Aún no hay participantes." : "Este clan no tiene miembros aún."}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-widest mb-2">📊 Tabla por Fase</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 mb-2 scrollbar-none">
          {PHASES.map((ph) => {
            const active = selectedPhase === ph;
            return (
              <button
                key={ph}
                onClick={() => setSelectedPhase(ph)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                  active
                    ? "bg-csh-red text-white border-csh-red"
                    : "bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                }`}
              >
                {PHASE_LABELS[ph]}
              </button>
            );
          })}
        </div>

        {clanFilter !== "all" && me && myPhasePosition > 0 && phaseHasPoints && (
          <div className="text-[11px] text-csh-yellow font-bold mb-2">
            🛡️ {filterLabel} · Tu posición en {PHASE_LABELS[selectedPhase]}: <b>#{myPhasePosition}</b>
          </div>
        )}
        {clanFilter === "all" && me && myPhasePosition > 0 && phaseHasPoints && (
          <div className="text-[11px] text-[var(--muted)] mb-2">
            🏁 Tu posición en {PHASE_LABELS[selectedPhase]}: <b className="text-csh-yellow">#{myPhasePosition}</b>
          </div>
        )}

        <div className="card overflow-hidden">
          {!phaseHasPoints && (
            <div className="p-4 text-sm text-[var(--muted)] text-center">
              Aún no se han otorgado puntos en {PHASE_LABELS[selectedPhase]}.
            </div>
          )}
          {phaseHasPoints && phaseRows.map((r, i) => {
            const isMe = me?.id === r.user_id;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
            return (
              <div key={r.user_id}
                className={`flex items-center gap-3 px-3 py-2 border-b border-[var(--border)] last:border-b-0 ${isMe ? "bg-[rgba(255,212,0,0.08)]" : ""}`}>
                <div className={`w-8 text-center font-black tabular-nums text-sm ${i < 3 ? "text-csh-yellow" : "text-[var(--muted)]"}`}>
                  {medal || `#${i + 1}`}
                </div>
                <div className="text-xl">{r.avatar_emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate text-sm">
                    {r.display_name}{isMe && <span className="ml-2 text-[10px] text-csh-yellow">(tú)</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-csh-yellow tabular-nums">{r.points}</div>
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">pts</div>
                </div>
              </div>
            );
          })}
        </div>
        {selectedPhase === "group" && (
          <div className="text-[10px] text-[var(--muted)] mt-1.5 px-1">
            Incluye los puntos de cada partido + el bonus por predecir 1ro/2do/mejor 3ro.
          </div>
        )}
      </section>

      <section>
        <div className="text-[11px] text-[var(--muted)] mb-2">
          Ranking por <b className="text-[var(--text)]">promedio de puntos por miembro</b> (normalizado), con el total como desempate.
        </div>
        <div className="card overflow-hidden">
          {clanBattle.length === 0 && (
            <div className="p-4 text-sm text-[var(--muted)] text-center">
              Aún no hay clanes con miembros. ¡Creá uno desde tu Perfil!
            </div>
          )}
          {clanBattle.map((row, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
            return (
              <div key={row.clan.id}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 ${row.myClan ? "bg-[rgba(255,212,0,0.08)]" : ""}`}>
                <div className={`w-8 text-center font-black tabular-nums ${i < 3 ? "text-csh-yellow" : "text-[var(--muted)]"}`}>
                  {medal || `#${i + 1}`}
                </div>
                <div className="text-2xl">{row.clan.emoji || "🛡️"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">
                    {row.clan.name}
                    {row.myClan && <span className="ml-2 text-[10px] text-csh-yellow">(tu clan)</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    👥 {row.memberCount} · Total {row.total} pts
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-csh-yellow tabular-nums">{row.avg.toFixed(1)}</div>
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">prom</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-widest mb-2">👑 Ganadores por Fase</h2>
        <div className="space-y-2">
          {PHASES.map((ph) => {
            const ws = winnersByPhase.get(ph) ?? [];
            return (
              <div key={ph} className="card p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">{PHASE_LABELS[ph]}</div>
                  {ws.length > 0 && <div className="text-xs text-csh-yellow font-bold">{ws[0].points} pts</div>}
                </div>
                {ws.length === 0 ? (
                  <div className="text-[11px] text-[var(--muted)] mt-1">Pendiente — la fase aún no termina.</div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ws.map((w) => {
                      const u = users.get(w.user_id);
                      return (
                        <div key={w.user_id} className="flex items-center gap-1.5 bg-[rgba(255,212,0,0.10)] border border-csh-yellow/40 rounded-full px-2.5 py-1 text-xs font-bold">
                          <span>{u?.avatar_emoji ?? "⭐"}</span>
                          <span>{u?.display_name ?? "Usuario"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4 text-[11px] text-[var(--muted)] leading-relaxed">
        <div className="font-bold text-[var(--text)] mb-1">📐 Cómo se puntúa</div>
        <ul className="space-y-1 list-disc pl-4">
          <li>🎯 Marcador exacto: <b>5 pts</b></li>
          <li>✅ Resultado correcto + un marcador acertado: <b>3 pts</b></li>
          <li>✅ Sólo resultado correcto (1 / X / 2): <b>2 pts</b></li>
          <li>❌ Errado: <b>0 pts</b></li>
          <li>🔥 En octavos en adelante los puntos se <b>duplican</b>.</li>
        </ul>
      </section>
    </div>
  );
}
