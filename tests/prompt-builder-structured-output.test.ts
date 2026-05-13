import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPromptBuilderFinalPrompts } from "../ui/src/lib/promptBuilderStructuredOutput.ts";

describe("prompt builder structured output parser", () => {
  it("extracts Korean and English final prompt sections from builder output", () => {
    const parsed = extractPromptBuilderFinalPrompts(`
Brief Intent Summary:
A calm editorial portrait prompt.

Final Prompt - Korean:
차분한 자연광의 에디토리얼 인물 사진.

Final Prompt - English:
A calm editorial portrait in natural light.

Notes:
Use a square crop.
`);

    assert.ok(parsed);
    assert.equal(parsed.summary, "A calm editorial portrait prompt.");
    assert.equal(parsed.prompts.length, 2);
    assert.deepEqual(parsed.prompts.map((prompt) => prompt.language), ["ko", "en"]);
    assert.equal(parsed.prompts[0]?.text, "차분한 자연광의 에디토리얼 인물 사진.");
    assert.equal(parsed.prompts[1]?.text, "A calm editorial portrait in natural light.");
    assert.equal(parsed.notes, "Use a square crop.");
  });

  it("ignores ordinary chat replies that are not final prompt outputs", () => {
    const parsed = extractPromptBuilderFinalPrompts("좋아요. 먼저 구도와 분위기를 정해보면 더 안정적입니다.");

    assert.equal(parsed, null);
  });
});
