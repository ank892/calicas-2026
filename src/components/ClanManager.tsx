"use client";

import { useEffect, useState } from "react";
import {
  fetchAllClans, fetchUserClans, createClan, joinClan, leaveClan, updateClan,
  type Clan, type ClanMembership,
} from "@/lib/clans";
import { getLocalUser } from "@/lib/session";

const EMOJI_CHOICES = ["🛡️", "⚔️", "🦁", "🐉", "🔥", "⚡", "🌟", "👑", "🦅", "🐺", "🏴‍☠️", "🦈", "🦄", "🐯", "🌪️", "💀"];

// Componente reutilizable: muestra mis clanes y permite crear/unirme.
// Si `compact` es true, oculta titulo grande (para usar dentro de un modal).
export function ClanManager({ compact = false, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const me = getLocalUser();
  const [mine, setMine] = useState<ClanMembership[]>([]);
  const [all, setAll] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛡️");
  const [joinId, setJoinId] = useState("");

  const load = async () => {
    if (!me) return;
    setLoading(true);
    const [m, a] = await Promise.all([fetchUserClans(me.id), fetchAllClans()]);
    setMine(m); setAll(a);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const atMax = mine.length >= 4;
  const availableToJoin = all.filter((c) => !mine.some((m) => m.id === c.id));

  async function doCreate() {
    if (!me) return;
    setErr(null); setBusy(true);
    const r = await createClan(name, emoji, me.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setName(""); setEmoji("🛡️"); setMode("idle");
    await load(); onChanged?.();
  }
  async function doJoin() {
    if (!me || !joinId) return;
    setErr(null); setBusy(true);
    const r = await joinClan(joinId, me.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setJoinId(""); setMode("idle");
    await load(); onChanged?.();
  }
  async function doLeave(id: string) {
    if (!me) return;
    if (!confirm("¿Salir de este clan?")) return;
    setBusy(true);
    await leaveClan(id, me.id);
    setBusy(false);
    await load(); onChanged?.();
  }
  async function doSaveEdit(id: string) {
    if (!me) return;
    setErr(null); setBusy(true);
    const r = await updateClan(id, me.id, { name, emoji });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setEditId(null); setName(""); setEmoji("🛡️");
    await load(); onChanged?.();
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <h3 className="text-sm font-black uppercase tracking-widest">🛡️ Mis Clanes</h3>
      )}
      <div className="text-[11px] text-[var(--muted)]">
        Tus clanes: <b className="text-csh-yellow">{mine.length}/4</b>
      </div>

      {loading && <div className="text-sm text-[var(--muted)]">Cargando…</div>}

      <div className="space-y-2">
        {mine.map((c) => {
          const isOwner = c.owner_user_id === me?.id;
          const isEditing = editId === c.id;
          return (
            <div key={c.id} className="card p-3">
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {EMOJI_CHOICES.map((em) => (
                      <button key={em} onClick={() => setEmoji(em)}
                        className={`text-lg w-9 h-9 rounded-lg border ${emoji === em ? "border-csh-yellow bg-[rgba(255,212,0,0.10)]" : "border-[var(--border)]"}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                    placeholder="Nombre del clan" />
                  <div className="flex gap-2">
                    <button onClick={() => doSaveEdit(c.id)} disabled={busy} className="btn-primary text-xs py-1.5 flex-1">Guardar</button>
                    <button onClick={() => { setEditId(null); setErr(null); }} className="btn-ghost text-xs py-1.5">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{c.emoji || "🛡️"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                      {isOwner ? "👑 Eres el creador" : "Miembro"}
                    </div>
                  </div>
                  {isOwner && (
                    <button onClick={() => { setEditId(c.id); setName(c.name); setEmoji(c.emoji || "🛡️"); setErr(null); }}
                      className="btn-ghost text-xs py-1 px-2">✏️</button>
                  )}
                  <button onClick={() => doLeave(c.id)} className="btn-ghost text-xs py-1 px-2">🚪</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!atMax && mode === "idle" && (
        <div className="flex gap-2">
          <button onClick={() => { setMode("create"); setErr(null); }} className="btn-primary text-xs py-2 flex-1">➕ Crear clan</button>
          {availableToJoin.length > 0 && (
            <button onClick={() => { setMode("join"); setErr(null); }} className="btn-ghost text-xs py-2 flex-1">🤝 Unirme</button>
          )}
        </div>
      )}

      {mode === "create" && (
        <div className="card p-3 space-y-2 border border-csh-yellow/40">
          <div className="text-[11px] font-black uppercase tracking-wider text-csh-yellow">Crear clan</div>
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((em) => (
              <button key={em} onClick={() => setEmoji(em)}
                className={`text-lg w-9 h-9 rounded-lg border ${emoji === em ? "border-csh-yellow bg-[rgba(255,212,0,0.10)]" : "border-[var(--border)]"}`}>
                {em}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
            className="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            placeholder="Nombre del clan (ej: Los Florenses)" autoFocus />
          <div className="flex gap-2">
            <button onClick={doCreate} disabled={busy || !name.trim()} className="btn-primary text-xs py-2 flex-1">
              {busy ? "Creando…" : "Crear"}
            </button>
            <button onClick={() => { setMode("idle"); setErr(null); }} className="btn-ghost text-xs py-2">Cancelar</button>
          </div>
        </div>
      )}

      {mode === "join" && (
        <div className="card p-3 space-y-2 border border-csh-yellow/40">
          <div className="text-[11px] font-black uppercase tracking-wider text-csh-yellow">Unirme a un clan</div>
          <select value={joinId} onChange={(e) => setJoinId(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm">
            <option value="">— Escoge un clan —</option>
            {availableToJoin.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji || "🛡️"} {c.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={doJoin} disabled={busy || !joinId} className="btn-primary text-xs py-2 flex-1">
              {busy ? "Uniendo…" : "Unirme"}
            </button>
            <button onClick={() => { setMode("idle"); setErr(null); }} className="btn-ghost text-xs py-2">Cancelar</button>
          </div>
        </div>
      )}

      {atMax && mode === "idle" && (
        <div className="text-[11px] text-[var(--muted)] text-center italic">Llegaste al máximo de 4 clanes.</div>
      )}

      {err && <div className="text-xs text-red-400 text-center font-bold">{err}</div>}
    </div>
  );
}
