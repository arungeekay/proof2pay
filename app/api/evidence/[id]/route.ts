// Serves an uploaded POD or photo. Files are stored in Postgres as data URLs (Render's free disk is ephemeral).

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evidence = await db.deliveryEvidence.findUnique({ where: { id } });
  const match = evidence?.url.match(/^data:([^;]+);base64,(.*)$/);
  if (!evidence || !match) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: { "content-type": match[1], "cache-control": "private, max-age=3600", "content-disposition": `inline; filename="${evidence.fileName.replace(/"/g, "")}"` },
  });
}
