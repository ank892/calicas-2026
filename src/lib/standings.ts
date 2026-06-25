// Calcula la tabla de posiciones de un grupo a partir de los partidos.
// Reglas FIFA: 3 pts por victoria, 1 por empate. Desempate: pts → DG → GF → orden alfa.

export type Match = {
  id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  phase: string;
  group_letter: string | null;
  matchday: number | null;
  kickoff_utc: string | null;
  finished: boolean;
  status: string;
};

export type StandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export function computeGroupStandings(matches: Match[], group: string): StandingRow[] {
  const list = matches.filter((m) => m.phase === "group" && m.group_letter === group);
  const teams = new Set<string>();
  for (const m of list) {
    if (m.home_team_name) teams.add(m.home_team_name);
    if (m.away_team_name) teams.add(m.away_team_name);
  }
  const stats = new Map<string, StandingRow>();
  for (const t of teams) {
    stats.set(t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
  }
  for (const m of list) {
    if (!m.finished && m.status !== "live") continue;
    if (m.home_score == null || m.away_score == null) continue;
    const h = stats.get(m.home_team_name);
    const a = stats.get(m.away_team_name);
    if (!h || !a) continue;
    h.played += 1; a.played += 1;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) { h.won++; a.lost++; h.points += 3; }
    else if (m.home_score < m.away_score) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points += 1; a.points += 1; }
  }
  for (const r of stats.values()) r.gd = r.gf - r.ga;
  return [...stats.values()].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
}

// Lista de equipos del grupo (para usar como opciones en pronósticos).
export function teamsOfGroup(matches: Match[], group: string): string[] {
  const set = new Set<string>();
  for (const m of matches) {
    if (m.phase === "group" && m.group_letter === group) {
      if (m.home_team_name) set.add(m.home_team_name);
      if (m.away_team_name) set.add(m.away_team_name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Lista de partidos del grupo ordenados por kickoff
export function matchesOfGroup(matches: Match[], group: string): Match[] {
  return matches
    .filter((m) => m.phase === "group" && m.group_letter === group)
    .sort((a, b) => (a.kickoff_utc || "").localeCompare(b.kickoff_utc || ""));
}

// Lista de partidos terminados de un equipo (todas las fases, ordenados por fecha desc).
export function teamRecentMatches(matches: Match[], team: string, limit = 10): Match[] {
  return matches
    .filter((m) => (m.home_team_name === team || m.away_team_name === team) && (m.finished || m.status === "live"))
    .sort((a, b) => (b.kickoff_utc || "").localeCompare(a.kickoff_utc || ""))
    .slice(0, limit);
}

// Determina si la fase de grupos terminó (todos los partidos finalizados)
export function isGroupStageComplete(matches: Match[]): boolean {
  const groupMatches = matches.filter((m) => m.phase === "group");
  if (groupMatches.length === 0) return false;
  return groupMatches.every((m) => m.finished);
}

// Calcula 1ro, 2do y mejores terceros de cada grupo (resultado real).
export function computeGroupResults(matches: Match[]): {
  groups: Map<string, { first: string; second: string; thirds: StandingRow[] }>;
  bestThirds: string[]; // los 8 mejores terceros que clasifican (orden por criterios FIFA)
} {
  const allGroups = new Set<string>();
  for (const m of matches) if (m.group_letter && m.phase === "group") allGroups.add(m.group_letter);
  const groupSorted = [...allGroups].sort();

  const groups = new Map<string, { first: string; second: string; thirds: StandingRow[] }>();
  const allThirds: { group: string; row: StandingRow }[] = [];
  for (const g of groupSorted) {
    const st = computeGroupStandings(matches, g);
    if (st.length < 3) continue;
    groups.set(g, { first: st[0].team, second: st[1].team, thirds: [st[2]] });
    allThirds.push({ group: g, row: st[2] });
  }
  allThirds.sort((a, b) =>
    b.row.points - a.row.points || b.row.gd - a.row.gd || b.row.gf - a.row.gf || a.group.localeCompare(b.group));
  // FIFA 2026 (48 equipos, 12 grupos): clasifican los 8 mejores terceros
  const bestThirds = allThirds.slice(0, 8).map((x) => x.row.team);
  return { groups, bestThirds };
}
