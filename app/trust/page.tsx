import Link from "next/link";
import { Tag } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeProfile } from "@/lib/agents/trust";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TONE = { LOW: "warn", MEDIUM: "info", HIGH: "good" } as const;

export default async function TrustIndex() {
  const businesses = await db.business.findMany({ where: { OR: [{ isBuyer: true }, { isCarrier: true }] }, orderBy: { name: "asc" } });
  const profiles = await Promise.all(businesses.map((b) => computeProfile(b.id)));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trust profiles</h1>
        <p className="text-muted-foreground text-sm">How reliably each business pays and delivers. Click a card for the detail. Profiles are built only from verified events: payments confirmed by PayPal or checked by hand, verified deliveries and resolved disputes.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map(({ business, payer, carrier }) => (
          <Link key={business.id} href={`/trust/${business.id}`}>
            <Card className="hover:border-primary h-full transition">
              <CardHeader>
                <CardTitle>{business.name}</CardTitle>
                <CardDescription>
                  {business.city}, {business.country} · {business.isBuyer ? "payer" : "carrier"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                {payer && (
                  <>
                    <Tag tone={TONE[payer.confidence]}>{payer.confidence.toLowerCase()} confidence</Tag>
                    <span>{payer.verifiedPayments} verified payments</span>
                    {payer.onTimeRatePct !== null && <span>· {payer.onTimeRatePct}% on time</span>}
                    {payer.currentlyOverdue > 0 && <Tag tone="bad">{payer.currentlyOverdue} overdue</Tag>}
                  </>
                )}
                {carrier && (
                  <>
                    <Tag tone={TONE[carrier.confidence]}>{carrier.confidence.toLowerCase()} confidence</Tag>
                    <span>{carrier.documentedDeliveries} documented deliveries</span>
                    {carrier.cleanDeliveryRatePct !== null && <span>· {carrier.cleanDeliveryRatePct}% clean</span>}
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
