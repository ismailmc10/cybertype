import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "Production backend is not configured." },
      { status: 503 },
    );
  try {
    const raw = await req.text();
    if (raw.length > 24000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(raw);
    const allowed = ["snapshot", "join", "tick", "admin"];
    if (!allowed.includes(body.action))
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    const client = createClient(url, key, {
      global: {
        headers: {
          Authorization: req.headers.get("authorization") || `Bearer ${key}`,
        },
      },
      auth: { persistSession: false },
    });
    if (body.action !== "snapshot") {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401 },
        );
    }
    const { data, error } = await client.rpc("cyber_api", {
      action: body.action,
      payload: body.payload || {},
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    // Fail closed if the frontend is deployed before the required migration.
    if (
      typeof data?.event?.leaderboard_visible !== "boolean" ||
      typeof data?.event?.results_finalized !== "boolean"
    )
      return NextResponse.json(
        {
          error:
            "Results security migration is required. Ask the coordinator to apply 002_results_review.sql.",
        },
        { status: 503 },
      );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to process this request." },
      { status: 400 },
    );
  }
}
