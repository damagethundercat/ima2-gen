export type PromptBuilderFinalPromptLanguage = "ko" | "en";

export type PromptBuilderFinalPromptBlock = {
  language: PromptBuilderFinalPromptLanguage;
  heading: string;
  text: string;
};

export type PromptBuilderStructuredOutput = {
  summary?: string;
  prompts: PromptBuilderFinalPromptBlock[];
  notes?: string;
};

type SectionKey = "summary" | "ko" | "en" | "notes";

const SECTION_KEYS: Record<string, SectionKey> = {
  "Brief Intent Summary": "summary",
  "Final Prompt - Korean": "ko",
  "Final Prompt - English": "en",
  Notes: "notes",
};

const SECTION_HEADING_PATTERN = /^(Brief Intent Summary|Final Prompt - Korean|Final Prompt - English|Notes):\s*(.*)$/gim;

function cleanSectionText(value: string): string {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  return (fenceMatch?.[1] ?? trimmed).trim();
}

function collectSections(content: string): Partial<Record<SectionKey, string>> {
  const sections: Partial<Record<SectionKey, string>> = {};
  const matches = Array.from(content.matchAll(SECTION_HEADING_PATTERN));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = match[1] ?? "";
    const key = SECTION_KEYS[heading];
    if (!key || typeof match.index !== "number") continue;
    const inline = match[2]?.trim() ?? "";
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? content.length;
    const body = cleanSectionText([inline, content.slice(bodyStart, bodyEnd)].filter(Boolean).join("\n"));
    if (body) sections[key] = body;
  }
  return sections;
}

export function extractPromptBuilderFinalPrompts(content: string): PromptBuilderStructuredOutput | null {
  const sections = collectSections(content);
  const prompts: PromptBuilderFinalPromptBlock[] = [];
  if (sections.ko) {
    prompts.push({
      language: "ko",
      heading: "Final Prompt - Korean",
      text: sections.ko,
    });
  }
  if (sections.en) {
    prompts.push({
      language: "en",
      heading: "Final Prompt - English",
      text: sections.en,
    });
  }
  if (prompts.length === 0) return null;
  return {
    summary: sections.summary,
    prompts,
    notes: sections.notes,
  };
}
