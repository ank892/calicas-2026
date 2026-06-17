"use client";

import type { Clan } from "@/lib/clans";

// Dropdown "Todos / Clan A / Clan B ..." ordenado: "Todos" primero, luego alfabético.
export function ClanFilter({
  clans, value, onChange, label,
}: {
  clans: Clan[];
  value: string;          // "all" | clan.id
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
      {label ?? "Ver"}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[rgba(255,255,255,0.06)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-csh-yellow"
      >
        <option value="all">🌎 Todos</option>
        {clans.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji || "🛡️"} {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
