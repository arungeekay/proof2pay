"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  tab: string;
}

interface Panel {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * The shipment page's progress bar and tabs. Clicking a step opens the tab where that step happens.
 * The page gives this a key equal to the suggested tab, so it reopens on the right tab when the shipment moves on.
 */
export function ShipmentWorkspace({ steps, done, initialTab, top, panels }: { steps: Step[]; done: number; initialTab: string; top?: React.ReactNode; panels: Panel[] }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {steps.map((step, i) => {
          const complete = i <= done;
          const now = i === done + 1;
          return (
            <li key={step.label}>
              <button
                type="button"
                onClick={() => setTab(step.tab)}
                title={`Open the ${step.tab} tab`}
                className={cn(
                  "hover:border-primary flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition",
                  complete ? "border-primary/60 bg-primary/5" : now ? "border-primary bg-card ring-primary/30 font-medium ring-2" : "bg-card text-muted-foreground",
                )}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]", complete ? "bg-primary text-primary-foreground" : now ? "border-primary text-primary border" : "bg-muted")}>
                  {complete ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="flex flex-col leading-tight">
                  {step.label}
                  {now && <span className="text-primary text-[10px] font-normal">happening now</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {top}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {panels.map((panel) => (
            <TabsTrigger key={panel.id} value={panel.id}>
              {panel.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {panels.map((panel) => (
          <TabsContent key={panel.id} value={panel.id} className="pt-3">
            {panel.content}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
