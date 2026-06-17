// Sistema de puntuación de CALICAS 2026
//
// - Marcador exacto: 5 pts
// - Resultado correcto (1X2) + 1 marcador acertado: 3 pts
// - Resultado correcto (1X2) solamente: 2 pts
// - Errado: 0 pts
// - Multiplicador eliminatoria: x2 desde octavos en adelante
//
// El multiplicador NO se aplica a la fase de grupos ni round_of_32.

const KO_MULTIPLIER_PHASES = new Set([
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
]);

export type Outcome = "H" | "D" | "A";

export function outcome(home: number, away: number): Outcome {
  if (home > away) return "H";
  if (home < away) return "A";
  return "D";
}

export function scorePrediction(
  predHome: number,
  predAway: number,
  realHome: number | null | undefined,
  realAway: number | null | undefined,
  phase: string,
  finished: boolean,
): number {
  if (!finished || realHome == null || realAway == null) return 0;

  let pts = 0;
  if (predHome === realHome && predAway === realAway) {
    pts = 5;
  } else if (outcome(predHome, predAway) === outcome(realHome, realAway)) {
    pts = (predHome === realHome || predAway === realAway) ? 3 : 2;
  } else {
    pts = 0;
  }

  if (pts > 0 && KO_MULTIPLIER_PHASES.has(phase)) pts *= 2;
  return pts;
}

export const PHASES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
] as const;

export const PHASE_LABELS: Record<string, string> = {
  group: "Fase de Grupos",
  round_of_32: "Dieciseisavos",
  round_of_16: "Octavos de Final",
  quarter_final: "Cuartos de Final",
  semi_final: "Semifinales",
  third_place: "Tercer Lugar",
  final: "Gran Final",
};
