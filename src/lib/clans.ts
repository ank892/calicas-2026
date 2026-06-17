import { supabase } from "./supabase";

export type Clan = {
  id: string;
  name: string;
  emoji: string | null;
  owner_user_id: string;
  created_at: string;
};

export type ClanMembership = Clan & { joined_at: string };

// Devuelve los clanes del usuario, ordenados alfabéticamente.
export async function fetchUserClans(userId: string): Promise<ClanMembership[]> {
  const { data, error } = await supabase
    .from("ed26_calicas_clan_members")
    .select("joined_at, ed26_calicas_clans(id, name, emoji, owner_user_id, created_at)")
    .eq("user_id", userId);
  if (error || !data) return [];
  const out = data
    .map((r) => {
      const raw = (r as { ed26_calicas_clans: Clan | Clan[] | null }).ed26_calicas_clans;
      const c = Array.isArray(raw) ? raw[0] : raw;
      if (!c) return null;
      return { ...c, joined_at: (r as { joined_at: string }).joined_at };
    })
    .filter((x): x is ClanMembership => x !== null);
  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

// Todos los clanes (para el "join clan").
export async function fetchAllClans(): Promise<Clan[]> {
  const { data } = await supabase
    .from("ed26_calicas_clans")
    .select("id, name, emoji, owner_user_id, created_at")
    .order("name", { ascending: true });
  return (data as Clan[]) ?? [];
}

export async function createClan(name: string, emoji: string, ownerUserId: string): Promise<{ clan?: Clan; error?: string }> {
  const cleanName = name.trim();
  if (cleanName.length < 2) return { error: "El nombre del clan debe tener al menos 2 caracteres." };
  if (cleanName.length > 30) return { error: "Máximo 30 caracteres." };
  const { data, error } = await supabase
    .from("ed26_calicas_clans")
    .insert({ name: cleanName, emoji: emoji || "🛡️", owner_user_id: ownerUserId })
    .select("id, name, emoji, owner_user_id, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un clan con ese nombre." };
    return { error: error.message };
  }
  // Auto-unir al creador
  const join = await joinClan((data as Clan).id, ownerUserId);
  if (join.error) return { error: join.error };
  return { clan: data as Clan };
}

export async function joinClan(clanId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("ed26_calicas_clan_members")
    .insert({ clan_id: clanId, user_id: userId });
  if (error) {
    if (error.code === "23505") return { error: "Ya estás en este clan." };
    if (error.message.includes("maximo de 4 clanes")) return { error: "Solo puedes estar en un máximo de 4 clanes." };
    return { error: error.message };
  }
  return {};
}

export async function leaveClan(clanId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("ed26_calicas_clan_members")
    .delete()
    .eq("clan_id", clanId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  return {};
}

export async function updateClan(clanId: string, ownerUserId: string, updates: { name?: string; emoji?: string }): Promise<{ error?: string }> {
  // RLS está abierta, pero validamos client-side que sea el owner
  const { data: cur } = await supabase
    .from("ed26_calicas_clans")
    .select("owner_user_id")
    .eq("id", clanId)
    .single();
  if (!cur || (cur as { owner_user_id: string }).owner_user_id !== ownerUserId) {
    return { error: "Solo el creador del clan puede editarlo." };
  }
  const patch: Record<string, string> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.emoji !== undefined) patch.emoji = updates.emoji || "🛡️";
  const { error } = await supabase.from("ed26_calicas_clans").update(patch).eq("id", clanId);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe un clan con ese nombre." };
    return { error: error.message };
  }
  return {};
}

// Devuelve mapa user_id -> Set<clan_id>
export async function fetchAllMemberships(): Promise<Map<string, Set<string>>> {
  const { data } = await supabase
    .from("ed26_calicas_clan_members")
    .select("user_id, clan_id");
  const map = new Map<string, Set<string>>();
  for (const r of (data as { user_id: string; clan_id: string }[]) ?? []) {
    if (!map.has(r.user_id)) map.set(r.user_id, new Set());
    map.get(r.user_id)!.add(r.clan_id);
  }
  return map;
}

// Mapa clan_id -> Set<user_id>
export async function fetchClanMembers(): Promise<Map<string, Set<string>>> {
  const { data } = await supabase
    .from("ed26_calicas_clan_members")
    .select("user_id, clan_id");
  const map = new Map<string, Set<string>>();
  for (const r of (data as { user_id: string; clan_id: string }[]) ?? []) {
    if (!map.has(r.clan_id)) map.set(r.clan_id, new Set());
    map.get(r.clan_id)!.add(r.user_id);
  }
  return map;
}
