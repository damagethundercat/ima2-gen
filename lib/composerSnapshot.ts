export type ComposerInsertedPromptSnapshot = {
  id: string;
  name: string;
  text: string;
  placement: "before" | "after";
};

export function normalizeComposerPrompt(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function normalizeComposerInsertedPrompts(value: unknown): ComposerInsertedPromptSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.text !== "string"
    ) {
      return [];
    }
    return [{
      id: item.id,
      name: item.name,
      text: item.text,
      placement: item.placement === "after" ? "after" : "before",
    }];
  });
}
