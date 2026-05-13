import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("scrollbar visibility contract", () => {
  it("hides native scrollbars app-wide without disabling scrollable regions", () => {
    const css = readSource("ui/src/index.css");

    assert.match(css, /scrollbar-width:\s*none\s*!important/);
    assert.match(css, /-ms-overflow-style:\s*none\s*!important/);
    assert.match(css, /\*::-webkit-scrollbar\s*\{[\s\S]*?width:\s*0\s*!important/);
    assert.match(css, /\*::-webkit-scrollbar\s*\{[\s\S]*?height:\s*0\s*!important/);
    assert.match(css, /\*::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:\s*transparent\s*!important/);

    assert.match(css, /\.right-panel-body\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.composer--bottom \.composer__prompt-flow\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.multimode-sequence__grid\s*\{[\s\S]*?overflow:\s*auto/);
    assert.match(css, /\.gallery__scroll\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.prompt-library-panel__list\s*\{[\s\S]*?overflow-y:\s*auto/);
  });
});
