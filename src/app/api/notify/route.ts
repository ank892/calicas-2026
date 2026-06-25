import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Envía un correo a usuarios con partidos en las próximas ~18-36 horas
// que aún no tienen pronóstico.
//
// Requiere variables de entorno:
//   RESEND_API_KEY   - API key de https://resend.com
//   NOTIFY_FROM      - "Calicas 2026 <onboarding@resend.dev>" (opcional, hay default)
//
// Si RESEND_API_KEY no está set, el endpoint devuelve {ok:true, skipped:true}.

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() { return run(); }
export async function POST() { return run(); }

type MatchRow = {
  id: string; home_team_name: string; away_team_name: string;
  group_letter: string | null; phase: string; kickoff_utc: string | null;
};
type UserRow = { id: string; email: string; display_name: string };

async function run() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM || "Calicas 2026 <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://calicas-2026.vercel.app";

  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not set" });
  }

  const sb = getServerSupabase();
  const now = Date.now();
  const windowStart = new Date(now + 18 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 36 * 60 * 60 * 1000).toISOString();

  const { data: upcomingMatches } = await sb
    .from("ed26_calicas_matches")
    .select("id, home_team_name, away_team_name, group_letter, phase, kickoff_utc")
    .gte("kickoff_utc", windowStart)
    .lte("kickoff_utc", windowEnd)
    .eq("finished", false)
    .order("kickoff_utc", { ascending: true });

  const matches = (upcomingMatches as MatchRow[]) ?? [];
  if (matches.length === 0) {
    return NextResponse.json({ ok: true, matches: 0, emails_sent: 0 });
  }

  const { data: users } = await sb.from("ed26_calicas_users").select("id, email, display_name");
  const allUsers = (users as UserRow[]) ?? [];

  const matchIds = matches.map((m) => m.id);
  const { data: preds } = await sb
    .from("ed26_calicas_predictions").select("user_id, match_id").in("match_id", matchIds);
  const predSet = new Set(((preds as { user_id: string; match_id: string }[]) ?? []).map((p) => `${p.user_id}|${p.match_id}`));

  const { data: logRows } = await sb
    .from("ed26_calicas_notifications_log").select("user_id, match_id").in("match_id", matchIds);
  const sentSet = new Set(((logRows as { user_id: string; match_id: string }[]) ?? []).map((r) => `${r.user_id}|${r.match_id}`));

  let sent = 0;
  const errors: string[] = [];

  for (const u of allUsers) {
    if (!u.email) continue;
    const missing = matches.filter((m) => !predSet.has(`${u.id}|${m.id}`) && !sentSet.has(`${u.id}|${m.id}`));
    if (missing.length === 0) continue;

    const matchesList = missing.map((m) => {
      const date = m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleString("es-CR", {
        timeZone: "America/Costa_Rica", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";
      return `<li><b>${escapeHtml(m.home_team_name)} vs ${escapeHtml(m.away_team_name)}</b> · ${escapeHtml(date)} CR${m.group_letter ? ` · Grupo ${m.group_letter}` : ""}</li>`;
    }).join("");

    const subject = missing.length === 1
      ? `⏰ Te falta pronosticar: ${missing[0].home_team_name} vs ${missing[0].away_team_name}`
      : `⏰ Te faltan ${missing.length} pronósticos para mañana`;

    const html = renderEmail({ name: u.display_name, listHtml: matchesList, appUrl });

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: u.email, subject, html }),
    });
    if (!r.ok) {
      errors.push(`${u.email}: ${r.status}`);
      continue;
    }
    sent++;
    const rows = missing.map((m) => ({ user_id: u.id, match_id: m.id }));
    await sb.from("ed26_calicas_notifications_log").upsert(rows, { onConflict: "user_id,match_id" });
  }

  return NextResponse.json({ ok: true, matches: matches.length, users: allUsers.length, emails_sent: sent, errors });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderEmail({ name, listHtml, appUrl }: { name: string; listHtml: string; appUrl: string }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Calicas 2026</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e6e9f2;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(90deg,#c8102e 0%,#ffd400 100%);height:6px;border-radius:3px;margin-bottom:18px;"></div>
    <h1 style="margin:0 0 4px;font-size:22px;">
      <span style="color:#c8102e;">CALICAS</span> <span style="color:#ffd400;">2026</span>
    </h1>
    <p style="margin:0 0 16px;color:#9aa0b4;font-size:13px;">Hola ${escapeHtml(name)}, te recordamos tus pronósticos pendientes.</p>
    <div style="background:#141a2c;border:1px solid #2a3148;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#ffd400;font-weight:700;">Partidos sin pronóstico</div>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:14px;">${listHtml}</ul>
    </div>
    <p style="margin:18px 0 0;font-size:13px;color:#9aa0b4;">Pronosticá ahora y no perdás puntos 🎯</p>
    <a href="${appUrl}" style="display:inline-block;margin-top:12px;background:#c8102e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">Abrir CALICAS 2026 →</a>
    <p style="margin:24px 0 0;font-size:11px;color:#6b7185;">Si no querés recibir más estos correos, ignoralos: solo se envían cuando hay partidos al día siguiente con pronóstico pendiente.</p>
  </div>
</body></html>`;
}
