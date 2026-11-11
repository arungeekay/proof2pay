"use client";

// Operational tables on AG Grid Community (free, MIT): the receivables ledger and the audit trail.

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#1f4fa3",
  headerFontWeight: 600,
  fontSize: 13,
  rowBorder: { color: "#e5e7eb" },
  wrapperBorderRadius: 8,
});

export interface ReceivableRow {
  shipmentId: string;
  reference: string;
  buyer: string;
  channel: string;
  currency: string;
  amount: number;
  dueDate: string;
  daysToDue: number | null;
  status: string;
  interest: number;
  preset: string;
  paidAt: string;
  reminders: number;
}

const ShipmentLink = (p: ICellRendererParams<{ shipmentId?: string | null }>) =>
  p.data?.shipmentId ? (
    <Link href={`/shipments/${p.data.shipmentId}`} className="font-mono text-[#1f4fa3] hover:underline">
      {p.value}
    </Link>
  ) : (
    <span>{p.value ?? "–"}</span>
  );

const fmt = (currency: string, v: number) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(v);

const STATUS_STYLE: Record<string, string> = { OVERDUE: "#b42318", RUNNING: "#1f4fa3", PAID: "#067647" };

const receivableColumns: ColDef<ReceivableRow>[] = [
  { field: "reference", headerName: "Shipment", cellRenderer: ShipmentLink, pinned: "left", width: 120 },
  { field: "buyer", flex: 1, minWidth: 180, filter: true },
  { field: "channel", width: 140, filter: true, valueFormatter: (p) => (p.value === "MANUAL_RECORD" ? "Manual record" : "PayPal") },
  { field: "amount", width: 140, type: "rightAligned", valueFormatter: (p) => fmt(p.data!.currency, p.value) },
  { field: "dueDate", headerName: "Due", width: 120 },
  {
    field: "daysToDue",
    headerName: "Days to due",
    width: 120,
    type: "rightAligned",
    cellStyle: (p) => (p.value !== null && p.value < 0 ? { color: "#b42318", fontWeight: 600 } : null),
    valueFormatter: (p) => (p.value === null ? "–" : p.value < 0 ? `${-p.value} overdue` : String(p.value)),
  },
  { field: "status", width: 110, filter: true, cellStyle: (p) => ({ color: STATUS_STYLE[p.value] ?? "inherit", fontWeight: 600 }) },
  { field: "interest", headerName: "MSMED interest", width: 150, type: "rightAligned", valueFormatter: (p) => (p.value ? fmt(p.data!.currency, p.value) : "–") },
  { field: "preset", width: 110, filter: true },
  { field: "reminders", width: 110, type: "rightAligned" },
  { field: "paidAt", headerName: "Paid", width: 120 },
];

export function ReceivablesGrid({ rows }: { rows: ReceivableRow[] }) {
  return (
    <div style={{ height: 560 }}>
      <AgGridReact theme={theme} rowData={rows} columnDefs={receivableColumns} defaultColDef={{ sortable: true, resizable: true }} />
    </div>
  );
}

export interface AuditRow {
  id: string;
  createdAt: string;
  agent: string;
  trigger: string;
  shipmentId: string | null;
  reference: string | null;
  actor: string | null;
  outcome: string;
  reasoning: string;
  model: string;
  confidence: number | null;
  evidence: string;
}

const auditColumns: ColDef<AuditRow>[] = [
  { field: "createdAt", headerName: "Time (IST)", width: 150, sort: "desc" },
  { field: "agent", width: 140, filter: true },
  { field: "reference", headerName: "Shipment", width: 110, filter: true, cellRenderer: ShipmentLink },
  { field: "trigger", width: 200, filter: true },
  { field: "actor", width: 150, filter: true },
  { field: "outcome", headerName: "Outcome / proposal", flex: 2, minWidth: 320, filter: true, tooltipField: "outcome", wrapText: true, autoHeight: true },
  { field: "reasoning", flex: 2, minWidth: 300, filter: true, tooltipField: "reasoning", wrapText: true, autoHeight: true },
  { field: "model", width: 170, filter: true },
  { field: "confidence", width: 110, type: "rightAligned", valueFormatter: (p) => (p.value === null ? "–" : `${Math.round(p.value * 100)}%`) },
  { field: "evidence", headerName: "Evidence refs", width: 260, filter: true, tooltipField: "evidence" },
];

export function AuditGrid({ rows }: { rows: AuditRow[] }) {
  return (
    <div style={{ height: 680 }}>
      <AgGridReact
        theme={theme}
        rowData={rows}
        columnDefs={auditColumns}
        defaultColDef={{ sortable: true, resizable: true, cellStyle: { lineHeight: "1.4", paddingTop: 6, paddingBottom: 6 } }}
        pagination
        paginationPageSize={50}
      />
    </div>
  );
}
