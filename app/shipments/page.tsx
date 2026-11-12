import Link from "next/link";
import { SimTag, StatusBadge } from "@/components/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { day, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const shipments = await db.shipment.findMany({
    orderBy: [{ seeded: "asc" }, { reference: "desc" }],
    include: { buyer: true, carrier: true },
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
        <p className="text-muted-foreground text-sm">Click a reference to open a shipment. SH-1042 and SH-1039 are the demo stories; the rows marked “history” are past shipments that feed the trust profiles.</p>
      </div>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/shipments/${s.id}`} className="text-primary font-mono hover:underline">
                    {s.reference}
                  </Link>{" "}
                  {s.seeded && <span className="text-muted-foreground text-xs">history</span>}
                </TableCell>
                <TableCell>
                  {s.quantity} {s.unit} of {s.cargoDescription}
                </TableCell>
                <TableCell>
                  <Link href={`/trust/${s.buyerId}`} className="hover:underline">
                    {s.buyer.name}
                  </Link>{" "}
                  {s.destinationCountry === "IN" && <SimTag>domestic</SimTag>}
                </TableCell>
                <TableCell>
                  <Link href={`/trust/${s.carrierId}`} className="hover:underline">
                    {s.carrier.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(s.declaredValue, s.currency)}</TableCell>
                <TableCell>{day(s.deliveredAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
