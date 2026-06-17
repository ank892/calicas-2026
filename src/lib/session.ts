"use client";

// Sesión "lite" — sólo email en localStorage, sin contraseñas.

const KEY_USER = "calicas_user";

export type LocalUser = {
  id: string;
  email: string;
  display_name: string;
  avatar_emoji: string;
  country: string;
};

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY_USER);
  if (!raw) return null;
  try { return JSON.parse(raw) as LocalUser; } catch { return null; }
}

export function setLocalUser(u: LocalUser | null) {
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(KEY_USER, JSON.stringify(u));
  else localStorage.removeItem(KEY_USER);
}
