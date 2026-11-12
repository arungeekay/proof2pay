"use client";

import { useRef } from "react";

export function PersonaSwitcher({
  personas,
  currentId,
  action,
}: {
  personas: { id: string; label: string }[];
  currentId: string;
  action: (form: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex items-center gap-2 text-sm">
      <label htmlFor="persona" className="text-muted-foreground hidden sm:inline" title="This demo has no login. Pick a person to see the app as they see it.">
        Viewing as
      </label>
      <select
        key={currentId}
        id="persona"
        name="userId"
        defaultValue={currentId}
        onChange={() => formRef.current?.requestSubmit()}
        className="bg-background h-8 rounded-md border px-2 text-sm"
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </form>
  );
}
