import { db } from "@/lib/db";

// Placeholder until the role switcher (plan Section 8) lands. Reads the database so a deploy proves the wiring.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [shipments, demo] = await Promise.all([
    db.shipment.count(),
    db.shipment.findUnique({ where: { reference: "SH-1042" }, select: { status: true } }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Proof2Pay</h1>
      <p className="text-muted-foreground">
        AI agents that turn a shipment into a signed contract, a verified delivery, a PayPal settlement, and a
        public track record.
      </p>
      <p className="font-mono text-sm">
        {shipments} shipments in the database. SH-1042: {demo?.status ?? "not seeded (run npm run db:seed)"}.
      </p>
    </main>
  );
}
