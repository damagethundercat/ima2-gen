import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path) {
  return readFileSync(path, "utf-8");
}

describe("CLI capabilities contract", () => {
  it("server route exposes capabilities through an allowlisted builder", () => {
    const route = readSource("routes/capabilities.ts");
    const index = readSource("routes/index.ts");

    assert.match(route, /app\.get\("\/api\/capabilities"/);
    assert.match(route, /buildIma2Capabilities/);
    assert.doesNotMatch(route, /res\.json\(ctx\.config\)/);
    assert.match(index, /registerCapabilitiesRoutes/);
  });

  it("capability payload separates supported values and advisory limits", () => {
    const src = readSource("lib/capabilities.ts");

    assert.match(src, /supported:\s*toArray\(appConfig\.imageModels\.valid\)/);
    assert.match(src, /unsupported:\s*toArray\(appConfig\.imageModels\.unsupported\)/);
    assert.match(src, /reasoningEfforts:\s*toArray\(appConfig\.imageModels\.validReasoningEfforts\)/);
    assert.match(src, /quality:\s*toArray\(VALID_IMAGE_QUALITIES\)/);
    assert.match(src, /enforced:\s*false/);
    assert.match(src, /advisory client-side queue guidance only/);
  });

  it("capabilities command falls back to local metadata unless server is required", () => {
    const src = readSource("bin/commands/capabilities.ts");

    assert.match(src, /--require-server/);
    assert.match(src, /localCapabilities\(\)/);
    assert.match(src, /request\(server\.base, "\/api\/capabilities"/);
    assert.match(src, /if \(args\.server \|\| args\["require-server"\]\) throw error/);
  });
});
