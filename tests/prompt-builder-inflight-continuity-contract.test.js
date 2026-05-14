import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("prompt builder in-flight continuity contract", () => {
  it("stores draft builder context on classic in-flight jobs and restores it from the launcher", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const runGenerateBlock = store.split(/async runGenerate\(sizeOverride\) \{/)[1] ?? "";
    const showBlock = store.split(/showInFlightJob:\s*\(requestId\) => \{/)[1] ?? "";

    assert.match(store, /promptBuilderScope\?: PromptBuilderScope/);
    assert.match(store, /composerPrompt\?: string/);
    assert.match(store, /composerInsertedPrompts\?: ComposerInsertedPromptSnapshot\[\]/);
    assert.match(runGenerateBlock, /const promptBuilderScope = s\.promptBuilderScope/);
    assert.match(runGenerateBlock, /promptBuilderScope,/);
    assert.match(runGenerateBlock, /composerPrompt,/);
    assert.match(runGenerateBlock, /composerInsertedPrompts,/);
    assert.match(showBlock, /const scope = job\.promptBuilderScope \?\? PROMPT_BUILDER_DRAFT_SCOPE/);
    assert.match(showBlock, /const restoredPrompt = job\.composerPrompt \?\? state\.prompt/);
    assert.match(showBlock, /const restoredInsertedPrompts = normalizeInsertedPromptArray\(job\.composerInsertedPrompts\) \?\? state\.insertedPrompts/);
    assert.match(showBlock, /promptBuilderScope:\s*scope/);
    assert.match(showBlock, /promptBuilderMessages: getPromptBuilderSessionMessages\(state\.promptBuilderSessions, scope\)/);
  });

  it("moves draft builder conversations onto the completed generated image scope", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const addHistoryBlock = store.split(/async function addHistory\(/)[1] ?? "";

    assert.match(addHistoryBlock, /const sourceJob = state\.inFlight\.find\(\(job\) => job\.id === merged\.requestId\)/);
    assert.match(addHistoryBlock, /const sourceScope = sourceJob\?\.promptBuilderScope/);
    assert.match(addHistoryBlock, /const sourceMessages = sourceScope/);
    assert.match(addHistoryBlock, /\[scope\.id\]: sourceMessages/);
    assert.match(addHistoryBlock, /promptBuilderMessages: getPromptBuilderSessionMessages\(promptBuilderSessions, scope\)/);
  });

  it("persists prompt builder conversations across reloads and generated image handoff", () => {
    const registry = readSource("ui/src/store/persistenceRegistry.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const sendBlock = store.split(/sendPromptBuilderMessage:\s*async \(content\) => \{/)[1] ?? "";
    const newSessionBlock = store.split(/startNewImageSession:\s*\(\) => \{/)[1] ?? "";
    const addHistoryBlock = store.split(/async function addHistory\(/)[1] ?? "";

    assert.match(registry, /"ima2\.promptBuilderSessions"/);
    assert.match(registry, /PROMPT_BUILDER_SESSIONS_STORAGE_KEY/);
    assert.match(store, /PROMPT_BUILDER_SESSIONS_STORAGE_KEY/);
    assert.match(store, /function loadPromptBuilderSessions\(\): Record<string, PromptBuilderMessage\[\]>/);
    assert.match(store, /function persistPromptBuilderSessions\(sessions: Record<string, PromptBuilderMessage\[\]>\): void/);
    assert.match(store, /const initialPromptBuilderSessions = loadPromptBuilderSessions\(\)/);
    assert.match(store, /promptBuilderMessages:\s*\[\]/);
    assert.match(store, /promptBuilderSessions: initialPromptBuilderSessions/);

    assert.match(sendBlock, /const promptBuilderSessions = \{\s*\.\.\.state\.promptBuilderSessions,[\s\S]*?\[scope\.id\]: messages,/);
    assert.match(sendBlock, /persistPromptBuilderSessions\(promptBuilderSessions\)/);
    assert.match(sendBlock, /const promptBuilderMessages = \[/);
    assert.match(sendBlock, /const promptBuilderSessions = \{\s*\.\.\.current\.promptBuilderSessions,[\s\S]*?\[scope\.id\]: promptBuilderMessages,/);
    assert.match(sendBlock, /persistPromptBuilderSessions\(promptBuilderSessions\)/);
    assert.match(newSessionBlock, /persistPromptBuilderSessions\(promptBuilderSessions\)/);
    assert.match(addHistoryBlock, /persistPromptBuilderSessions\(promptBuilderSessions\)/);
  });

  it("hydrates into a new image session instead of selecting the latest history image", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const hydrateBlock = store.split(/hydrateHistory\(\) \{/)[1] ?? "";

    assert.match(store, /prompt:\s*""/);
    assert.match(store, /insertedPrompts:\s*\[\]/);
    assert.doesNotMatch(store, /prompt: storedGenerationDefaults\.prompt \?\? ""/);
    assert.doesNotMatch(store, /insertedPrompts: storedGenerationDefaults\.insertedPrompts \?\? \[\]/);
    assert.match(hydrateBlock, /saveGenerationDefaultsPatch\(\{ prompt: "", insertedPrompts: \[\] \}\)/);
    assert.match(hydrateBlock, /currentImage:\s*null/);
    assert.match(hydrateBlock, /prompt:\s*""/);
    assert.match(hydrateBlock, /insertedPrompts:\s*\[\]/);
    assert.match(store, /function shouldRetainDraftPromptBuilderSession\(inFlight: PersistedInFlight\[\]\): boolean/);
    assert.match(store, /function omitPromptBuilderDraftSession\(\s*sessions: Record<string, PromptBuilderMessage\[\]>,\s*\): Record<string, PromptBuilderMessage\[\]>/);
    assert.match(hydrateBlock, /const retainedInFlight = get\(\)\.inFlight\.length > 0 \? get\(\)\.inFlight : loadInFlight\(\)/);
    assert.match(hydrateBlock, /const retainDraftPromptBuilderSession = shouldRetainDraftPromptBuilderSession\(retainedInFlight\)/);
    assert.match(hydrateBlock, /const promptBuilderSessions = retainDraftPromptBuilderSession\s*\?\s*state\.promptBuilderSessions\s*:\s*omitPromptBuilderDraftSession\(state\.promptBuilderSessions\)/);
    assert.match(hydrateBlock, /promptBuilderScope:\s*PROMPT_BUILDER_DRAFT_SCOPE/);
    assert.match(hydrateBlock, /promptBuilderMessages: getPromptBuilderSessionMessages\(\s*promptBuilderSessions,\s*PROMPT_BUILDER_DRAFT_SCOPE,\s*\)/);
    assert.match(hydrateBlock, /promptBuilderSessions,/);
    assert.doesNotMatch(hydrateBlock, /visibleHistory\[0\]/);
  });
});
