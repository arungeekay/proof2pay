import { notFound } from "next/navigation";
import { Tag } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeProfile } from "@/lib/agents/trust";
import { db } from "@/lib/db";
import { dateTime, money } from "@/lib/format";
import { payerStatusLines } from "@/lib/trust-score";

export const dynamic = "force-dynamic";

const TONE = { LOW: "warn", MEDIUM: "info", HIGH: "good" } as const;
const BAND = { LOW: "fewer than 10 verified events", MEDIUM: "10 to 50 verified events", HIGH: "more than 50 verified events" };

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-md border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default async function TrustProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = await db.business.findUnique({ where: { id } });
  if (!exists) notFound();
  const [{ business, payer, carrier }, history] = await Promise.all([
    computeProfile(id),
    db.trustScore.findMany({ where: { businessId: id }, orderBy: { computedAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
        <p className="text-muted-foreground text-sm">
          {business.city}, {business.country}
          {business.msmeRegistered && " · registered micro or small enterprise (as declared)"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Tag>Identity: not independently verified (GST and Udyam checks are not connected)</Tag>
        </div>
      </div>

      {payer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              As a payer <Tag tone={TONE[payer.confidence]}>{payer.confidence.toLowerCase()} confidence: {BAND[payer.confidence]}</Tag>
            </CardTitle>
            <CardDescription>
              <ul className="mt-1 list-disc pl-5">
                {payerStatusLines(payer).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Verified payments" value={payer.verifiedPayments} />
            <Metric label="Paid on time" value={payer.onTimeRatePct === null ? "–" : `${payer.onTimeRatePct}%`} />
            <Metric label="Average days late (late payments)" value={payer.averageDaysLate} />
            <Metric label="Currently overdue" value={payer.currentlyOverdue} />
            <Metric label="Disputes raised" value={payer.disputesRaised} />
            <Metric label="Resolved for payer / seller" value={`${payer.disputesResolvedForPayer} / ${payer.disputesResolvedForSeller}`} />
            <Metric label="Verified volume" value={Object.entries(payer.verifiedVolume).map(([c, v]) => money(v, c)).join(" + ") || "–"} />
            <Metric label="Via PayPal / manual record" value={`${payer.viaPayPal} / ${payer.viaManualRecord}`} />
          </CardContent>
        </Card>
      )}

      {carrier && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              As a carrier <Tag tone={TONE[carrier.confidence]}>{carrier.confidence.toLowerCase()} confidence: {BAND[carrier.confidence]}</Tag>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Documented deliveries" value={carrier.documentedDeliveries} />
            <Metric label="Verification pass rate" value={carrier.verificationPassRatePct === null ? "–" : `${carrier.verificationPassRatePct}%`} />
            <Metric label="Clean deliveries" value={carrier.cleanDeliveryRatePct === null ? "–" : `${carrier.cleanDeliveryRatePct}%`} />
            <Metric label="Substantiated damage incidents" value={carrier.substantiatedDamageIncidents} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Methodology</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            Profiles change only on verified events: payments confirmed by PayPal (or, for Indian domestic trade, recorded by an operator after checking the bank transfer),
            delivery verification reports, and disputes resolved through PayPal. Users cannot post allegations, and no AI judgement enters these numbers.
          </p>
          <p>
            Statuses stay distinct: overdue, disputed, under review and resolved are reported as such. Nothing here says a business has defaulted or acted fraudulently.
            Confidence reflects how much verified history exists, so a business with two transactions never looks as established as one with hundreds.
          </p>
          <p>Both parties can respond to any record, and corrections and appeals are reviewed by a person. Historical outcomes do not guarantee future behaviour.</p>
          {history.length > 0 && <p className="text-xs">Last recorded by Trust AI: {dateTime(history[0].computedAt)} (on a verified event).</p>}
        </CardContent>
      </Card>
    </div>
  );
}
