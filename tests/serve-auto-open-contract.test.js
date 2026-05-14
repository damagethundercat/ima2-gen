import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("serve opens the browser from the current child server advertisement unless disabled", () => {
  const source = readFileSync("bin/ima2.ts", "utf8");

  assert.match(source, /function openBrowserWhenReady/);
  assert.match(source, /serveArgs\.includes\("--no-open"\)/);
  assert.match(source, /IMA2_NO_OPEN/);
  assert.match(source, /adv\?\.pid\s*===\s*child\.pid/);
  assert.match(source, /openUrl\(targetUrl\)/);
});
