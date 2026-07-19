"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getLocalUser, setLocalUser, type LocalUser } from "@/lib/session";
import { WelcomeModal } from "@/components/WelcomeModal";
import { ChuncheDailyModal } from "@/components/ChuncheDailyModal";
import { FinalBonusModal } from "@/components/FinalBonusModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getLocalUser();
    if (!u) router.replace("/");
    else setUser(u);
    setReady(true);
  }, [router]);

  if (!ready || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-[var(--muted)]">Cargando…</div>
      </div>
    );
  }

  function logout() {
    setLocalUser(null);
    router.replace("/");
  }

  // Ventana de acceso a la Final: desde ahora hasta 3h después del kickoff
  const FINAL_KICK_MS = Date.UTC(2026, 6, 19, 19, 0, 0);
  const showFinalTab = Date.now() < FINAL_KICK_MS + 3 * 60 * 60 * 1000;

  const tabs = showFinalTab
    ? [
        { href: "/dashboard", label: "Inicio", icon: "🏠" },
        { href: "/matches", label: "Partidos", icon: "⚽" },
        { href: "/final", label: "Final", icon: "🏆", highlight: true },
        { href: "/leaderboard", label: "Tabla", icon: "📊" },
        { href: "/profile", label: "Perfil", icon: "👤" },
      ]
    : [
        { href: "/dashboard", label: "Inicio", icon: "🏠" },
        { href: "/matches", label: "Partidos", icon: "⚽" },
        { href: "/leaderboard", label: "Tabla", icon: "🏆" },
        { href: "/game", label: "Jafey", icon: "🎮" },
        { href: "/profile", label: "Perfil", icon: "👤" },
      ];

  return (
    <div className="min-h-dvh flex flex-col pb-20">
      <div className="csh-stripe h-1.5 w-full sticky top-0 z-30" />
      <header className="px-4 py-3 flex items-center justify-between sticky top-1.5 z-20 bg-[rgba(10,14,26,0.85)] backdrop-blur-md border-b border-[var(--border)]">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--muted)]">QUINIELA</div>
          <div className="text-lg font-black leading-none">
            <span className="text-csh-red">CALICAS</span>{" "}
            <span className="text-csh-yellow">2026</span>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost text-xs flex items-center gap-2">
          <span>{user.avatar_emoji}</span>
          <span className="font-bold">{user.display_name}</span>
        </button>
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>

      <nav className="tabbar fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== "/dashboard" && pathname.startsWith(t.href));
          const highlight = (t as { highlight?: boolean }).highlight;
          return (
            <Link key={t.href} href={t.href}
              className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold gap-0.5 ${
                active ? "text-csh-yellow" : highlight ? "text-csh-red" : "text-[var(--muted)]"
              }`}>
              <span className={`text-xl leading-none ${highlight && !active ? "animate-pulse" : ""}`}>{t.icon}</span>
              <span className={highlight ? "font-black" : ""}>{t.label}</span>
              {active && <span className="block w-6 h-[2px] bg-csh-yellow rounded-full" />}
            </Link>
          );
        })}
      </nav>

      <WelcomeModal />
      <ChuncheDailyModal />
      <FinalBonusModal />
    </div>
  );
}
