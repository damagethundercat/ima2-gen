// Contract / source-inspection tests for CLI output-recovery integration.
// These tests read the source files and assert that the structural contracts
// (stable requestId, X-Request-Id header, recovery import) are present.
// They do NOT spin up a server and do NOT make network calls.

import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf-8");
}

describe("cli-output-recovery-contract: gen.ts", () => {
  const src = readSrc("bin/commands/gen.ts");

  it("imports from recover-output.js", () => {
    assert.match(src, /from ['"]\.\.\/lib\/recover-output\.js['"]/);
  });

  it("imports createCliRequestId", () => {
    assert.match(src, /createCliRequestId/);
  });

  it("imports recoverGeneratedOutputs", () => {
    assert.match(src, /recoverGeneratedOutputs/);
  });

  it("imports formatRecoveryHint", () => {
    assert.match(src, /formatRecoveryHint/);
  });

  it("sends X-Request-Id header", () => {
    assert.match(src, /['"]X-Request-Id['"]/);
  });

  it("includes requestId in body", () => {
    assert.match(src, /body\.requestId\s*=\s*requestId|requestId,\s*\n?\s*\}/);
  });

  it("calls recoverGeneratedOutputs in catch block", () => {
    assert.match(src, /await recoverGeneratedOutputs/);
  });

});

describe("cli-output-recovery-contract: edit.ts", () => {
  const src = readSrc("bin/commands/edit.ts");

  it("imports from recover-output.js", () => {
    assert.match(src, /from ['"]\.\.\/lib\/recover-output\.js['"]/);
  });

  it("sends X-Request-Id header", () => {
    assert.match(src, /['"]X-Request-Id['"]/);
  });

  it("includes requestId in editBody", () => {
    assert.match(src, /requestId/);
  });

  it("calls recoverGeneratedOutputs in catch block", () => {
    assert.match(src, /await recoverGeneratedOutputs/);
  });

});

describe("cli-output-recovery-contract: multimode.ts", () => {
  const src = readSrc("bin/commands/multimode.ts");

  it("imports from recover-output.js", () => {
    assert.match(src, /from ['"]\.\.\/lib\/recover-output\.js['"]/);
  });

  it("includes requestId in body", () => {
    assert.match(src, /requestId/);
  });

  it("sends X-Request-Id header in streamSse", () => {
    assert.match(src, /['"]X-Request-Id['"]/);
  });

  it("calls recoverGeneratedOutputs in catch block", () => {
    assert.match(src, /await recoverGeneratedOutputs/);
  });

  it("wires --timeout into the SSE abort path", () => {
    assert.match(src, /const timeoutMs = \(parseInt\(String\(args\.timeout\)\) \|\| 600\) \* 1000/);
    assert.match(src, /setTimeout\(\(\) => \{\s*timedOut = true;\s*ac\.abort\(\);/);
    assert.match(src, /e\.name === "AbortError" && timedOut/);
  });
});

describe("cli-output-recovery-contract: recover-output.ts exports", () => {
  const src = readSrc("bin/lib/recover-output.ts");

  it("exports createCliRequestId", () => {
    assert.match(src, /export function createCliRequestId/);
  });

  it("exports recoverGeneratedOutputs", () => {
    assert.match(src, /export async function recoverGeneratedOutputs/);
  });

  it("exports formatRecoveryHint", () => {
    assert.match(src, /export function formatRecoveryHint/);
  });

  it("uses basename to sanitize server-provided filenames", () => {
    assert.match(src, /basename/);
  });

  it("uses /api/inflight with includeTerminal", () => {
    assert.match(src, /\/api\/inflight.*includeTerminal/);
  });

  it("uses /api/history as fallback", () => {
    assert.match(src, /\/api\/history/);
  });
});
