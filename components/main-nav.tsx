"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAIN = [
  ["/shipments", "Shipments"],
  ["/approvals", "Approvals"],
  ["/receivables", "Money owed"],
  ["/paypal", "PayPal"],
] as const;

const MORE = [
  ["/trust", "Trust profiles", "How reliably each business pays and delivers"],
  ["/command-center", "Command center", "Ask a question about your money in plain words"],
  ["/audit", "Audit trail", "Every AI action and human decision, with reasons"],
] as const;

/** Header navigation: three everyday pages, and the rest under "More" with a line saying what each is for. */
export function MainNav({ pending }: { pending: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const active = (href: string) => path === href || path.startsWith(`${href}/`);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const link = "hover:bg-muted rounded-md px-2.5 py-1.5";
  const current = "bg-primary/10 text-primary font-medium";

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {MAIN.map(([href, label]) => (
        <Link key={href} href={href} className={cn(link, active(href) && current)}>
          {label}
          {href === "/approvals" && pending > 0 && <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-xs">{pending}</span>}
        </Link>
      ))}
      <div ref={moreRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(link, "flex items-center gap-1", MORE.some(([href]) => active(href)) && current)}
        >
          More <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
        {open && (
          <div className="bg-popover absolute top-full left-0 z-30 mt-1 flex w-72 flex-col rounded-lg border p-1 shadow-lg">
            {MORE.map(([href, label, hint]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("hover:bg-muted flex flex-col rounded-md px-3 py-2", active(href) && "bg-primary/10")}>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground text-xs">{hint}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
