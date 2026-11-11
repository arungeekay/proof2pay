"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = (state: ActionResult, form: FormData) => Promise<ActionResult>;

interface ButtonSpec {
  label: string;
  name?: string;
  value?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
}

function Buttons({ buttons, pendingLabel, size }: { buttons: ButtonSpec[]; pendingLabel: string; size: "sm" | "default" }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons.map((b) => (
        <Button key={b.label} type="submit" name={b.name} value={b.value} variant={b.variant ?? "default"} size={size} disabled={pending}>
          {b.label}
        </Button>
      ))}
      {pending && (
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Loader2 className="size-3 animate-spin" /> {pendingLabel}
        </span>
      )}
    </div>
  );
}

/** A form bound to a server action, with a pending state and the action's message underneath. */
export function ActionForm({
  action,
  fields,
  label,
  buttons,
  pendingLabel = "Working…",
  variant,
  size = "sm",
  className,
  children,
}: {
  action: Action;
  fields?: Record<string, string>;
  label?: string;
  buttons?: ButtonSpec[];
  pendingLabel?: string;
  variant?: ButtonSpec["variant"];
  size?: "sm" | "default";
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("flex flex-col gap-2", className)}>
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Buttons buttons={buttons ?? [{ label: label ?? "Submit", variant }]} pendingLabel={pendingLabel} size={size} />
      {state && <p className={cn("text-xs", state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{state.message}</p>}
    </form>
  );
}
