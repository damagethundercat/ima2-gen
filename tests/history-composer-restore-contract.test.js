import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("history composer restore contract", () => {
  it("persists raw composer prompts and inserted prompt block snapshots with generated history", () => {
    const types = readSource("ui/src/types.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const api = readSource("ui/src/lib/api.ts");
    const generateRoute = readSource("routes/generate.ts");
    const multimodeRoute = readSource("routes/multimode.ts");
    const historyList = readSource("lib/historyList.ts");

    assert.match(types, /export type ComposerInsertedPromptSnapshot/);
    assert.match(types, /composerPrompt\?: string \| null/);
    assert.match(types, /composerInsertedPrompts\?: ComposerInsertedPromptSnapshot\[\] \| null/);
    assert.match(types, /composerPrompt\?: string/);
    assert.match(types, /composerInsertedPrompts\?: ComposerInsertedPromptSnapshot\[\]/);
    assert.match(api, /composerPrompt\?: string \| null/);
    assert.match(api, /composerInsertedPrompts\?: ComposerInsertedPromptSnapshot\[\] \| null/);
    assert.match(store, /const composerPrompt = s\.prompt/);
    assert.match(store, /const composerInsertedPrompts = cloneInsertedPrompts\(s\.insertedPrompts\)/);
    assert.match(store, /composerPrompt,/);
    assert.match(store, /composerInsertedPrompts,/);
    assert.match(generateRoute, /normalizeComposerInsertedPrompts/);
    assert.match(generateRoute, /composerPrompt,/);
    assert.match(generateRoute, /composerInsertedPrompts,/);
    assert.match(multimodeRoute, /normalizeComposerInsertedPrompts/);
    assert.match(multimodeRoute, /composerPrompt,/);
    assert.match(multimodeRoute, /composerInsertedPrompts,/);
    assert.match(historyList, /composerPrompt: meta\?\.composerPrompt/);
    assert.match(historyList, /composerInsertedPrompts: meta\?\.composerInsertedPrompts/);
  });

  it("restores a selected history item's composer prompt and library blocks into the composer", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const selectHistoryBody = store.split(/selectHistory:\s*\(item\)\s*=>\s*\{/)[1] ?? "";

    assert.match(store, /function getHistoryComposerPrompt\(item: GenerateItem\): string/);
    assert.match(selectHistoryBody, /const restoredPrompt = getHistoryComposerPrompt\(target\)/);
    assert.match(selectHistoryBody, /const restoredInsertedPrompts = normalizeInsertedPromptArray\(target\.composerInsertedPrompts\) \?\? \[\]/);
    assert.match(selectHistoryBody, /saveGenerationDefaultsPatch\(\{ prompt: restoredPrompt, insertedPrompts: restoredInsertedPrompts \}\)/);
    assert.match(selectHistoryBody, /prompt: restoredPrompt/);
    assert.match(selectHistoryBody, /insertedPrompts: restoredInsertedPrompts/);
  });
});
