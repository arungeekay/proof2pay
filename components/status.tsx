import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
  sim: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  DRAFT: "muted",
  CONTRACT_PENDING: "info",
  PENDING_ACCEPTANCE: "info",
  CONTRACTED: "info",
  ACCEPTED: "good",
  IN_TRANSIT: "info",
  DELIVERED: "info",
  VERIFIED: "good",
  VERIFIED_WITH_DISCREPANCY: "warn",
  VERIFICATION_FAILED: "bad",
  FAILED: "bad",
  INVOICED: "info",
  SENT: "info",
  RUNNING: "info",
  PAID: "good",
  EXECUTED: "good",
  APPROVED: "good",
  CLOSED: "good",
  OVERDUE: "bad",
  DISPUTED: "warn",
  PENDING: "warn",
  REJECTED: "muted",
  SUPERSEDED: "muted",
  QUOTED: "info",
  ACTIVE: "good",
  BLOCKING: "bad",
  WARNING: "warn",
  INFO: "info",
  RESOLVED: "good",
  WAITING_FOR_SELLER_RESPONSE: "warn",
  UNDER_REVIEW: "info",
  RECOMMENDED: "info",
  PARTIALLY_REFUNDED: "warn",
  READY: "info",
  SUBMITTED: "good",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge className={cn(TONES[STATUS_TONE[status] ?? "muted"], className)}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function Tag({ tone = "muted", children, title }: { tone?: keyof typeof TONES; children: React.ReactNode; title?: string }) {
  return (
    <Badge title={title} className={TONES[tone]}>
      {children}
    </Badge>
  );
}

/** Labels anything that is not real: mocked PayPal, simulated insurer, replayed dispute, sample AI output. */
export function SimTag({ children }: { children: React.ReactNode }) {
  return <Tag tone="sim">{children}</Tag>;
}
