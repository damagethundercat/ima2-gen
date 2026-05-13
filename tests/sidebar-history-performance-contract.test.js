import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("sidebar history performance contract", () => {
  it("keeps the lightweight sidebar separate from the full gallery history", () => {
    const sidebarHistory = readSource("ui/src/components/SidebarHistory.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");

    assert.match(store, /const HISTORY_LIMIT = 120;/);
    assert.match(sidebarHistory, /const SIDEBAR_HISTORY_RENDER_LIMIT = 72;/);
    assert.match(sidebarHistory, /groupSidebarHistoryEntries\(history\)\.slice\(0, SIDEBAR_HISTORY_RENDER_LIMIT\)/);
    assert.match(sidebarHistory, /const sequences = new Map/);
    assert.doesNotMatch(sidebarHistory, /history\s*\.\s*filter\(\s*\(candidate\)\s*=>\s*candidate\.sequenceId === item\.sequenceId/);
    assert.match(sidebarHistory, /loading="lazy"/);
    assert.match(sidebarHistory, /decoding="async"/);
  });
});
