import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EvidencePackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await db.evidencePack.findUnique({ where: { id }, include: { shipment: true } });
  if (!pack) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/shipments/${pack.shipmentId}`} className="text-primary font-mono hover:underline">
          ← {pack.shipment.reference}
        </Link>
        <StatusBadge status={pack.status} />
        <span className="text-muted-foreground">prepared {dateTime(pack.createdAt)}</span>
        {pack.submittedAt && <span className="text-muted-foreground">submitted {dateTime(pack.submittedAt)}</span>}
      </div>
      <article className="bg-card rounded-lg border p-6">
        <Markdown>{pack.markdown}</Markdown>
      </article>
    </div>
  );
}
