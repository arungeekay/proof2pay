import { commandCenterAction } from "@/app/actions";
import { CommandCenter } from "@/components/command-center";

export const dynamic = "force-dynamic";

export default function CommandCenterPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial command center</h1>
        <p className="text-muted-foreground text-sm">
          Ask in plain language. Gemini turns the question into a structured, read-only query (it never writes SQL or changes data), and AG Grid shows the
          result. Every question is recorded in the audit trail.
        </p>
      </div>
      <CommandCenter action={commandCenterAction} />
    </div>
  );
}
