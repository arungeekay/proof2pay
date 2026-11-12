"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shown in place of a page that failed to load, with a way to try again. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex max-w-xl flex-col gap-3 py-16">
      <h1 className="text-xl font-semibold">This page did not load</h1>
      <p className="text-muted-foreground text-sm">
        The database took too long to answer. It goes to sleep when the demo has been idle for a few minutes and needs a moment to wake up. Nothing was lost.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
    </div>
  );
}
