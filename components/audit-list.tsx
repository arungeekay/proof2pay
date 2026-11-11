import { SourceTag } from "@/components/source-tag";
import { Tag } from "@/components/status";
import type { AuditEvent } from "@/generated/prisma/client";
import { dateTime, humanize } from "@/lib/format";

export function AuditList({ events }: { events: (AuditEvent & { actorUser: { name: string } | null })[] }) {
  return (
    <div className="flex flex-col gap-2">
      {events.map((e) => (
        <div key={e.id} className="bg-card rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">{dateTime(e.createdAt)}</span>
            <Tag tone={e.agent === "OPERATOR" ? "good" : e.agent === "WEBHOOK" ? "warn" : "info"}>{humanize(e.agent)}</Tag>
            <span className="text-muted-foreground font-mono text-xs">{e.trigger}</span>
            {e.actorUser && <span className="text-xs">by {e.actorUser.name}</span>}
            {e.model && <SourceTag model={e.model} />}
            {e.confidence !== null && <Tag>confidence {Math.round(e.confidence * 100)}%</Tag>}
          </div>
          {e.outcome && <p className="mt-1 font-medium">{e.outcome}</p>}
          {e.proposedAction && <p className="mt-1">Proposed: {e.proposedAction}</p>}
          {e.reasoning && <p className="text-muted-foreground mt-1 text-xs">{e.reasoning}</p>}
          {e.evidenceRefs.length > 0 && <p className="text-muted-foreground mt-1 font-mono text-[11px] break-all">{e.evidenceRefs.join(" · ")}</p>}
        </div>
      ))}
    </div>
  );
}
