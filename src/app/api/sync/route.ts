import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchGames, normalizePhase, parseFinished, parseScore, normalizeStatus,
} from "@/lib/worldcup-api";
import { parseKickoffToUTC } from "@/lib/time";
import { scorePrediction } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El sync se ejecuta:
//  - vía cron de Vercel cada 5 minutos
//  - on-demand desde el dashboard cuando el usuario pulla
//
// Usa sólo la anon key porque las RLS están abiertas; si más adelante quieres
// endurecer, agrega SUPABASE_SERVICE_ROLE_KEY como variable de entorno y úsala
// preferentemente.
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  return doSync();
}

export async function POST() {
  return doSync();
}

async function doSync() {
  const sb = getServerSupabase();
  try {
    const games = await fetchGames();

    // 1) UPSERT cache de partidos
    const rows = games.map((g) => {
      const phase = normalizePhase(g.type);
      const kickoff_utc = parseKickoffToUTC(g.local_date, g.stadium_id);
      const finished = parseFinished(g.finished);
      return {
        id: String(g.id),
        home_team_name: g.home_team_name_en,
        away_team_name: g.away_team_name_en,
        home_team_id: g.home_team_id,
        away_team_id: g.away_team_id,
        home_score: parseScore(g.home_score),
        away_score: parseScore(g.away_score),
        group_letter: g.group ?? null,
        matchday: Number(g.matchday) || null,
        phase,
        stadium_id: g.stadium_id,
        kickoff_local: g.local_date,
        kickoff_utc: kickoff_utc ? kickoff_utc.toISOString() : null,
        finished,
        status: normalizeStatus(g.time_elapsed, finished),
        last_synced: new Date().toISOString(),
      };
    });

    // Supabase max ~1000 rows por batch; 104 partidos cabe sin problema.
    const { error: upErr } = await sb.from("ed26_calicas_matches").upsert(rows, { onConflict: "id" });
    if (upErr) throw upErr;

    // 2) Recalcular puntos de pronósticos para partidos terminados
    const finishedMatches = rows.filter((r) => r.finished && r.home_score != null && r.away_score != null);
    let updatedPredictions = 0;

    if (finishedMatches.length) {
      const matchIds = finishedMatches.map((m) => m.id);
      const { data: preds, error: pErr } = await sb
        .from("ed26_calicas_predictions")
        .select("id, match_id, pred_home, pred_away, points")
        .in("match_id", matchIds);
      if (pErr) throw pErr;

      const byId = new Map(finishedMatches.map((m) => [m.id, m]));
      const updates: { id: string; points: number }[] = [];
      for (const p of preds ?? []) {
        const m = byId.get(p.match_id);
        if (!m) continue;
        const newPoints = scorePrediction(
          p.pred_home, p.pred_away,
          m.home_score, m.away_score, m.phase, m.finished
        );
        if (newPoints !== p.points) updates.push({ id: p.id, points: newPoints });
      }
      // Update fila por fila con upsert (Supabase no soporta bulk-update por columnas distintas).
      for (const u of updates) {
        await sb.from("ed26_calicas_predictions").update({ points: u.points }).eq("id", u.id);
      }
      updatedPredictions = updates.length;
    }

    // 3) Calcular ganadores por fase para fases ya cerradas
    await refreshPhaseWinners(sb);

    return NextResponse.json({
      ok: true,
      synced_matches: rows.length,
      updated_predictions: updatedPredictions,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[sync] error", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function refreshPhaseWinners(sb: ReturnType<typeof getServerSupabase>) {
  const { data: matches } = await sb
    .from("ed26_calicas_matches")
    .select("phase, finished");
  if (!matches) return;

  const byPhase = new Map<string, { total: number; finished: number }>();
  for (const m of matches) {
    const cur = byPhase.get(m.phase) ?? { total: 0, finished: 0 };
    cur.total += 1; if (m.finished) cur.finished += 1;
    byPhase.set(m.phase, cur);
  }
  const closedPhases = [...byPhase.entries()]
    .filter(([, v]) => v.total > 0 && v.total === v.finished)
    .map(([p]) => p);

  for (const phase of closedPhases) {
    const { data: phaseMatches } = await sb
      .from("ed26_calicas_matches").select("id").eq("phase", phase);
    if (!phaseMatches?.length) continue;

    const { data: preds } = await sb
      .from("ed26_calicas_predictions")
      .select("user_id, points")
      .in("match_id", phaseMatches.map((m) => m.id));
    if (!preds?.length) continue;

    const totals = new Map<string, number>();
    for (const p of preds) totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + (p.points || 0));
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0]; if (!top || top[1] <= 0) continue;
    const winners = sorted.filter(([, pts]) => pts === top[1]); // empates incluídos

    await sb.from("ed26_calicas_phase_winners").delete().eq("phase", phase);
    if (winners.length) {
      await sb.from("ed26_calicas_phase_winners").insert(
        winners.map(([user_id, points]) => ({ phase, user_id, points }))
      );
    }
  }
}
