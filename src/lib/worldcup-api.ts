// Cliente de la API pública de worldcup26.ir
// No requiere autenticación.
//
// Nota: en algunos entornos (Windows local), el servidor de worldcup26.ir hace
// TLS renegotiation legacy que Node rechaza por defecto. Probamos primero el
// fetch global (funciona en Vercel/Linux) y caemos al fallback undici con
// SSL_OP_LEGACY_SERVER_CONNECT si falla.

const BASE = process.env.WC_API_BASE || "https://worldcup26.ir";

async function wcFetch(path: string): Promise<Response> {
  const url = `${BASE}${path}`;
  const headers = {
    accept: "application/json",
    "user-agent": "Mozilla/5.0 (CALICAS-2026)",
  };
  try {
    return await fetch(url, { headers });
  } catch (err) {
    if ((err as { cause?: { code?: string } })?.cause?.code !== "ECONNRESET") throw err;
    // Fallback con TLS legacy renegotiation (Windows local)
    const { Agent, fetch: undiciFetch } = await import("undici");
    const { constants } = await import("node:crypto");
    const agent = new Agent({
      connect: { secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT },
    });
    // @ts-expect-error – undici fetch returns compatible Response
    return undiciFetch(url, { dispatcher: agent, headers });
  }
}

export type ApiGame = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string | null;
  away_score: string | null;
  home_team_name_en: string;
  away_team_name_en: string;
  group: string | null;
  matchday: string;
  local_date: string;
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string; // notstarted | live | finished | otros
  type: string;       // group | round_of_32 | ...
};

export async function fetchGames(): Promise<ApiGame[]> {
  const res = await wcFetch("/get/games");
  if (!res.ok) throw new Error(`worldcup26.ir games: ${res.status}`);
  const json = await res.json() as { games: ApiGame[] };
  return json.games;
}

export async function fetchTeams(): Promise<unknown[]> {
  const res = await wcFetch("/get/teams");
  if (!res.ok) throw new Error(`worldcup26.ir teams: ${res.status}`);
  return ((await res.json()) as { teams: unknown[] }).teams;
}

export function normalizePhase(type: string): string {
  const t = (type || "").toLowerCase().replace(/\s+/g, "_");
  if (t === "group" || t === "groups") return "group";
  if (t.includes("32")) return "round_of_32";
  if (t.includes("16") || t.includes("eighth") || t === "octavos") return "round_of_16";
  if (t.includes("quarter")) return "quarter_final";
  if (t.includes("semi")) return "semi_final";
  if (t.includes("third")) return "third_place";
  if (t === "final") return "final";
  return t || "group";
}

export function parseScore(s: string | null | undefined): number | null {
  if (s == null || s === "null" || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseFinished(s: string | undefined): boolean {
  return String(s).toUpperCase() === "TRUE";
}

export function normalizeStatus(time_elapsed: string, finished: boolean): "notstarted" | "live" | "finished" {
  if (finished) return "finished";
  const t = (time_elapsed || "").toLowerCase();
  if (t === "notstarted" || t === "scheduled" || t === "") return "notstarted";
  if (t === "finished") return "finished";
  return "live";
}
