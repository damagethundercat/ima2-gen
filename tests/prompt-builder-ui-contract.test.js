import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

describe("prompt builder UI contract", () => {
  it("adds an OAuth-only builder panel beside the classic composer", () => {
    const workspace = readSource("ui/src/components/ClassicWorkspace.tsx");
    const rightPanel = readSource("ui/src/components/RightPanel.tsx");
    const panel = readSource("ui/src/components/PromptBuilderPanel.tsx");
    const structuredOutput = readSource("ui/src/lib/promptBuilderStructuredOutput.ts");
    const sidebar = readSource("ui/src/components/Sidebar.tsx");
    const controls = readSource("ui/src/components/GenerationControlsPanel.tsx");
    const api = readSource("ui/src/lib/api.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const css = readSource("ui/src/index.css");
    const en = JSON.parse(readSource("ui/src/i18n/en.json"));
    const ko = JSON.parse(readSource("ui/src/i18n/ko.json"));

    assert.match(workspace, /<div className="classic-workspace__stage">[\s\S]*<Canvas \/>/);
    assert.doesNotMatch(workspace, /ResultDockPanel/);
    assert.match(workspace, /<div className="classic-workspace__dock">[\s\S]*<PromptComposer variant="bottom" \/>/);
    assert.doesNotMatch(workspace, /GenerationControlsPanel/);
    assert.doesNotMatch(workspace, /PromptBuilderPanel/);

    assert.match(rightPanel, /PromptBuilderPanel/);
    assert.match(rightPanel, /usePromptBuilderHome/);
    assert.match(rightPanel, /right-panel-builder-stack/);
    assert.match(rightPanel, /<PromptBuilderPanel variant="sidebar" \/>[\s\S]*<GenerationControlsPanel variant="sidebar" \/>/);
    assert.match(rightPanel, /<GenerationControlsPanel \/>/);

    assert.match(api, /postPromptBuilderChat/);
    assert.match(api, /\/api\/prompt-builder\/chat/);

    assert.match(store, /promptBuilderMessages/);
    assert.match(store, /promptBuilderSessions/);
    assert.match(store, /promptBuilderScope/);
    assert.match(store, /startNewImageSession/);
    assert.match(store, /saveGenerationDefaultsPatch\(\{ prompt: "", insertedPrompts: \[\] \}\)/);
    assert.match(store, /referenceImages: \[\]/);
    assert.match(store, /promptBuilderDraft: ""/);
    assert.match(store, /createPromptBuilderImageScope/);
    assert.match(store, /findPromptBuilderScopeImage/);
    assert.match(store, /const scope = createPromptBuilderImageScope\(merged\);/);
    assert.match(store, /promptBuilderModel/);
    assert.match(store, /promptBuilderModel: "gpt-5\.5"/);
    assert.match(store, /sendPromptBuilderMessage/);
    assert.match(store, /applyPromptBuilderMessageToPrompt/);
    assert.match(store, /insertPromptBuilderMessageAsBlock/);
    assert.match(store, /postPromptBuilderChat/);

    assert.match(panel, /variant = "panel"/);
    assert.match(panel, /prompt-builder--\$\{variant\}/);
    assert.match(panel, /promptBuilderScope/);
    assert.match(panel, /prompt-builder__scope/);
    assert.doesNotMatch(panel, /promptBuilder\.subtitle/);
    assert.match(panel, /promptBuilderModel/);
    assert.match(panel, /PROMPT_BUILDER_MODELS: PromptBuilderModel\[\] = \["gpt-5\.5", "gpt-5\.4", "gpt-5\.4-mini"\]/);
    assert.match(panel, /prompt-builder__model-picker/);
    assert.match(panel, /prompt-builder__model-trigger/);
    assert.match(panel, /aria-haspopup="listbox"/);
    assert.match(panel, /prompt-builder__model-menu/);
    assert.match(panel, /role="option"/);
    assert.doesNotMatch(panel, /<select/);
    assert.match(panel, /sendPromptBuilderMessage/);
    assert.match(panel, /applyPromptBuilderMessageToPrompt/);
    assert.match(panel, /insertPromptBuilderMessageAsBlock/);
    assert.match(panel, /extractPromptBuilderFinalPrompts/);
    assert.match(panel, /prompt-builder__structured-prompts/);
    assert.match(panel, /prompt-builder__structured-card/);
    assert.match(panel, /insertPromptToComposer/);
    assert.match(panel, /gpt-5\.5/);
    assert.match(panel, /gpt-5\.4-mini/);
    assert.doesNotMatch(panel, /prompt-builder__new/);
    assert.doesNotMatch(panel, /startNewPromptBuilderWork/);

    assert.match(structuredOutput, /extractPromptBuilderFinalPrompts/);
    assert.match(structuredOutput, /Final Prompt - Korean/);
    assert.match(structuredOutput, /Final Prompt - English/);
    assert.match(structuredOutput, /language:\s*"ko"/);
    assert.match(structuredOutput, /language:\s*"en"/);

    assert.match(controls, /variant = "panel"/);
    assert.match(controls, /variant\?: "panel" \| "compact" \| "sidebar"/);
    assert.match(controls, /generation-controls--compact/);
    assert.match(controls, /generation-controls--sidebar/);
    assert.match(controls, /<details/);
    assert.match(controls, /<summary/);

    assert.match(sidebar, /startNewImageSession/);
    assert.match(sidebar, /sidebar-new-session/);
    assert.match(sidebar, /history\.newImageSessionTitle/);
    assert.match(sidebar, /<UIModeSwitch \/>[\s\S]*<NewImageSessionButton \/>[\s\S]*<SidebarHistory \/>/);

    assert.match(css, /\.prompt-builder/);
    assert.match(css, /\.prompt-builder__messages/);
    assert.match(css, /\.prompt-builder__scope/);
    assert.match(css, /\.sidebar-new-session/);
    assert.match(css, /\.sidebar-history__grid::-webkit-scrollbar/);
    assert.match(css, /scrollbar-width:\s*none/);
    assert.match(css, /\.classic-workspace__stage\s*\{[\s\S]*display:\s*flex/);
    assert.match(css, /\.classic-workspace__dock\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /\.right-panel-builder-stack/);
    assert.match(css, /\.generation-controls--compact/);
    assert.match(css, /\.generation-controls--sidebar/);
    assert.match(css, /\.right-panel \.prompt-builder--sidebar/);
    assert.match(css, /\.prompt-builder__model-trigger/);
    assert.match(css, /\.prompt-builder__model-chevron/);
    assert.match(css, /\.prompt-builder__structured-prompts/);
    assert.match(css, /\.prompt-builder__structured-card/);
    assert.match(css, /\.composer--bottom \.composer__content-rail/);
    assert.match(css, /\.composer--bottom \.composer__prompt-flow/);

    assert.equal(typeof en.promptBuilder.title, "string");
    assert.equal(typeof en.promptBuilder.scopeDraft, "string");
    assert.equal(typeof en.promptBuilder.scopeImage, "string");
    assert.equal(typeof en.promptBuilder.send, "string");
    assert.equal(typeof en.promptBuilder.applyToPrompt, "string");
    assert.equal(typeof en.promptBuilder.insertAsBlock, "string");
    assert.equal(typeof en.promptBuilder.finalKoreanPrompt, "string");
    assert.equal(typeof en.promptBuilder.finalEnglishPrompt, "string");
    assert.equal(typeof en.history.newImageSessionTitle, "string");
    assert.equal(typeof ko.promptBuilder.title, "string");
    assert.equal(typeof ko.promptBuilder.scopeDraft, "string");
    assert.equal(typeof ko.promptBuilder.scopeImage, "string");
    assert.equal(typeof ko.promptBuilder.send, "string");
    assert.equal(typeof ko.promptBuilder.applyToPrompt, "string");
    assert.equal(typeof ko.promptBuilder.insertAsBlock, "string");
    assert.equal(typeof ko.promptBuilder.finalKoreanPrompt, "string");
    assert.equal(typeof ko.promptBuilder.finalEnglishPrompt, "string");
    assert.equal(typeof ko.history.newImageSessionTitle, "string");
  });

  it("uses a decorative T2I empty state instead of the blank canvas CTA", () => {
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const css = readSource("ui/src/index.css");

    assert.match(canvas, /canvas__empty-state/);
    assert.match(canvas, /canvas__empty-dot-field/);
    assert.match(canvas, /function EmptyHalftoneCanvas/);
    assert.match(canvas, /useRef<HTMLCanvasElement/);
    assert.match(canvas, /EMPTY_HALFTONE_POINTS/);
    assert.match(canvas, /const EMPTY_HALFTONE_COLUMNS = 52;/);
    assert.match(canvas, /const EMPTY_HALFTONE_ROWS = 24;/);
    assert.match(canvas, /const EMPTY_HALFTONE_MIN_SIZE = 0\.65;/);
    assert.match(canvas, /const EMPTY_HALFTONE_SIZE_RANGE = 4\.3;/);
    assert.match(canvas, /requestAnimationFrame/);
    assert.match(canvas, /dotWavePhase/);
    assert.doesNotMatch(canvas, /EMPTY_HALFTONE_DOTS\.map/);
    assert.doesNotMatch(canvas, /className="canvas__empty-dot"/);
    assert.doesNotMatch(canvas, /--dot-drift/);
    assert.doesNotMatch(canvas, /--dot-return/);
    assert.doesNotMatch(canvas, /canvas__blank-entry/);
    assert.doesNotMatch(canvas, /useCreateBlankCanvas/);
    assert.doesNotMatch(canvas, /canvas\.blank\.create/);
    assert.match(css, /\.canvas__empty-state/);
    assert.match(css, /\.canvas__empty-dot-field/);
    assert.match(css, /\.canvas__empty-canvas\s*\{/);
    assert.doesNotMatch(css, /\.canvas__empty-dot\s*\{/);
    assert.doesNotMatch(css, /@keyframes canvas-empty-dot-glimmer/);
    assert.doesNotMatch(css, /translate3d\(var\(--dot-/);
    assert.doesNotMatch(css, /\.canvas__empty-dot-field::before/);
    assert.doesNotMatch(css, /\.canvas__empty-dot-field::after/);
    assert.doesNotMatch(css, /\.canvas__empty-state\s*\{[^}]*background:/);
    assert.doesNotMatch(css, /\.canvas__blank-button/);
  });

  it("keeps bottom composer scrolling on a dedicated prompt-flow container", () => {
    const composer = readSource("ui/src/components/PromptComposer.tsx");
    const css = readSource("ui/src/index.css");
    const bottomComposer = cssBlock(css, ".composer--bottom");
    const bottomHeader = cssBlock(css, ".composer--bottom .composer__header");
    const promptFlow = cssBlock(css, ".composer--bottom .composer__prompt-flow");
    const bottomTextarea = cssBlock(css, ".composer--bottom .composer__textarea");
    const bottomToolbar = cssBlock(css, ".composer--bottom .composer__toolbar");

    assert.match(composer, /promptFlowRef/);
    assert.match(composer, /composer__content-rail/);
    assert.match(composer, /onWheel=\{handlePromptFlowWheel\}/);
    assert.doesNotMatch(bottomComposer, /--composer-scrollbar-reserve/);
    assert.doesNotMatch(bottomHeader, /padding-right/);
    assert.match(promptFlow, /overflow-y:\s*auto/);
    assert.match(promptFlow, /padding-right:\s*0/);
    assert.doesNotMatch(promptFlow, /scrollbar-gutter/);
    assert.match(bottomTextarea, /overflow-y:\s*auto/);
    assert.doesNotMatch(bottomTextarea, /scrollbar-gutter/);
    assert.doesNotMatch(bottomToolbar, /padding-right/);
    assert.match(composer, /canScrollByWheel\(textarea, event\.deltaY\)/);
    assert.doesNotMatch(css, /--composer-bottom-gutter/);
    assert.doesNotMatch(css, /\.composer--bottom \.composer__prompt-flow\s*\{[\s\S]*padding-right:\s*28px/);
  });

  it("keeps compact generation settings summary text on one baseline", () => {
    const css = readSource("ui/src/index.css");
    const summary = cssBlock(css, ".generation-controls__summary");
    const summaryTitle = cssBlock(css, ".generation-controls__summary .section-title");
    const summaryMeta = cssBlock(css, ".generation-controls__summary-meta");
    const summaryChevron = cssBlock(css, ".generation-controls__summary::after");

    assert.match(summary, /align-items:\s*center/);
    assert.match(summaryTitle, /margin-top:\s*0/);
    assert.match(summaryTitle, /line-height:\s*1/);
    assert.match(summaryMeta, /line-height:\s*1/);
    assert.match(summaryChevron, /display:\s*inline-flex/);
    assert.match(summaryChevron, /align-items:\s*center/);
    assert.match(summaryChevron, /line-height:\s*1/);
  });
});
