import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness without touching the database, so Render's health check and the keep-alive ping let Neon scale to zero. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
