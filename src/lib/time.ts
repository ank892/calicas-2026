// Mapa stadium_id -> IANA timezone (worldcup26.ir / FIFA 2026)
// El campo `local_date` de la API se interpreta como hora local del estadio.

export const STADIUM_TZ: Record<string, string> = {
  "1":  "America/Mexico_City",     // Estadio Azteca (Mexico City)
  "2":  "America/Mexico_City",     // Estadio Akron (Guadalajara)
  "3":  "America/Monterrey",       // Estadio BBVA (Monterrey)
  "4":  "America/Chicago",         // AT&T Stadium (Dallas)
  "5":  "America/Chicago",         // NRG Stadium (Houston)
  "6":  "America/Chicago",         // Arrowhead (Kansas City)
  "7":  "America/New_York",        // Mercedes-Benz (Atlanta)
  "8":  "America/New_York",        // Hard Rock (Miami)
  "9":  "America/New_York",        // Gillette (Boston)
  "10": "America/New_York",        // Lincoln Financial (Philadelphia)
  "11": "America/New_York",        // MetLife (NY/NJ)
  "12": "America/Toronto",         // BMO Field (Toronto)
  "13": "America/Los_Angeles",     // Levi's / SoFi area – Bay Area / LA
  "14": "America/Los_Angeles",     // SoFi Stadium (LA)
  "15": "America/Vancouver",       // BC Place (Vancouver)
  "16": "America/Los_Angeles",     // Lumen Field (Seattle)
};

export const CR_TZ = "America/Costa_Rica"; // UTC-6 fijo

// Convierte "MM/DD/YYYY HH:MM" + stadium tz -> Date en UTC.
export function parseKickoffToUTC(localDate: string, stadiumId: string | undefined): Date | null {
  if (!localDate) return null;
  const m = localDate.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, mi] = m;
  const tz = STADIUM_TZ[stadiumId || ""] || "America/New_York";
  // Construimos un ISO "ingenuo" y calculamos el offset de esa zona en esa fecha.
  const naive = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`);
  const offsetMin = getTimezoneOffsetMinutes(tz, naive);
  // Si la hora local es H, UTC = H - offset; ya teníamos naive como si fuera UTC,
  // así que sumamos -offset para corregir.
  return new Date(naive.getTime() - offsetMin * 60_000);
}

// Offset (en minutos) de `tz` respecto a UTC en la fecha dada (positivo al este de UTC).
function getTimezoneOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return Math.round((asUTC - date.getTime()) / 60_000);
}

// Formatea una fecha en zona horaria de Costa Rica.
export function formatCR(date: Date | string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const fmt = new Intl.DateTimeFormat("es-CR", {
    timeZone: CR_TZ,
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
    ...opts,
  });
  return fmt.format(d).replace(",", "");
}

export function formatCRTimeOnly(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: CR_TZ, hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d);
}

export function formatCRDateOnly(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: CR_TZ, weekday: "long", day: "2-digit", month: "long",
  }).format(d);
}

// "YYYY-MM-DD" en zona CR (para comparar fechas sin tiempo).
export function crDateKey(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CR_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
