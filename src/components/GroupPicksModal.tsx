"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocalUser } from "@/lib/session";
import { teamsOfGroup, type Match } from "@/lib/standings";
import { fetchMyGroupPicks, saveGroupPick, isGroupLocked, GROUP_PICK_POINTS, type GroupPick } from "@/lib/group-picks";
import { flagFor } from "@/lib/flags";

// Modal de pronósticos de grupo: por cada grupo, predecir 1ro, 2do, y "mejor 3ro" o "ninguno".
export function GroupPicksModal({ matches, onClose }: { matches: Match[]; onClose: () => void }) {
  const me = getLocalUser();
  const [picks, setPicks] = useState<Map<string, GroupPick>>(new Map());
  const [loading, setLoading] = useState(true);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) if (m.group_letter && m.phase === "group") set.add(m.group_letter);
    return [...set].sort();
  }, [matches]);

  const reload = async () => {
    if (!me) return;
    setLoading(true);
    setPicks(await fetchMyGroupPicks(me.id));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="csh-stripe h-1.5 w-full" />
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-csh-yellow">🎯 BONUS DE GRUPOS</div>
            <div className="text-lg font-black">Pronosticá clasificados</div>
          </div>
          <button onClick={onClose} className="btn-ghost text-sm py-1 px-3">✕</button>
        </div>

        <div className="px-4 py-3 text-[11px] text-[var(--muted)] border-b border-[var(--border)]">
          Por cada grupo: predecí <b className="text-[var(--text)]">1ro</b> ({GROUP_PICK_POINTS.FIRST} pts) · <b className="text-[var(--text)]">2do</b> ({GROUP_PICK_POINTS.SECOND} pts) · <b className="text-[var(--text)]">mejor 3ro</b> ({GROUP_PICK_POINTS.THIRD_TEAM} pts si aciertas el equipo, {GROUP_PICK_POINTS.THIRD_NONE} si dices &ldquo;ninguno&rdquo; y aciertas). Se cierra 30 min antes del primer partido del grupo.
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading && <div className="text-sm text-[var(--muted)] text-center py-4">Cargando…</div>}
          {!loading && groups.map((g) => (
            <GroupForm key={g} group={g} matches={matches} initial={picks.get(g)} onSaved={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupForm({ group, matches, initial, onSaved }: {
  group: string; matches: Match[]; initial?: GroupPick; onSaved: () => void;
}) {
  const me = getLocalUser();
  const teams = teamsOfGroup(matches, group);
  const locked = isGroupLocked(matches, group);

  const [first, setFirst] = useState(initial?.first_team ?? "");
  const [second, setSecond] = useState(initial?.second_team ?? "");
  // 'none' = el usuario dice que ningún equipo del grupo clasifica como mejor 3ro
  const [third, setThird] = useState<string>(initial?.third_qualifier_team ?? "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!initial);

  async function save() {
    if (!me) return;
    setErr(null);
    if (!first || !second) { setErr("Selecciona 1ro y 2do."); return; }
    if (first === second) { setErr("El 1ro y el 2do deben ser distintos."); return; }
    const thirdValue = third === "none" || third === "" ? null : third;
    if (thirdValue && (thirdValue === first || thirdValue === second)) {
      setErr("El 3ro debe ser distinto del 1ro y 2do."); return;
    }
    setSaving(true);
    const r = await saveGroupPick({ user_id: me.id, group_letter: group, first_team: first, second_team: second, third_qualifier_team: thirdValue });
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    setSavedOk(true); setTimeout(() => setSavedOk(false), 1500);
    onSaved();
  }

  const hasPick = first && second;
  const ptsShown = initial?.points ?? 0;

  return (
    <div className={`card p-3 ${locked && !hasPick ? "opacity-70" : ""}`}>
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <div>
          <div className="text-sm font-black">Grupo {group}</div>
          {hasPick && !expanded && (
            <div className="text-[11px] text-[var(--muted)] flex items-center gap-1 mt-0.5 flex-wrap">
              <span>🥇 {flagFor(first)} {first}</span>
              <span>· 🥈 {flagFor(second)} {second}</span>
              {third && third !== "none" && <span>· 🥉 {flagFor(third)} {third}</span>}
              {third === "none" && <span>· 🚫 ninguno</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ptsShown > 0 && <span className="text-xs font-black text-green-400">+{ptsShown}</span>}
          {locked && <span className="badge badge-locked text-[10px]">🔒</span>}
          <span className="text-[var(--muted)]">{expanded ? "▴" : "▾"}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 mt-3">
          <PickRow label="🥇 1ro" value={first} onChange={setFirst} teams={teams} disabled={locked} />
          <PickRow label="🥈 2do" value={second} onChange={setSecond} teams={teams.filter((t) => t !== first)} disabled={locked} />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">🥉 Mejor tercero</label>
            <select value={third} onChange={(e) => setThird(e.target.value)} disabled={locked}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mt-1 disabled:opacity-50">
              <option value="">— Escoge —</option>
              <option value="none">🚫 Ninguno del grupo clasifica</option>
              {teams.filter((t) => t !== first && t !== second).map((t) => (
                <option key={t} value={t}>{flagFor(t)} {t}</option>
              ))}
            </select>
          </div>
          {!locked && (
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving || !first || !second} className="btn-primary flex-1 py-2 text-sm">
                {saving ? "Guardando…" : initial ? "Actualizar" : "Guardar"}
              </button>
              {savedOk && <span className="text-green-400 text-xs font-bold">✓ Guardado</span>}
            </div>
          )}
          {locked && (
            <div className="text-[11px] text-[var(--muted)] text-center italic">🔒 Cerrado · este grupo ya empezó.</div>
          )}
          {err && <div className="text-xs text-red-400 text-center font-bold">{err}</div>}
        </div>
      )}
    </div>
  );
}

function PickRow({ label, value, onChange, teams, disabled }: {
  label: string; value: string; onChange: (v: string) => void; teams: string[]; disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mt-1 disabled:opacity-50">
        <option value="">— Escoge —</option>
        {teams.map((t) => <option key={t} value={t}>{flagFor(t)} {t}</option>)}
      </select>
    </div>
  );
}
