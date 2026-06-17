// Mapeo de nombres de selección (en inglés, tal como vienen de worldcup26.ir)
// a emoji de bandera (regional indicator symbols).
// Si el nombre no aparece (p.ej. "Winner Group A", "TBD"), devuelve "🏳️".

const FLAGS: Record<string, string> = {
  // Anfitriones
  "united states": "🇺🇸", "usa": "🇺🇸", "u.s.a.": "🇺🇸", "us": "🇺🇸",
  "mexico": "🇲🇽",
  "canada": "🇨🇦",
  // UEFA
  "france": "🇫🇷", "england": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "spain": "🇪🇸", "germany": "🇩🇪",
  "italy": "🇮🇹", "portugal": "🇵🇹", "netherlands": "🇳🇱", "holland": "🇳🇱",
  "belgium": "🇧🇪", "croatia": "🇭🇷", "denmark": "🇩🇰", "switzerland": "🇨🇭",
  "austria": "🇦🇹", "poland": "🇵🇱", "norway": "🇳🇴", "sweden": "🇸🇪",
  "serbia": "🇷🇸", "turkey": "🇹🇷", "turkiye": "🇹🇷", "türkiye": "🇹🇷",
  "wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "ukraine": "🇺🇦",
  "czech republic": "🇨🇿", "czechia": "🇨🇿", "hungary": "🇭🇺", "romania": "🇷🇴",
  "republic of ireland": "🇮🇪", "ireland": "🇮🇪", "northern ireland": "🇬🇧",
  "slovakia": "🇸🇰", "slovenia": "🇸🇮", "greece": "🇬🇷", "albania": "🇦🇱",
  "north macedonia": "🇲🇰", "bosnia and herzegovina": "🇧🇦", "iceland": "🇮🇸",
  "finland": "🇫🇮", "russia": "🇷🇺", "belarus": "🇧🇾", "georgia": "🇬🇪",
  "kosovo": "🇽🇰", "montenegro": "🇲🇪", "moldova": "🇲🇩",
  // CONMEBOL
  "argentina": "🇦🇷", "brazil": "🇧🇷", "uruguay": "🇺🇾", "colombia": "🇨🇴",
  "ecuador": "🇪🇨", "paraguay": "🇵🇾", "chile": "🇨🇱", "peru": "🇵🇪",
  "venezuela": "🇻🇪", "bolivia": "🇧🇴",
  // CONCACAF
  "costa rica": "🇨🇷", "panama": "🇵🇦", "honduras": "🇭🇳", "jamaica": "🇯🇲",
  "curacao": "🇨🇼", "curaçao": "🇨🇼", "haiti": "🇭🇹",
  "trinidad and tobago": "🇹🇹", "el salvador": "🇸🇻", "guatemala": "🇬🇹",
  "suriname": "🇸🇷", "nicaragua": "🇳🇮", "guyana": "🇬🇾",
  "dominican republic": "🇩🇴", "cuba": "🇨🇺",
  // AFC
  "japan": "🇯🇵", "south korea": "🇰🇷", "korea republic": "🇰🇷", "korea": "🇰🇷",
  "north korea": "🇰🇵", "iran": "🇮🇷", "ir iran": "🇮🇷",
  "saudi arabia": "🇸🇦", "qatar": "🇶🇦", "australia": "🇦🇺",
  "uzbekistan": "🇺🇿", "jordan": "🇯🇴", "iraq": "🇮🇶",
  "united arab emirates": "🇦🇪", "uae": "🇦🇪",
  "china": "🇨🇳", "china pr": "🇨🇳", "thailand": "🇹🇭", "vietnam": "🇻🇳",
  "indonesia": "🇮🇩", "malaysia": "🇲🇾", "india": "🇮🇳", "bahrain": "🇧🇭",
  "oman": "🇴🇲", "kuwait": "🇰🇼", "syria": "🇸🇾", "lebanon": "🇱🇧",
  "palestine": "🇵🇸", "tajikistan": "🇹🇯", "turkmenistan": "🇹🇲",
  "kyrgyzstan": "🇰🇬",
  // CAF
  "morocco": "🇲🇦", "senegal": "🇸🇳", "egypt": "🇪🇬", "algeria": "🇩🇿",
  "tunisia": "🇹🇳", "nigeria": "🇳🇬", "cameroon": "🇨🇲", "ghana": "🇬🇭",
  "ivory coast": "🇨🇮", "cote d'ivoire": "🇨🇮", "côte d'ivoire": "🇨🇮",
  "south africa": "🇿🇦", "mali": "🇲🇱",
  "dr congo": "🇨🇩", "democratic republic of the congo": "🇨🇩", "congo dr": "🇨🇩",
  "cape verde": "🇨🇻", "cabo verde": "🇨🇻", "burkina faso": "🇧🇫",
  "guinea": "🇬🇳", "gabon": "🇬🇦", "zambia": "🇿🇲", "kenya": "🇰🇪",
  "angola": "🇦🇴", "mauritania": "🇲🇷", "libya": "🇱🇾",
  "mozambique": "🇲🇿", "uganda": "🇺🇬", "tanzania": "🇹🇿",
  "comoros": "🇰🇲", "togo": "🇹🇬", "benin": "🇧🇯",
  "equatorial guinea": "🇬🇶", "madagascar": "🇲🇬", "ethiopia": "🇪🇹",
  "namibia": "🇳🇦", "sudan": "🇸🇩",
  // OFC
  "new zealand": "🇳🇿", "fiji": "🇫🇯", "solomon islands": "🇸🇧",
  "papua new guinea": "🇵🇬", "tahiti": "🇵🇫", "vanuatu": "🇻🇺",
};

export function flagFor(teamName: string | null | undefined): string {
  if (!teamName) return "🏳️";
  const k = teamName.trim().toLowerCase();
  if (FLAGS[k]) return FLAGS[k];
  // limpieza adicional (quita prefijos tipo "ir " o "fr ")
  const clean = k.replace(/^(ir|fr|pr)\s+/, "");
  if (FLAGS[clean]) return FLAGS[clean];
  // Placeholders de fase eliminatoria
  if (/winner|loser|runner|tbd|ganador|perdedor|2nd|1st/.test(k)) return "🏳️";
  return "🏳️";
}
