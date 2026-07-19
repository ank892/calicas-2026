// Sistema de predicciones bonus para la final del Mundial 2026
// Suma hasta 130 pts adicionales por jugador. Mix de auto-verificables
// (resueltas desde worldcup26.ir en /api/sync) y manuales (admin las llena).

export const FINAL_MATCH_ID = "104";

// Plantillas simplificadas (top jugadores de campo, para dropdown de primer
// goleador y MVP). No incluyen porteros porque marcar un porterazo se vería raro.
// Se pueden editar si hay lesionados/suspensos.
export const SQUADS: Record<string, { flag: string; players: string[] }> = {
  Spain: {
    flag: "🇪🇸",
    players: [
      "Lamine Yamal", "Nico Williams", "Mikel Merino", "Álvaro Morata",
      "Rodri", "Pedri", "Fabián Ruiz", "Dani Olmo",
      "Marc Cucurella", "Dani Carvajal", "Aymeric Laporte", "Robin Le Normand",
      "Ferran Torres", "Mikel Oyarzabal", "Jesús Navas", "Fermín López",
      "Álex Baena", "Álex Grimaldo", "Martín Zubimendi", "Bryan Zaragoza",
    ],
  },
  Argentina: {
    flag: "🇦🇷",
    players: [
      "Lionel Messi", "Julián Álvarez", "Lautaro Martínez", "Ángel Di María",
      "Enzo Fernández", "Alexis Mac Allister", "Rodrigo De Paul", "Leandro Paredes",
      "Cristian Romero", "Nicolás Otamendi", "Nahuel Molina", "Nicolás Tagliafico",
      "Marcos Acuña", "Giovani Lo Celso", "Paulo Dybala", "Nicolás González",
      "Ángel Correa", "Thiago Almada", "Alejandro Garnacho", "Franco Mastantuono",
    ],
  },
};

// Etiquetas de rangos
export const TOTAL_GOALS_RANGES = ["0-1", "2-3", "4+"] as const;
export const CORNERS_RANGES = ["<=7", "8-11", "12+"] as const;
export const HOW_DEFINED = ["regular", "extra", "penalties"] as const;
export const YELLOW_CARDS_RANGES = ["0-2", "3-4", "5-6", "7+"] as const;

export type FinalPick = {
  user_id: string;
  match_id: string;
  btts: boolean | null;
  first_scorer: string | null;
  total_goals_range: string | null;
  total_goals_exact: number | null;
  how_defined: string | null;
  goal_after_85: boolean | null;
  corners_range: string | null;
  red_card: boolean | null;
  header_goal: boolean | null;
  penalty_scored: boolean | null;
  mvp: string | null;
  // Nuevas divertidas
  goal_first_15: boolean | null;
  hat_trick: boolean | null;
  messi_scores: boolean | null;
  own_goal: boolean | null;
  yellow_cards_range: string | null;
};

export type FinalResults = {
  match_id: string;
  btts: boolean | null;
  first_scorer: string | null;
  total_goals_exact: number | null;
  how_defined: string | null;
  goal_after_85: boolean | null;
  corners_range: string | null;
  red_card: boolean | null;
  header_goal: boolean | null;
  penalty_scored: boolean | null;
  mvp: string | null;
  goal_first_15: boolean | null;
  hat_trick: boolean | null;
  messi_scores: boolean | null;
  own_goal: boolean | null;
  yellow_cards_range: string | null;
};

export type Breakdown = { key: string; label: string; points: number; max: number };

// Puntajes máximos por predicción:
//  1. btts:              10
//  2. first_scorer:      25
//  3. total_goals:       20 (10 rango + 10 exacto)
//  4. how_defined:       15
//  5. goal_after_85:     10
//  6. corners_range:     10
//  7. red_card:          10
//  8. header_goal:       10
//  9. penalty_scored:    10
// 10. mvp:               10
// -- Divertidas --
// 11. goal_first_15:     10
// 12. hat_trick:         15  (raro y alto valor)
// 13. messi_scores:      10
// 14. own_goal:          10
// 15. yellow_cards_range:10
// Total max:            185
export const MAX_POINTS = 185;

export function totalGoalsInRange(range: string, goals: number): boolean {
  if (range === "0-1") return goals <= 1;
  if (range === "2-3") return goals === 2 || goals === 3;
  if (range === "4+") return goals >= 4;
  return false;
}

export function cornersInRange(range: string, corners: number): boolean {
  if (range === "<=7") return corners <= 7;
  if (range === "8-11") return corners >= 8 && corners <= 11;
  if (range === "12+") return corners >= 12;
  return false;
}

