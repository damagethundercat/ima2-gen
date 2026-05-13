import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("multimode frontend UX contract", () => {
  it("reuses the existing count picker row while binding multimode to max images", () => {
    const countPicker = readSource("ui/src/components/CountPicker.tsx");
    const controls = readSource("ui/src/components/GenerationControlsPanel.tsx");

    assert.match(countPicker, /const QUICK_COUNTS = \[1, 2, 4\] as const/);
    assert.match(countPicker, /const uiMode = useAppStore\(\(s\) => s\.uiMode\)/);
    assert.match(countPicker, /const multimodeEnabled = useAppStore\(\(s\) => s\.multimode\)/);
    assert.match(countPicker, /const multimodeMaxImages = useAppStore\(\(s\) => s\.multimodeMaxImages\)/);
    assert.match(countPicker, /const multimode = uiMode === "classic" && multimodeEnabled/);
    assert.match(countPicker, /const value = multimode \? multimodeMaxImages : count/);
    assert.match(countPicker, /Math\.min\(8, Math\.max\(1, Math\.trunc\(value \|\| 1\)\)\)/);
    assert.match(controls, /const showMultimodeControls = uiMode === "classic"/);
    assert.match(controls, /className=\{`multimode-toggle__button/);
    assert.doesNotMatch(controls, /disabled=\{activeGenerations > 0\}/);
    assert.doesNotMatch(controls, /toggleDisabledGenerating/);
  });

  it("branches generate into a separate multimode streaming flow", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const api = readSource("ui/src/lib/api.ts");

    assert.match(store, /multimodeMaxImages: Count/);
    assert.match(store, /multimodeAbortControllers:\s*Record<string,\s*AbortController>/);
    assert.match(store, /multimodeSequences:\s*Record<string,\s*MultimodeSequenceState>/);
    assert.match(store, /multimodePreviewFlightId:\s*string\s*\|\s*null/);
    assert.match(store, /const useMultimode = s\.uiMode === "classic" && s\.multimode/);
    assert.match(store, /if \(useMultimode\) \{[\s\S]*?await get\(\)\.generateMultimode\(\);[\s\S]*?return;[\s\S]*?\}/);
    assert.match(store, /if \(enabled && get\(\)\.uiMode !== "classic"\) return/);
    assert.match(store, /if \(s\.uiMode !== "classic"\) return/);
    assert.match(store, /postMultimodeGenerateStream\(/);
    assert.match(store, /signal: controller\.signal/);
    assert.match(store, /cancelMultimode: \(\) => \{/);
    assert.match(api, /postMultimodeGenerateStream/);
    assert.match(api, /signal\?: AbortSignal/);
  });

  it("keeps multimode sequence rendering separate from currentImage", () => {
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const preview = readSource("ui/src/components/MultimodeSequencePreview.tsx");
    const types = readSource("ui/src/types.ts");
    const store = readSource("ui/src/store/useAppStore.ts");

    assert.match(canvas, /multimodeSequence \? \(/);
    assert.match(canvas, /<MultimodeSequencePreview \/>/);
    assert.match(preview, /sequence\.requested/);
    assert.match(preview, /cancelMultimode/);
    assert.match(types, /export type MultimodeSequenceStatus = "pending" \| "partial" \| "complete" \| "empty" \| "error" \| "canceled"/);
    assert.match(types, /sequenceId\?: string \| null/);
    assert.match(types, /sequenceTotalRequested\?: number \| null/);
    assert.match(store, /sequenceId: it\.sequenceId \?\? null/);
    assert.match(store, /sequenceStatus: it\.sequenceStatus \?\? null/);
  });

  it("promotes multimode slot and history selections back to the large image viewer", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const preview = readSource("ui/src/components/MultimodeSequencePreview.tsx");
    const selectHistoryBody = store.split(/selectHistory:\s*\(item\)\s*=>\s*\{/)[1] ?? "";

    assert.match(preview, /selectHistory\(image\)/);
    assert.match(selectHistoryBody, /multimodePreviewFlightId:\s*null/);
  });

  it("groups completed multimode history into sequence cards that reopen the sequence preview", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const sidebar = readSource("ui/src/components/SidebarHistory.tsx");
    const css = readSource("ui/src/index.css");

    assert.match(store, /showHistorySequence:\s*\(sequenceId: string\) => void/);
    assert.match(store, /showHistorySequence:\s*\(sequenceId\) => \{/);
    assert.match(store, /const previewId = `history:\$\{sequenceId\}`/);
    assert.match(store, /multimodePreviewFlightId:\s*previewId/);
    assert.match(sidebar, /function groupSidebarHistoryEntries/);
    assert.match(sidebar, /function getSequenceThumbSlotCount/);
    assert.match(sidebar, /type:\s*"sequence"/);
    assert.match(sidebar, /showHistorySequence\(entry\.sequenceId\)/);
    assert.match(sidebar, /sidebar-history__sequence/);
    assert.match(sidebar, /sidebar-history__sequence-grid count-\$\{getSequenceThumbSlotCount\(entry\.items\.length\)\}/);
    assert.match(sidebar, /Array\.from\(\{ length: getSequenceThumbSlotCount\(entry\.items\.length\) \}/);
    assert.match(css, /\.sidebar-history__sequence\s*\{/);
    assert.match(css, /\.sidebar-history__sequence-grid\s*\{/);
    assert.match(css, /\.sidebar-history__sequence-grid\.count-3,\s*[\s\S]*?\.sidebar-history__sequence-grid\.count-4\s*\{[\s\S]*?grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("sizes the multimode sequence preview as a primary canvas surface", () => {
    const css = readSource("ui/src/index.css");

    assert.match(css, /\.multimode-sequence \{[\s\S]*?width:\s*min\(100%,\s*1040px\)/);
    assert.match(css, /\.multimode-sequence \{[\s\S]*?height:\s*100%/);
    assert.match(css, /\.multimode-sequence__grid \{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(220px,\s*1fr\)\)/);
    assert.match(css, /\.multimode-sequence__grid \{[\s\S]*?grid-auto-rows:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /\.multimode-sequence__grid\.count-4\s*\{[\s\S]*?grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.multimode-sequence__slot \{[\s\S]*?min-height:\s*0/);
    assert.match(css, /\.multimode-sequence__slot \{[\s\S]*?aspect-ratio:\s*6\s*\/\s*5/);
    assert.match(css, /\.multimode-sequence__slot img \{[\s\S]*?object-fit:\s*cover/);
  });

  it("keeps the new image plus card active only for an actual draft session", () => {
    const sidebar = readSource("ui/src/components/Sidebar.tsx");

    assert.match(sidebar, /const currentImage = useAppStore\(\(s\) => s\.currentImage\)/);
    assert.match(sidebar, /const multimodePreviewFlightId = useAppStore\(\(s\) => s\.multimodePreviewFlightId\)/);
    assert.match(sidebar, /const isActive = currentImage === null && multimodePreviewFlightId === null/);
  });

  it("reconciles multimode in-flight phase and treats user cancellation as canceled", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const api = readSource("ui/src/lib/api.ts");
    const preview = readSource("ui/src/components/MultimodeSequencePreview.tsx");

    assert.match(api, /kind\?: "classic" \| "node" \| "multimode"/);
    assert.match(store, /type InflightQueryScope = \{/);
    assert.match(store, /kind: NonNullable<PersistedInFlight\["kind"\]>/);
    assert.match(store, /job\.kind === "multimode"/);
    assert.match(store, /scopes\.push\(\{ kind: "multimode" \}\)/);
    assert.match(store, /fetchInflightScopes\(scopes\)/);
    assert.match(store, /matchesInflightScope\(f, scopes\)/);
    assert.doesNotMatch(store, /hasMultimode && state\.uiMode !== "node"/);
    assert.match(store, /status: "canceled"/);
    assert.doesNotMatch(store, /status: current\.images\.length > 0 \? "partial" : "empty"/);
    assert.match(preview, /sequence\.status === "canceled"/);
    assert.match(preview, /multimode\.canceled/);
  });

  it("adds multimode copy and upper-bound cost display", () => {
    const cost = readSource("ui/src/components/CostEstimate.tsx");
    const composer = readSource("ui/src/components/PromptComposer.tsx");
    const en = readSource("ui/src/i18n/en.json");
    const ko = readSource("ui/src/i18n/ko.json");
    const css = readSource("ui/src/index.css");

    assert.match(cost, /multimodeMaxImages/);
    assert.match(cost, /cost \* multimodeMaxImages/);
    assert.match(composer, /const multimode = useAppStore\(\(s\) => s\.multimode\)/);
    assert.match(composer, /composer--multimode/);
    assert.match(composer, /role="group"/);
    assert.match(composer, /multimode\.composerAriaLabel/);
    assert.match(composer, /multimode\.composerBadge/);
    assert.match(composer, /multimode\.promptPlaceholder/);
    assert.match(en, /"multimode"/);
    assert.match(en, /"multimodeApprox"/);
    assert.match(en, /"composerBadge"/);
    assert.match(en, /"composerAriaLabel"/);
    assert.match(en, /"promptPlaceholder"/);
    assert.match(ko, /"multimode"/);
    assert.match(ko, /"multimodeApprox"/);
    assert.match(ko, /"composerBadge"/);
    assert.match(ko, /"composerAriaLabel"/);
    assert.match(ko, /"promptPlaceholder"/);
    assert.match(css, /\.multimode-sequence/);
    assert.match(css, /\.multimode-toggle__button/);
    assert.match(css, /\.composer--multimode/);
    assert.match(css, /\.composer__mode-badge/);
  });
});
