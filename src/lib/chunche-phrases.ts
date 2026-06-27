export const CHUNCHE_PHRASES: string[] = [
  "El partido no se gana hasta que se gana, y a veces ni ganándolo queda uno tranquilo.",
  "La bola es redonda, pero si uno la patea mal, agarra camino cuadrado.",
  "Al rival hay que respetarlo, pero tampoco tanto porque se malacostumbra.",
  "El que corre mucho se cansa primero, por eso hay que correr con pensamiento.",
  "En la cancha y en la vida, el que no mete la pata, no aprende a barrerse.",
  "Gol que no se celebra, se le olvida al marcador.",
  "Más vale pase corto en pie ajeno que pelotazo largo en guaba propia.",
  "El fútbol es sencillo: si la bola entra, era buena idea. Si no entra, era táctica.",
  "Defensa que piensa mucho, deja pasar hasta los pensamientos.",
  "Hay partidos que se ganan con la cabeza, otros con el corazón, y otros porque el árbitro anda distraído.",
  "No hay rival pequeño, solo equipos que todavía no han hecho la torta.",
  "Al delantero hay que marcarlo de cerca, pero no tanto porque después se encariña.",
  "Cuando el partido está cuesta arriba, hay que patear para abajo.",
  "El que pega primero, pega dos veces, salvo que le saquen amarilla.",
  "En la mejenga de la vida, uno a veces es titular y a veces le toca traer el fresco.",
  "Si la bola no llega, hay que ir a buscarla, pero con cuidado porque capaz que no era para uno.",
  "El empate es como el gallo pinto sin natilla: alimenta, pero deja una tristeza rara.",
  "Un buen portero tapa con las manos, con los pies y con la fe, pero ojalá también con algo de técnica.",
  "La camiseta se suda, se defiende y se lava, porque tampoco hay que ser cochino.",
  "El que juega bonito enamora, pero el que mete goles cobra prima.",
  "En cancha mojada, pensamiento seco. En cancha seca, cuidado con resbalarse igual.",
  "La afición empuja, pero si empuja mucho hay que llamar seguridad.",
  "El fútbol enseña humildad: hoy sos héroe, mañana te gritan que la soltés, animal.",
  "El que nunca pierde la fe, a veces pierde la marca, pero eso ya es otro asunto.",
  "Hay que jugar con garra, con cabeza y con calma, pero no todo al mismo tiempo porque se hace un enredo.",
];

// Devuelve YYYY-MM-DD en hora de Costa Rica (UTC-6, sin DST).
export function crDayKey(d: Date = new Date()): string {
  const cr = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  return cr.toISOString().slice(0, 10);
}

// Indice deterministico por dia: dias desde 1970-01-01 mod N.
export function phraseIndexForDay(dayKey: string, total: number): number {
  const ms = Date.parse(dayKey + "T00:00:00Z");
  const days = Math.floor(ms / 86_400_000);
  return ((days % total) + total) % total;
}

export function phraseForToday(d: Date = new Date()): { phrase: string; dayKey: string; index: number } {
  const dayKey = crDayKey(d);
  const index = phraseIndexForDay(dayKey, CHUNCHE_PHRASES.length);
  return { phrase: CHUNCHE_PHRASES[index], dayKey, index };
}
