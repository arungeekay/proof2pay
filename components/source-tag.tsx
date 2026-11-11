import { SimTag, Tag } from "@/components/status";

/** Which model produced an AI output, or a label when the labelled sample output was used instead. */
export function SourceTag({ source, model }: { source?: string; model?: string | null }) {
  if (source === "sample" || model?.startsWith("sample")) return <SimTag>sample AI output (Gemini unavailable)</SimTag>;
  return model ? <Tag tone="info">AI: {model}</Tag> : null;
}
