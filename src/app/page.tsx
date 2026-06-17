"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { setLocalUser, getLocalUser } from "@/lib/session";

const EMOJIS = ["⚽","🏆","🇨🇷","🦁","🐂","🐅","🐆","🦅","🐺","🐉","⭐","🔥","⚡","🌶️","🌟","🎯"];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("⚽");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"check" | "register">("check");

  useEffect(() => {
    if (getLocalUser()) router.replace("/dashboard");
  }, [router]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Correo inválido");
      const { data: existing, error: errSel } = await supabase
        .from("ed26_calicas_users")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (errSel) throw errSel;

      if (existing) {
        setLocalUser({
          id: existing.id, email: existing.email,
          display_name: existing.display_name, avatar_emoji: existing.avatar_emoji ?? "⚽",
          country: existing.country ?? "CR",
        });
        router.replace("/dashboard");
        return;
      }
      setStage("register");
    } catch (err) {
      setError((err as Error).message ?? "Error inesperado");
    } finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      if (cleanName.length < 2) throw new Error("Tu nombre tiene que tener al menos 2 caracteres");
      const { data, error: errIns } = await supabase
        .from("ed26_calicas_users")
        .insert({ email: cleanEmail, display_name: cleanName, avatar_emoji: emoji, country: "CR" })
        .select("*").single();
      if (errIns) throw errIns;
      setLocalUser({
        id: data.id, email: data.email,
        display_name: data.display_name, avatar_emoji: data.avatar_emoji ?? "⚽", country: data.country ?? "CR",
      });
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message ?? "Error inesperado");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="csh-stripe h-2 w-full" />
      <main className="flex-1 px-5 py-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-7">
            <div className="text-5xl mb-2">⚽🏆</div>
            <h1 className="text-3xl font-black tracking-tight">
              <span className="text-csh-red">CALICAS</span>{" "}
              <span className="text-csh-yellow">2026</span>
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1 text-center">
              Quiniela del Mundial FIFA 2026 entre amigos · 🇨🇷
            </p>
          </div>

          <div className="card p-5">
            {stage === "check" ? (
              <form onSubmit={handleContinue} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Correo electrónico</label>
                  <input
                    className="input mt-1.5"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vos@correo.com"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button className="btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? "Validando..." : "Entrar / Registrarme"}
                </button>
                <p className="text-[11px] text-[var(--muted)] text-center">
                  Sin contraseña. Sólo tu correo basta para guardar tus pronósticos.
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <p className="text-sm text-[var(--muted)]">
                  Bienvenida/o, vamos a crear tu perfil para <b>{email}</b>.
                </p>
                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Tu nombre</label>
                  <input
                    className="input mt-1.5"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como te conocen"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Avatar</label>
                  <div className="grid grid-cols-8 gap-2 mt-2">
                    {EMOJIS.map((e) => (
                      <button
                        type="button" key={e}
                        onClick={() => setEmoji(e)}
                        className={`text-2xl rounded-lg p-1.5 border ${emoji === e ? "border-csh-yellow bg-[rgba(255,212,0,0.12)]" : "border-[var(--border)]"}`}
                      >{e}</button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button className="btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? "Creando perfil..." : "Empezar a pronosticar 🚀"}
                </button>
                <button type="button" className="btn-ghost w-full" onClick={() => setStage("check")}>
                  Usar otro correo
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-[11px] text-center text-[var(--muted)]">
            CALICAS 2026 · Inspirado por el rojiamarillo del Club Sport Herediano
          </p>
        </div>
      </main>
      <div className="wc-stripe h-1.5 w-full" />
    </div>
  );
}
