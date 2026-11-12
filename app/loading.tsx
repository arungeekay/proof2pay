import { Loader2 } from "lucide-react";

/** Shown at once on every page change, while the next page reads its data. */
export default function Loading() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm" role="status">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}
