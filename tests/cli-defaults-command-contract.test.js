import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path) {
  return readFileSync(path, "utf-8");
}

describe("CLI defaults command contract", () => {
  it("defaults set model/reasoning writes OAuth and API provider keys together", () => {
    const src = readSource("bin/commands/defaults.ts");

    assert.match(src, /MODEL_KEYS = \["imageModels\.default", "apiProvider\.defaultImageModel"\]/);
    assert.match(src, /REASONING_KEYS = \["imageModels\.reasoningEffort", "apiProvider\.defaultReasoningEffort"\]/);
    assert.match(src, /validateModel\(value\)/);
    assert.match(src, /validateReasoning\(value\)/);
    assert.match(src, /setDefaults\(MODEL_KEYS, value\)/);
    assert.match(src, /setDefaults\(REASONING_KEYS, value\)/);
  });

  it("shared config-store owns writable keys and env override warnings", () => {
    const store = readSource("bin/lib/config-store.ts");
    const configCmd = readSource("bin/commands/config.ts");

    assert.match(store, /"apiProvider\.defaultImageModel"/);
    assert.match(store, /"apiProvider\.defaultReasoningEffort"/);
    assert.match(store, /"apiProvider\.defaultImageModel": "IMA2_API_IMAGE_MODEL_DEFAULT"/);
    assert.match(store, /"apiProvider\.defaultReasoningEffort": "IMA2_API_REASONING_EFFORT"/);
    assert.match(configCmd, /from "\.\.\/lib\/config-store\.js"/);
    assert.match(configCmd, /isWritableConfigKey\(key\)/);
  });

  it("top-level CLI dispatch lets defaults and capabilities show their own help", () => {
    const src = readSource("bin/ima2.ts");

    assert.match(src, /defaults <sub> Inspect\/change model defaults/);
    assert.match(src, /capabilities\s+Agent capability metadata/);
    assert.match(src, /"defaults"/);
    assert.match(src, /"capabilities"/);
    assert.match(src, /case "defaults":/);
    assert.match(src, /case "capabilities":/);
  });
});
