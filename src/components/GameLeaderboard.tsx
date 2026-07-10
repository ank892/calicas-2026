"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LEVELS } from "@/lib/game/levels";

type ScoreRow = {
  user_id: string;
  level: number;
  score: number;
  time_ms: number;
  completed: boolean;
};

type UserMin = { id: string; display_name: string; avatar_emoji: string };

type BestByUser = {
  user_id: string;
  total: number;
  bestScoreByLevel: Record<number, number>;
  bestTimeByLevel: Record<number, number>;
  wonLevels: number;
};

type Tab = "total" | "level1" | "level2" | "level3";

export function GameLeaderboard({ users, meId }: { users: Map<string, UserMin>; meId?: string }) {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [tab, setTab] = useState<Tab>("total");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("ed26_calicas_game_scores")
      .select("user_id, level, score, time_ms, completed");
    setScores((data ?? []) as ScoreRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("calicas-game-lb")
      .on("postgres_changes", { event: "*", schema: "public", table: "ed26_calicas_game_scores" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const byUser = new Map<string, BestByUser>();
  for (const s of scores) {
    let u = byUser.get(s.user_id);
    if (!u) {
      u = { user_id: s.user_id, total: 0, bestScoreByLevel: {}, bestTimeByLevel: {}, wonLevels: 0 };
      byUser.set(s.user_id, u);
    }
    const prev = u.bestScoreByLevel[s.level] ?? 0;
    if (s.score > prev) u.bestScoreByLevel[s.level] = s.score;
    if (s.completed) {
      const pt = u.bestTimeByLevel[s.level];
      if (pt === undefined || s.time_ms < pt) u.bestTimeByLevel[s.level] = s.time_ms;
    }
  }
  for (const u of byUser.values()) {
    u.total = Object.values(u.bestScoreByLevel).reduce((a, b) => a + b, 0);
    u.wonLevels = Object.keys(u.bestTimeByLevel).length;
  }

  const list = [...byUser.values()];
  let sorted: BestByUser[];
  if (tab === "total") {
    sorted = list.sort((a, b) => b.total - a.total || b.wonLevels - a.wonLevels).slice(0, 20);
  } else {
    const lv = tab === "level1" ? 1 : tab === "level2" ? 2 : 3;
    // Sort por mejor tiempo si terminó; sino por mejor score
    sorted = list
      .filter((u) => (u.bestScoreByLevel[lv] ?? 0) > 0)
      .sort((a, b) => {
        const ta = a.bestTimeByLevel[lv], tb = b.bestTimeByLevel[lv];
        if (ta !== undefined && tb !== undefined) return ta - tb;
        if (ta !== undefined) return -1;
        if (tb !== undefined) return 1;
        return (b.bestScoreByLevel[lv] ?? 0) - (a.bestScoreByLevel[lv] ?? 0);
      })
      .slice(0, 20);
  }

  if (loading) return <div className="card p-4 text-xs text-[var(--muted)]">Cargando…</div>;
  if (sorted.length === 0) {
    return (
      <div className="card p-4 text-xs text-[var(--muted)]">
        Todavía nadie ha jugado. ¡Sé el primero en ir por Rosabal!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {(["total", "level1", "level2", "level3"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${tab === t ? "bg-csh-red text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}
          >
            {t === "total" ? "🏆 Total" : `Nivel ${t.slice(-1)}`}
          </button>
        ))}
      </div>

      <div className="card p-2 divide-y divide-[var(--border)]">
        {sorted.map((row, i) => {
          const u = users.get(row.user_id);
          const isMe = row.user_id === meId;
          const lv = tab === "total" ? null : (tab === "level1" ? 1 : tab === "level2" ? 2 : 3);
          const score = lv ? (row.bestScoreByLevel[lv] ?? 0) : row.total;
          const time = lv ? row.bestTimeByLevel[lv] : undefined;
          const targetT = lv ? LEVELS[lv - 1]?.targetTime : undefined;
          const beat = time !== undefined && targetT !== undefined && time / 1000 <= targetT;
          return (
            <div key={row.user_id} className={`flex items-center gap-2 py-2 px-1 ${isMe ? "bg-csh-yellow/10 rounded-md" : ""}`}>
              <div className={`w-6 text-center font-black tabular-nums text-sm ${i < 3 ? "text-csh-yellow" : "text-[var(--muted)]"}`}>
                {i + 1}
              </div>
              <div className="text-lg flex-shrink-0">{u?.avatar_emoji ?? "🎮"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {u?.display_name ?? "Usuario"}{isMe && " ★"}
                </div>
                {lv !== null && (
                  <div className="text-[10px] text-[var(--muted)]">
                    {time !== undefined ? (
                      <span className={beat ? "text-csh-yellow font-bold" : ""}>
                        ⏱ {(time / 1000).toFixed(1)}s{beat && " ⚡"}
                      </span>
                    ) : (
                      "Nivel no terminado"
                    )}
                  </div>
                )}
                {lv === null && (
                  <div className="text-[10px] text-[var(--muted)]">
                    {row.wonLevels}/{LEVELS.length} niveles superados
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-csh-yellow tabular-nums">{score}</div>
                <div className="text-[9px] text-[var(--muted)] uppercase">pts</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-[var(--muted)] text-center">
        Los puntos del minijuego no suman a la Tabla acumulada.
      </div>
    </div>
  );
}
