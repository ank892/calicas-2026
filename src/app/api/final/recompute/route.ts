import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreFinalPick, FINAL_MATCH_ID, type FinalPick, type FinalResults } from "@/lib/final-bonus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["ank892@gmail.com", "mfuentes@miguelfuentes.org"]);

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Recalcula los puntos de todos los picks contra el resultado oficial.
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

  const { data: results, error: rErr } = await sb
    .from("ed26_calicas_final_results")
    .select("*")
    .eq("match_id", FINAL_MATCH_ID)
    .maybeSingle();

  if (rErr || !results) {
    return NextResponse.json({ error: "no_results", details: rErr?.message }, { status: 404 });
  }

  const { data: picks, error: pErr } = await sb
    .from("ed26_calicas_final_picks")
    .select("*")
    .eq("match_id", FINAL_MATCH_ID);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const rows = (picks ?? []) as FinalPick[];
  const updates: { user_id: string; points: number; breakdown: unknown }[] = [];

  for (const p of rows) {
    const { total, breakdown } = scoreFinalPick(p, results as FinalResults);
    updates.push({ user_id: p.user_id, points: total, breakdown });
  }

  // Update en batch. Como es una final unica, hasta ~50 usuarios seria rapido.
  let updated = 0;
  for (const u of updates) {
    const { error } = await sb.from("ed26_calicas_final_picks")
      .update({ points: u.points, points_breakdown: u.breakdown, updated_at: new Date().toISOString() })
      .eq("user_id", u.user_id)
      .eq("match_id", FINAL_MATCH_ID);
    if (!error) updated += 1;
  }

  return NextResponse.json({ ok: true, updated, total_picks: rows.length });
}
