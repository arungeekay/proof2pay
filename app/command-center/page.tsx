import { commandCenterAction } from "@/app/actions";
import { CommandCenter } from "@/components/command-center";

export const dynamic = "force-dynamic";

export default function CommandCenterPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial command center</h1>
        <p className="text-muted-foreground text-sm">
          Type a question about shipments or money in plain words, or click one of the examples. Gemini turns it into a read-only search (it never changes data)
          and AG Grid shows the answer. Every question is recorded in the audit trail.
        </p>
      </div>
      <CommandCenter action={commandCenterAction} />
    </div>
  );
}
