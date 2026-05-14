import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readSource(path) {
  return readFileSync(path, "utf8");
}

test("left sidebar can collapse without leaving the fixed 260px column behind", () => {
  const app = readSource("ui/src/App.tsx");
  const sidebar = readSource("ui/src/components/Sidebar.tsx");
  const store = readSource("ui/src/store/useAppStore.ts");
  const registry = readSource("ui/src/store/persistenceRegistry.ts");
  const css = readSource("ui/src/index.css");

  assert.match(registry, /"ima2\.leftSidebarOpen"/);
  assert.match(registry, /LEFT_SIDEBAR_OPEN_STORAGE_KEY/);
  assert.match(store, /loadLeftSidebarOpen/);
  assert.match(store, /leftSidebarOpen:\s*boolean/);
  assert.match(store, /toggleLeftSidebar:\s*\(\) => void/);
  assert.match(store, /localStorage\.setItem\(LEFT_SIDEBAR_OPEN_STORAGE_KEY/);

  assert.match(app, /leftSidebarOpen/);
  assert.match(app, /app--left-sidebar-collapsed/);
  assert.match(sidebar, /leftSidebarOpen/);
  assert.match(sidebar, /toggleLeftSidebar/);
  assert.match(sidebar, /className=\{`sidebar\$\{leftSidebarOpen \? "" : " collapsed"\}`\}/);
  assert.match(sidebar, /className="left-sidebar-toggle"/);
  assert.match(sidebar, /aria-expanded=\{leftSidebarOpen\}/);

  assert.match(css, /--left-sidebar-w:\s*260px/);
  assert.match(css, /\.app\.app--left-sidebar-collapsed\s*\{[\s\S]*?--left-sidebar-w:\s*20px/);
  assert.match(css, /grid-template-columns:\s*var\(--left-sidebar-w\)/);
  assert.match(css, /\.sidebar\.collapsed\s*\{/);
  assert.match(css, /\.sidebar\.collapsed \.sidebar__scroll\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.left-sidebar-toggle\s*\{/);
});

test("decorative empty halftone switches to visible dot colors in light themes", () => {
  const canvas = readSource("ui/src/components/Canvas.tsx");
  const css = readSource("ui/src/index.css");

  assert.match(canvas, /function getEmptyHalftonePalette/);
  assert.match(canvas, /--canvas-empty-dot-rgb/);
  assert.match(canvas, /--canvas-empty-dot-alpha-scale/);
  assert.match(canvas, /getComputedStyle\(canvas\)/);
  assert.match(canvas, /rgba\(\$\{palette\.rgb\}, \$\{alpha\.toFixed\(3\)\}\)/);
  assert.doesNotMatch(canvas, /rgba\(245,\s*247,\s*250/);

  assert.match(css, /\.canvas__empty-dot-field\s*\{[\s\S]*?--canvas-empty-dot-rgb:/);
  assert.match(css, /\.canvas__empty-dot-field\s*\{[\s\S]*?--canvas-empty-dot-alpha-scale:/);
  assert.match(css, /:root\[data-theme-mode="light"\] \.canvas__empty-dot-field/);
  assert.match(css, /:root\[data-theme="light"\] \.canvas__empty-dot-field/);
});
