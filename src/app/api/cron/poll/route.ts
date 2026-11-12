import { NextResponse } from "next/server";
import { pollNow } from "@/lib/poll/service";

export const dynamic = "force-dynamic";

/**
 * External trigger for hosted setups (Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`).
 * Example: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/poll
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await pollNow();
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
