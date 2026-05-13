import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("viewer workflow UI contract", () => {
  it("adds zoom, pan, and reset controls to the main image viewer", () => {
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const css = readSource("ui/src/index.css");

    assert.match(canvas, /viewerZoom/);
    assert.match(canvas, /viewerPan/);
    assert.match(canvas, /handleViewerWheel/);
    assert.match(canvas, /handleViewerPointerDown/);
    assert.match(canvas, /handleViewerDoubleClick/);
    assert.match(canvas, /className=\{`canvas-annotation-frame/);
    assert.match(canvas, /className="viewer-controls"/);
    assert.match(canvas, /transform:\s*`translate\(\$\{viewerPan\.x\}px,\s*\$\{viewerPan\.y\}px\) scale\(\$\{viewerZoom\}\)`/);
    assert.match(css, /\.canvas-annotation-frame--zoomed/);
    assert.match(css, /\.viewer-controls/);
    assert.match(css, /\.viewer-control-btn/);
  });

  it("lets users delete only saved custom size presets from the preset row", () => {
    const sizePicker = readSource("ui/src/components/SizePicker.tsx");
    const slots = readSource("ui/src/lib/customSizeSlots.ts");
    const css = readSource("ui/src/index.css");

    assert.match(slots, /removeCustomSizeSlot/);
    assert.match(sizePicker, /removeCustomSizeSlot/);
    assert.match(sizePicker, /function deleteSlot/);
    assert.match(sizePicker, /event\.stopPropagation\(\)/);
    assert.match(sizePicker, /className="size-picker__slot-delete"/);
    assert.match(css, /\.size-picker__slot-delete/);
  });

  it("adds quick delete affordances for single history images and grouped sequences", () => {
    const sidebar = readSource("ui/src/components/SidebarHistory.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");
    const css = readSource("ui/src/index.css");

    assert.match(store, /trashHistorySequence:\s*\(sequenceId: string\) => Promise<void>/);
    assert.match(store, /trashHistorySequence:\s*async \(sequenceId\) =>/);
    assert.match(sidebar, /const trashHistoryItem = useAppStore\(\(s\) => s\.trashHistoryItem\)/);
    assert.match(sidebar, /const trashHistorySequence = useAppStore\(\(s\) => s\.trashHistorySequence\)/);
    assert.match(sidebar, /className="sidebar-history__delete"/);
    assert.match(sidebar, /event\.stopPropagation\(\)/);
    assert.match(css, /\.sidebar-history__delete/);
  });

  it("shows prompt-builder selected image thumbnails and supports per-turn attachments", () => {
    const panel = readSource("ui/src/components/PromptBuilderPanel.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");
    const api = readSource("ui/src/lib/api.ts");
    const server = readSource("lib/promptBuilderClient.ts");
    const css = readSource("ui/src/index.css");

    assert.match(store, /export type PromptBuilderAttachment/);
    assert.match(store, /promptBuilderAttachments: PromptBuilderAttachment\[\]/);
    assert.match(store, /addPromptBuilderAttachments: \(files: File\[\]\) => Promise<void>/);
    assert.match(store, /removePromptBuilderAttachment: \(id: string\) => void/);
    assert.match(store, /clearPromptBuilderImageScope: \(\) => void/);
    assert.match(panel, /prompt-builder__scope-card/);
    assert.match(panel, /clearPromptBuilderImageScope/);
    assert.match(panel, /promptBuilderAttachments/);
    assert.match(panel, /type="file"/);
    assert.match(panel, /onPaste=\{handlePaste\}/);
    assert.match(api, /export type PromptBuilderChatAttachment/);
    assert.match(server, /image_url/);
    assert.match(css, /\.prompt-builder__scope-thumb/);
    assert.match(css, /\.prompt-builder__attachments/);
  });
});
