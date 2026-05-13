import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function readCssRule(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing CSS rule for ${selector}`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `Unclosed CSS rule for ${selector}`);
  return source.slice(start, end + 2);
}

describe("in-flight prompt tooltip contract", () => {
  it("keeps compact prompt rows while exposing the full prompt", () => {
    const source = readSource("ui/src/components/InFlightList.tsx");

    assert.match(source, /const fullPrompt = f\.prompt\.trim\(\)\.replace\(/);
    assert.match(source, /const promptLabel = fullPrompt \|\| t\("inflight\.noPrompt"\)/);
    assert.match(source, /title=\{promptLabel\}/);
    assert.match(source, /aria-label=\{`\$\{phaseLabel\}: \$\{promptLabel\}`\}/);
    assert.match(source, /\{truncate\(f\.prompt\)\}/);
  });

  it("exposes cancel controls backed by the real inflight cancel action", () => {
    const source = readSource("ui/src/components/InFlightList.tsx");
    const api = readSource("ui/src/lib/api.ts");
    const store = readSource("ui/src/store/useAppStore.ts");

    assert.match(source, /cancelInFlightJob/);
    assert.match(source, /className="in-flight-cancel"/);
    assert.match(source, /t\("inflight\.cancelAria"/);
    assert.match(api, /export function cancelInflight/);
    assert.match(store, /cancelInFlightJob:\s*async/);
    assert.match(store, /await cancelInflight\(requestId\)/);
  });

  it("renders as a sidebar-inline clickable generation launcher", () => {
    const source = readSource("ui/src/components/InFlightList.tsx");
    const app = readSource("ui/src/App.tsx");
    const sidebar = readSource("ui/src/components/Sidebar.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");
    const css = readSource("ui/src/index.css");
    const inFlightRule = readCssRule(css, ".in-flight-list");

    assert.doesNotMatch(app, /import \{ InFlightList \}/);
    assert.doesNotMatch(app, /<InFlightList \/>/);
    assert.match(sidebar, /import \{ InFlightList \} from "\.\/InFlightList"/);
    assert.match(sidebar, /<InFlightList \/>/);
    assert.match(source, /showInFlightJob/);
    assert.match(source, /className="in-flight-open"/);
    assert.match(source, /onClick=\{\(\) => showInFlightJob\(f\.id\)\}/);
    assert.match(store, /showInFlightJob:\s*\(requestId: string\) => void/);
    assert.match(store, /showInFlightJob:\s*\(requestId\) => \{/);
    assert.match(inFlightRule, /width:\s*min\(178px,\s*100%\)/);
    assert.doesNotMatch(inFlightRule, /position:\s*fixed/);
  });

  it("reopens multimode previews and classic halftone loading surfaces from in-flight jobs", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const showBlock = store.split(/showInFlightJob:\s*\(requestId\) => \{/)[1] ?? "";

    assert.match(showBlock, /job\.kind === "multimode"/);
    assert.match(showBlock, /multimodePreviewFlightId:\s*requestId/);
    assert.match(showBlock, /saveSelectedFilename\(null\)/);
    assert.match(showBlock, /currentImage:\s*null/);
    assert.match(showBlock, /multimodePreviewFlightId:\s*null/);
  });

  it("merges noPrompt into the existing locale inflight objects", () => {
    const en = JSON.parse(readSource("ui/src/i18n/en.json"));
    const ko = JSON.parse(readSource("ui/src/i18n/ko.json"));

    assert.equal(en.inflight.queued, "Queued");
    assert.equal(en.inflight.streaming, "Generating");
    assert.equal(en.inflight.decoding, "Finalizing");
    assert.equal(en.inflight.canceling, "Canceling");
    assert.equal(en.inflight.noPrompt, "No prompt");
    assert.equal(en.inflight.cancelAria, "Cancel generation: {prompt}");
    assert.equal(ko.inflight.queued, "대기 중");
    assert.equal(ko.inflight.streaming, "생성 중");
    assert.equal(ko.inflight.decoding, "마무리 중");
    assert.equal(ko.inflight.canceling, "취소 중");
    assert.equal(ko.inflight.noPrompt, "프롬프트 없음");
    assert.equal(ko.inflight.cancelAria, "생성 취소: {prompt}");
  });
});
