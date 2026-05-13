import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path) {
  return readFileSync(path, "utf-8");
}

describe("CLI packaged skill contract", () => {
  it("ships a Markdown ima2 skill with agent usage guidance", () => {
    const skill = readSource("skills/ima2/SKILL.md");

    assert.match(skill, /name:\s*ima2/);
    assert.match(skill, /ima2x capabilities --json/);
    assert.match(skill, /ima2x defaults --json/);
    assert.match(skill, /ima2x edit input\.png --prompt/);
    assert.match(skill, /--quality high/);
    assert.match(skill, /There is no `--parallel` flag/);
    assert.match(skill, /generic OpenAI image-generation/);
  });

  it("skill command wraps Markdown content instead of inventing a schema skill", () => {
    const src = readSource("bin/commands/skill.ts");

    assert.match(src, /SKILL_PATH = join\(ROOT, "skills", "ima2", "SKILL\.md"\)/);
    assert.match(src, /format:\s*"markdown-skill"/);
    assert.match(src, /formatVersion:\s*"1"/);
    assert.match(src, /packageVersion: readPackageVersion\(\)/);
    assert.match(src, /content,/);
    assert.match(src, /packaged skill not found/);
  });

  it("top-level CLI dispatch lets skill help reach the subcommand", () => {
    const src = readSource("bin/ima2.ts");

    assert.match(src, /skill\s+Print packaged agent skill/);
    assert.match(src, /"skill"/);
    assert.match(src, /case "skill":/);
  });
});
