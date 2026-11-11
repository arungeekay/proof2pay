"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef } from "react";
import type { CommandState } from "@/app/actions";
import type { Column } from "@/lib/agents/command-spec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({ accentColor: "#1f4fa3", headerFontWeight: 600, fontSize: 13, wrapperBorderRadius: 8 });

const fmt = (currency: string, v: number) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(v);

function toColDefs(columns: Column[]): ColDef[] {
  return columns.map((c) => ({
    field: c.field,
    headerName: c.headerName,
    filter: true,
    sortable: true,
    resizable: true,
    flex: c.field === "summary" || c.field === "outcome" ? 2 : 1,
    minWidth: c.kind === "link" ? 110 : 130,
    ...(c.kind === "money" ? { type: "rightAligned", valueFormatter: (p: { value: number; data: { currency?: string } }) => (p.value ? fmt(p.data.currency ?? "USD", p.value) : "–") } : {}),
    ...(c.kind === "number" ? { type: "rightAligned" } : {}),
    ...(c.kind === "link"
      ? {
          cellRenderer: (p: { value: string; data: { id?: string | null } }) =>
            p.data.id ? (
              <Link className="font-mono text-[#1f4fa3] hover:underline" href={`/shipments/${p.data.id}`}>
                {p.value}
              </Link>
            ) : (
              p.value
            ),
        }
      : {}),
  }));
}

export const SUGGESTED = [
  "Show disputed shipments over $10,000 with insurance attached",
  "Which invoices are overdue, and how much MSMED interest has accrued?",
  "What is waiting for my approval?",
  "Everything Resolution AI did in the last 7 days",
];

export function CommandCenter({ action }: { action: (state: CommandState, form: FormData) => Promise<CommandState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const input = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <Input ref={input} name="question" placeholder="Ask about shipments, invoices, disputes, approvals or agent actions…" className="h-10" />
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => {
              if (input.current) input.current.value = q;
              formRef.current?.requestSubmit();
            }}
            className="hover:border-primary bg-card rounded-full border px-3 py-1 text-xs"
          >
            {q}
          </button>
        ))}
      </div>
      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}
      {state?.ok && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold">{state.title}</h2>
            <span className="text-muted-foreground text-sm">
              {state.rows.length} row{state.rows.length === 1 ? "" : "s"}
              {Object.entries(state.totals).map(([c, v]) => ` · ${fmt(c, v)}`)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${state.source === "sample" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
              {state.source === "sample" ? "keyword fallback (Gemini unavailable)" : `interpreted by ${state.model}`}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{state.explanation}</p>
          <div style={state.rows.length > 12 ? { height: 520 } : undefined}>
            <AgGridReact
              theme={theme}
              rowData={state.rows}
              columnDefs={toColDefs(state.columns)}
              domLayout={state.rows.length > 12 ? "normal" : "autoHeight"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