// Calcula puntos y breakdown detallado
export function scoreFinalPick(pick: FinalPick, res: FinalResults): { total: number; breakdown: Breakdown[] } {
  const b: Breakdown[] = [];

  const cmp = <T,>(label: string, key: string, my: T | null, real: T | null, pts: number) => {
    let earned = 0;
    if (my !== null && real !== null && my === real) earned = pts;
    b.push({ key, label, points: earned, max: pts });
  };

  cmp("Ambos anotan", "btts", pick.btts, res.btts, 10);
  cmp("Primer goleador", "first_scorer", pick.first_scorer, res.first_scorer, 25);

  // Total goles: rango 10, bonus exacto 10
  let tgRange = 0, tgExact = 0;
  if (pick.total_goals_range && res.total_goals_exact !== null && totalGoalsInRange(pick.total_goals_range, res.total_goals_exact)) {
    tgRange = 10;
  }
  if (pick.total_goals_exact !== null && res.total_goals_exact !== null && pick.total_goals_exact === res.total_goals_exact) {
    tgExact = 10;
  }
  b.push({ key: "total_goals_range", label: "Total goles (rango)", points: tgRange, max: 10 });
  b.push({ key: "total_goals_exact", label: "Total goles (exacto bonus)", points: tgExact, max: 10 });

  cmp("Cómo se define", "how_defined", pick.how_defined, res.how_defined, 15);
  cmp("Gol después del 85'", "goal_after_85", pick.goal_after_85, res.goal_after_85, 10);
  cmp("Corners (rango)", "corners_range", pick.corners_range, res.corners_range, 10);
  cmp("Habrá roja", "red_card", pick.red_card, res.red_card, 10);
  cmp("Gol de cabeza", "header_goal", pick.header_goal, res.header_goal, 10);
  cmp("Penal cobrado", "penalty_scored", pick.penalty_scored, res.penalty_scored, 10);
  cmp("MVP", "mvp", pick.mvp, res.mvp, 10);
  // Divertidas
  cmp("Gol en los primeros 15'", "goal_first_15", pick.goal_first_15, res.goal_first_15, 10);
  cmp("Hat-trick", "hat_trick", pick.hat_trick, res.hat_trick, 15);
  cmp("Messi anota", "messi_scores", pick.messi_scores, res.messi_scores, 10);
  cmp("Autogol", "own_goal", pick.own_goal, res.own_goal, 10);
  cmp("Amarillas (rango)", "yellow_cards_range", pick.yellow_cards_range, res.yellow_cards_range, 10);

  const total = b.reduce((s, x) => s + x.points, 0);
  return { total, breakdown: b };
}

// ---------- Auto-resolvedores desde datos de worldcup26.ir ----------

// home_scorers / away_scorers vienen como string tipo:
//   "{\"Nestory Irankunda 27'\",\"C. Metcalfe 75'\"}"
// Los parseamos a lista de {name, minute}.
export type ScorerEvent = { name: string; minute: number; team: "home" | "away" };

export function parseScorers(raw: string | null | undefined, team: "home" | "away"): ScorerEvent[] {
  if (!raw || raw === "null" || raw === "NULL") return [];
  // Quitar llaves envolventes y separar por ',"'
  const inner = raw.replace(/^\s*[{]/, "").replace(/[}]\s*$/, "");
  // Split respetando comas dentro de strings simples. Como formato es
  // "name minute'","name minute'" separamos por `","`.
  const parts = inner.split(/",\s*"/).map((s) => s.replace(/^"/, "").replace(/"$/, "").trim()).filter(Boolean);
  const out: ScorerEvent[] = [];
  for (const p of parts) {
    // Buscar el ultimo numero seguido de apostrofo (o '+' para tiempo agregado)
    const m = p.match(/^(.*?)\s+(\d+)(?:\+(\d+))?['`]?$/);
    if (m) {
      const min = Number(m[2]) + (m[3] ? Number(m[3]) : 0);
      out.push({ name: m[1].trim(), minute: min, team });
    } else {
      out.push({ name: p.replace(/[`'\d\+\s]+$/, "").trim(), minute: 999, team });
    }
  }
  return out;
}

// Auto-resolucion parcial: rellenamos lo que se puede calcular
export function autoResolve(homeScore: number, awayScore: number, homeScorersRaw: string | null, awayScorersRaw: string | null): Partial<FinalResults> {
  const homeEv = parseScorers(homeScorersRaw, "home");
  const awayEv = parseScorers(awayScorersRaw, "away");
  const all = [...homeEv, ...awayEv].sort((a, b) => a.minute - b.minute);

  const btts = homeScore > 0 && awayScore > 0;
  const total = homeScore + awayScore;

  const first_scorer = all.length === 0 ? "no_goal" : all[0].name;

  // how_defined: si hay goles con minuto >= 105 (segunda parte de prorroga) o >90 -> extra;
  // si al final del reglamentario estaba empatado y luego hubo goles adicionales o queda empatado -> penales
  // Simplificacion: si hay algun gol con minuto >90 -> prorroga; si al final tras 120 empatan (imposible en nuestros datos, worldcup26 solo trae marcador final) -> peneales.
  // La API no distingue penales adicionales del marcador. Dejamos how_defined en null si
  // hay ambiguedad y confiamos en admin. Solo autorresolvemos casos claros:
  //   - Hay goles con minuto > 90 -> "extra"
  //   - Todos goles <= 90 -> "regular"
  //   - Empate tras (calculado) 90' pero con marcador final desigual: podria ser penales
  //     pero no hay como saberlo desde este API. Se deja null.
  let how_defined: string | null = null;
  const overtimeGoals = all.filter((e) => e.minute > 90);
  if (overtimeGoals.length > 0) {
    how_defined = "extra";
  } else if (homeScore !== awayScore) {
    // Marcador definido en tiempo regular
    how_defined = "regular";
  }
  // Si empataron y no hay goles >90 (peneales), no lo podemos deducir.

  const goal_after_85 = all.some((e) => e.minute >= 85);

  // NUEVAS AUTO:
  const goal_first_15 = all.some((e) => e.minute <= 15 && e.minute > 0);

  // Hat-trick: mismo nombre 3+ veces. Comparamos por apellido normalizado
  const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ ]/gi, "").trim();
  const counts = new Map<string, number>();
  for (const e of all) counts.set(norm(e.name), (counts.get(norm(e.name)) ?? 0) + 1);
  const hat_trick = Array.from(counts.values()).some((c) => c >= 3);

  // Messi anota: buscamos "messi" en el nombre normalizado
  const messi_scores = all.some((e) => norm(e.name).includes("messi"));

  return {
    btts,
    first_scorer,
    total_goals_exact: total,
    how_defined,
    goal_after_85,
    goal_first_15,
    hat_trick,
    messi_scores,
  };
}
