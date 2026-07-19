import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autoResolve, FINAL_MATCH_ID } from "@/lib/final-bonus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["ank892@gmail.com", "mfuentes@miguelfuentes.org"]);

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").toLowerCase().trim();
  } catch {}
  if (!ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  const sb = getServerSupabase();

  const { data: match, error: mErr } = await sb
    .from("ed26_calicas_matches")
    .select("id, home_score, away_score, home_scorers, away_scorers, finished")
    .eq("id", FINAL_MATCH_ID)
    .maybeSingle();

  if (mErr || !match) {
    return NextResponse.json({ error: "match_not_found", details: mErr?.message }, { status: 404 });
  }
  if (match.home_score === null || match.away_score === null) {
    return NextResponse.json({ error: "no_score_yet" }, { status: 400 });
  }

  const auto = autoResolve(
    Number(match.home_score) || 0,
    Number(match.away_score) || 0,
    match.home_scorers ?? null,
    match.away_scorers ?? null,
  );

  const now = new Date().toISOString();
  const { error: uErr } = await sb.from("ed26_calicas_final_results").upsert({
    match_id: FINAL_MATCH_ID,
    ...auto,
    resolved_auto_at: now,
    updated_at: now,
  }, { onConflict: "match_id" });

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, resolved: auto });
}
