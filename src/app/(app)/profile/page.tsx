"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getLocalUser, setLocalUser, type LocalUser } from "@/lib/session";
import { ClanManager } from "@/components/ClanManager";

const EMOJIS = ["⚽","🏆","🇨🇷","🦁","🐂","🐅","🐆","🦅","🐺","🐉","⭐","🔥","⚡","🌶️","🌟","🎯"];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("⚽");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ total_points: number; predicciones_totales: number; exactos: number } | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const u = getLocalUser();
    if (!u) { router.replace("/"); return; }
    setUser(u); setName(u.display_name); setEmoji(u.avatar_emoji);
    supabase.from("ed26_calicas_leaderboard").select("total_points, predicciones_totales, exactos").eq("user_id", u.id).maybeSingle()
      .then(({ data }) => { if (data) setStats(data as typeof stats extends null ? never : { total_points: number; predicciones_totales: number; exactos: number }); });
  }, [router]);

  if (!user) return null;

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("ed26_calicas_users")
      .update({ display_name: name.trim(), avatar_emoji: emoji })
      .eq("id", user.id);
    setSaving(false);
    if (!error) {
      const updated = { ...user, display_name: name.trim(), avatar_emoji: emoji };
      setLocalUser(updated); setUser(updated);
      setSavedOk(true); setTimeout(() => setSavedOk(false), 1500);
    }
  }

  function logout() { setLocalUser(null); router.replace("/"); }

  return (
    <div className="space-y-5">
      <section className="card p-5 text-center">
        <div className="text-6xl mb-2">{user.avatar_emoji}</div>
        <div className="text-xl font-black">{user.display_name}</div>
        <div className="text-xs text-[var(--muted)] mt-1">{user.email}</div>
      </section>

      {stats && (
        <section className="grid grid-cols-3 gap-2">
          <Stat label="Puntos" value={stats.total_points} accent />
          <Stat label="Picks" value={stats.predicciones_totales} />
          <Stat label="Exactos" value={stats.exactos} />
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h3 className="text-sm font-black uppercase tracking-widest">Editar perfil</h3>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Nombre</label>
          <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Avatar</label>
          <div className="grid grid-cols-8 gap-2 mt-2">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`text-2xl rounded-lg p-1.5 border ${emoji === e ? "border-csh-yellow bg-[rgba(255,212,0,0.12)]" : "border-[var(--border)]"}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving || !name.trim()} className="btn-primary flex-1">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          {savedOk && <span className="text-green-400 text-xs font-bold">✓ Guardado</span>}
        </div>
      </section>

      <section className="card p-4">
        <ClanManager />
      </section>

      <section className="card p-4">
        <button onClick={logout} className="btn-ghost w-full">Cerrar sesión</button>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center border ${accent ? "border-csh-yellow/40 bg-[rgba(255,212,0,0.08)]" : "border-[var(--border)] bg-[rgba(255,255,255,0.03)]"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${accent ? "text-csh-yellow" : ""}`}>{value}</div>
    </div>
  );
}
