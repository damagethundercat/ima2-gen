import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("multimode delete and node sidebar history contract", () => {
  it("lets users delete one multimode image from the sequence preview without opening the image", () => {
    const preview = readSource("ui/src/components/MultimodeSequencePreview.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");
    const css = readSource("ui/src/index.css");

    assert.match(preview, /const trashHistoryItem = useAppStore\(\(s\) => s\.trashHistoryItem\)/);
    assert.match(preview, /function getSequenceSlotImage/);
    assert.match(preview, /sequenceIndex === slotIndex \+ 1/);
    assert.match(preview, /className="multimode-sequence__delete"/);
    assert.match(preview, /event\.stopPropagation\(\)/);
    assert.match(preview, /trashHistoryItem\(image\)/);
    assert.match(store, /function removeImageFromMultimodeSequences/);
    assert.match(store, /const multimodeSequences = removeImageFromMultimodeSequences/);
    assert.match(store, /multimodeSequences,/);
    assert.match(css, /\.multimode-sequence__delete\s*\{/);
  });

  it("uses the same sidebar history gallery card in classic and node modes", () => {
    const sidebar = readSource("ui/src/components/Sidebar.tsx");
    const sidebarHistory = readSource("ui/src/components/SidebarHistory.tsx");
    const app = readSource("ui/src/App.tsx");
    const rightPanel = readSource("ui/src/components/RightPanel.tsx");
    const css = readSource("ui/src/index.css");

    assert.match(sidebar, /uiMode === "classic"[\s\S]*?<SidebarHistory \/>/);
    assert.match(sidebar, /<SessionPicker \/>[\s\S]*?<SidebarHistory \/>/);
    assert.match(sidebarHistory, /className="sidebar-history__gallery-card"/);
    assert.match(sidebarHistory, /history\.galleryCard/);
    assert.match(sidebarHistory, /openGallery/);
    assert.match(app, /const showHistoryStrip = uiMode === "card-news" \|\| isMobile/);
    assert.match(app, /showHistoryStrip \? <HistoryStrip \/> : null/);
    assert.match(app, /showHistoryStrip && historyStripLayout === "horizontal"/);
    assert.match(rightPanel, /effectiveUiMode === "classic" \|\| effectiveUiMode === "node"/);
    assert.match(css, /\.sidebar-history__gallery-card\s*\{[\s\S]*?height:\s*148px/);
    assert.match(css, /\.sidebar-history__gallery-card\s*\{[\s\S]*?aspect-ratio:\s*6\s*\/\s*5/);
    assert.match(css, /\.app\[data-ui-mode="node"\]:not\(\[data-mobile="1"\]\)[\s\S]*?grid-template-columns:\s*var\(--left-sidebar-w\) minmax\(0,\s*1fr\) auto/);
    assert.match(css, /\.app\[data-ui-mode="node"\]:not\(\[data-mobile="1"\]\) \.node-canvas[\s\S]*?grid-column:\s*2/);
    assert.match(css, /\.app\[data-ui-mode="node"\]:not\(\[data-mobile="1"\]\) \.right-panel[\s\S]*?grid-column:\s*3/);
  });
});
