#!/usr/bin/env node
// Cross-platform test runner. Avoids shell glob expansion differences
// between bash (linux/macos), pwsh (windows), and cmd.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = "tests";
const files = readdirSync(testDir)
  .filter((f) => /\.test\.[cm]?[jt]s$/.test(f))
  .map((f) => join(testDir, f))
  .sort();

if (files.length === 0) {
  console.error(`No test files found in ${testDir}/`);
  process.exit(1);
}

const testDbDir = process.env.IMA2_DB_PATH
  ? null
  : mkdtempSync(join(tmpdir(), "ima2-test-db-"));
const testEnv = {
  ...process.env,
  ...(testDbDir ? { IMA2_DB_PATH: join(testDbDir, "sessions.db") } : {}),
};

const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  env: testEnv,
  stdio: "inherit",
});
child.on("exit", (code) => {
  if (testDbDir) rmSync(testDbDir, { recursive: true, force: true });
  process.exit(code ?? 1);
});
