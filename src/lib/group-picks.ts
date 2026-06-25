// Pronósticos de grupos: predecir 1ro, 2do, y opcionalmente cuál equipo del
// grupo clasificará como mejor 3er lugar (o "ninguno"). Se evalúa al cierre
// de la fase de grupos.

import { supabase } from "./supabase";
import { computeGroupResults, type Match } from "./standings";

export type GroupPick = {
  user_id: string;
  group_letter: string;
  first_team: string;
  second_team: string;
  third_qualifier_team: string | null; // null = el usuario apuesta que NINGUNO del grupo clasifica como mejor 3ro
  points: number;
  updated_at?: string;
};

// Puntos por grupo (no se duplican en eliminatorias porque son sólo de la fase de grupos).
// Diseño que NO demerita los puntos del round-robin: máximo 12 pts por grupo
// (5 + 3 + 4) vs ~10 puntos típicos de los 3 partidos jugados.
export const GROUP_PICK_POINTS = {
  FIRST: 5,         // 1ro acertado
  SECOND: 3,        // 2do acertado
  THIRD_TEAM: 4,    // adivinó EL equipo y SÍ clasificó
  THIRD_NONE: 4,    // dijo "ninguno clasifica" y efectivamente ninguno del grupo clasificó
  THIRD_PARTIAL: 1, // dijo un equipo del grupo, ese no clasificó pero otro del grupo SÍ (o viceversa: dijo ninguno y clasificó uno) — pequeño consuelo
} as const;

export function scoreGroupPick(
  pick: { first_team: string; second_team: string; third_qualifier_team: string | null },
  result: { first: string; second: string; thirds: { team: string }[] },
  bestThirds: string[],
): number {
  let pts = 0;
  if (pick.first_team === result.first) pts += GROUP_PICK_POINTS.FIRST;
  if (pick.second_team === result.second) pts += GROUP_PICK_POINTS.SECOND;

  const thirdTeam = result.thirds[0]?.team;
  const groupHadQualifier = thirdTeam ? bestThirds.includes(thirdTeam) : false;

  if (pick.third_qualifier_team == null) {
    // Pick: "ninguno del grupo clasifica como mejor 3ro"
    if (!groupHadQualifier) pts += GROUP_PICK_POINTS.THIRD_NONE;
  } else {
    // Pick: un equipo específico clasifica como mejor 3ro
    if (groupHadQualifier && pick.third_qualifier_team === thirdTeam) {
      pts += GROUP_PICK_POINTS.THIRD_TEAM;
    } else if (groupHadQualifier && pick.third_qualifier_team !== thirdTeam) {
      // El usuario nombró a un equipo del grupo, pero el real 3ro fue otro (y sí clasificó):
      // Le damos consuelo si su equipo nombrado terminó en posición 3 o 4 del grupo.
      // Simplificación: si nombró cualquier equipo del grupo y SÍ hubo clasificación, +1 pt.
      pts += GROUP_PICK_POINTS.THIRD_PARTIAL;
    }
  }
  return pts;
}

export async function fetchMyGroupPicks(userId: string): Promise<Map<string, GroupPick>> {
  const { data } = await supabase
    .from("ed26_calicas_group_picks")
    .select("*")
    .eq("user_id", userId);
  const map = new Map<string, GroupPick>();
  for (const r of (data as GroupPick[]) ?? []) map.set(r.group_letter, r);
  return map;
}

export async function fetchAllGroupPicks(): Promise<GroupPick[]> {
  const { data } = await supabase
    .from("ed26_calicas_group_picks")
    .select("*");
  return (data as GroupPick[]) ?? [];
}

export async function saveGroupPick(p: {
  user_id: string; group_letter: string;
  first_team: string; second_team: string; third_qualifier_team: string | null;
}): Promise<{ error?: string }> {
  if (!p.first_team || !p.second_team) return { error: "Selecciona 1ro y 2do." };
  if (p.first_team === p.second_team) return { error: "El 1ro y el 2do no pueden ser el mismo equipo." };
  if (p.third_qualifier_team && (p.third_qualifier_team === p.first_team || p.third_qualifier_team === p.second_team)) {
    return { error: "El 3ro debe ser distinto del 1ro y 2do." };
  }
  const { error } = await supabase
    .from("ed26_calicas_group_picks")
    .upsert({
      user_id: p.user_id,
      group_letter: p.group_letter,
      first_team: p.first_team,
      second_team: p.second_team,
      third_qualifier_team: p.third_qualifier_team,
      points: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,group_letter" });
  if (error) return { error: error.message };
  return {};
}

// Determina si el grupo ya está cerrado para pronósticos.
// Cierre = inicio de los últimos 2 partidos (matchday 3) − 30 min.
export function isGroupLocked(matches: Match[], group: string, lockBeforeMs = 30 * 60 * 1000): boolean {
  const groupMatches = matches.filter((m) => m.group_letter === group && m.phase === "group" && m.kickoff_utc);
  if (groupMatches.length === 0) return false;
  const maxMd = Math.max(...groupMatches.map((m) => m.matchday ?? 0));
  if (maxMd === 0) return false;
  const lastRound = groupMatches.filter((m) => (m.matchday ?? 0) === maxMd);
  const lockTime = Math.min(...lastRound.map((m) => new Date(m.kickoff_utc as string).getTime()));
  return Date.now() >= lockTime - lockBeforeMs;
}

// Re-evalúa todos los group_picks cuando la fase de grupos terminó.
// Se llama desde /api/sync.
export function computeAllGroupPickPoints(picks: GroupPick[], matches: Match[]): { id: { user_id: string; group: string }, points: number }[] {
  const { groups, bestThirds } = computeGroupResults(matches);
  const out: { id: { user_id: string; group: string }, points: number }[] = [];
  for (const p of picks) {
    const result = groups.get(p.group_letter);
    if (!result) { out.push({ id: { user_id: p.user_id, group: p.group_letter }, points: 0 }); continue; }
    const pts = scoreGroupPick(p, result, bestThirds);
    out.push({ id: { user_id: p.user_id, group: p.group_letter }, points: pts });
  }
  return out;
}
