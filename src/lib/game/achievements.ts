// Sistema de logros/medallas del minijuego Jafey.
// Se guardan en localStorage por usuario (no vale la pena una tabla nueva).

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  icon: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_run",       name: "Primer trote",       desc: "Jugar el nivel 1 por primera vez", icon: "🚶" },
  { id: "first_win",       name: "Rosabal en la mira", desc: "Terminar el nivel 1", icon: "🏟️" },
  { id: "clear_all",       name: "Inauguración",       desc: "Terminar los 3 niveles", icon: "🏆" },
  { id: "stomp_10",        name: "Barredora",          desc: "Aplastar 10 rivales en una partida", icon: "👣" },
  { id: "coins_20",        name: "Colecta escuditos",  desc: "Recoger 20 escuditos en una partida", icon: "🎖️" },
  { id: "no_hit",          name: "Ni un rasguño",      desc: "Terminar un nivel sin recibir daño", icon: "💪" },
  { id: "imperial",        name: "Con la Imperial",    desc: "Recoger una Imperial", icon: "🍺" },
  { id: "botines",         name: "Doble salto",        desc: "Recoger los botines dorados", icon: "👟" },
  { id: "camiseta",        name: "Bendita rojiamarilla",desc: "Recoger la camiseta CSH", icon: "👕" },
  { id: "speedrun_1",      name: "Fugaz",              desc: "Terminar el nivel 1 bajo el tiempo objetivo", icon: "⚡" },
  { id: "speedrun_3",      name: "Rayo herediano",     desc: "Terminar el nivel 3 bajo el tiempo objetivo", icon: "💨" },
];

function key(userId: string) { return `calicas_achievements:${userId}`; }

export function loadUnlocked(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

export function unlock(userId: string, ids: string[]): string[] {
  if (typeof window === "undefined") return [];
  const current = loadUnlocked(userId);
  const newly: string[] = [];
  for (const id of ids) if (!current.has(id)) { current.add(id); newly.push(id); }
  if (newly.length) {
    window.localStorage.setItem(key(userId), JSON.stringify([...current]));
  }
  return newly;
}
