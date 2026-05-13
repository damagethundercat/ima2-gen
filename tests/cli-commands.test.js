import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = String(3900 + Math.floor(Math.random() * 80));
const FAKE_HOME = mkdtempSync(join(tmpdir(), "ima2-cmd-home-"));

function runCLI(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", ["--import", "tsx", "bin/ima2.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: FAKE_HOME, USERPROFILE: FAKE_HOME, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

const HEALTH_TIMEOUT = process.platform === "win32" ? 30000 : 8000;

async function waitForHealth(base, timeoutMs = HEALTH_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server not healthy");
}

describe("ima2x CLI commands (live server)", () => {
  let server;
  let serverStderr = "";

  before(async () => {
    server = spawn("node", ["--import", "tsx", "server.ts"], {
      env: {
        ...process.env,
        PORT,
        HOME: FAKE_HOME,
        USERPROFILE: FAKE_HOME,
        IMA2_NO_OAUTH_PROXY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr.on("data", (d) => {
      serverStderr += d.toString();
      if (process.env.DEBUG_TEST) process.stderr.write(d);
    });
    try {
      await waitForHealth(`http://localhost:${PORT}`);
    } catch (err) {
      process.stderr.write(`\n[server stderr on health-timeout]\n${serverStderr}\n`);
      throw err;
    }
  });

  after(async () => {
    if (server && !server.killed) {
      server.kill("SIGTERM");
      await new Promise((r) => server.on("exit", r));
    }
    try { rmSync(FAKE_HOME, { recursive: true, force: true }); } catch {}
  });

  it("ima2x ping reaches advertised server", async () => {
    const { stdout, code } = await runCLI(["ping"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /http:\/\/(?:localhost|127\.0\.0\.1):/);
    assert.match(stdout, /v\d/);
  });

  it("ima2x ping --json returns parseable shape", async () => {
    const { stdout, code } = await runCLI(["ping", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.strictEqual(obj.ok, true);
    assert.strictEqual(obj.provider, "oauth");
    assert.ok(Number.isFinite(obj.activeJobs));
  });

  it("ima2x ps --json returns empty jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.jobs));
  });

  it("ima2x ps --terminal --json includes terminal jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--terminal", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.jobs));
    assert.ok(Array.isArray(obj.terminalJobs));
  });

  it("ima2x gen without prompt exits 2", async () => {
    const { code, stderr } = await runCLI(["gen"]);
    assert.strictEqual(code, 2);
    assert.match(stderr, /prompt/i);
  });

  it("ima2x gen --help prints usage", async () => {
    const { stdout, code } = await runCLI(["gen", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2x gen/);
    assert.match(stdout, /--quality/);
    assert.match(stdout, /--model/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--moderation/);
    assert.match(stdout, /--session/);
  });

  it("ima2x edit --help prints current payload options", async () => {
    const { stdout, code } = await runCLI(["edit", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2x edit/);
    assert.match(stdout, /--model/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--moderation/);
    assert.match(stdout, /--session/);
  });

  it("ima2x ls --json works when history empty", async () => {
    const { stdout, code } = await runCLI(["ls", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(obj.items));
  });

  it("ima2x multimode --help prints parity options", async () => {
    const { stdout, code } = await runCLI(["multimode", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /ima2x multimode/);
    assert.match(stdout, /--provider/);
    assert.match(stdout, /--mode/);
    assert.match(stdout, /--ref/);
  });

  it("ima2x ps --help documents multimode jobs", async () => {
    const { stdout, code } = await runCLI(["ps", "--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /classic\|node\|multimode/);
  });

  it("ima2x gen with unreachable --server exits 3", async () => {
    const { code, stderr } = await runCLI(["gen", "hi", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "", // clear env
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
    assert.match(stderr, /ima2x serve/);
  });

  it("ima2x gen --json keeps stdout parseable when server is unreachable", async () => {
    const { stdout, stderr, code } = await runCLI(["gen", "hi", "--json", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    const obj = JSON.parse(stdout.trim());
    assert.strictEqual(obj.ok, false);
    assert.strictEqual(obj.code, "SERVER_UNREACHABLE");
    assert.match(stderr, /Hint:/);
  });

  it("ima2x edit with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["edit", "input.png", "--prompt", "hi", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2x ps with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["ps", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2x cancel with unreachable --server prints a hint", async () => {
    const { code, stderr } = await runCLI(["cancel", "req_nope", "--server", "http://127.0.0.1:1"], {
      IMA2_SERVER: "",
    });
    assert.strictEqual(code, 3);
    assert.match(stderr, /Hint:/);
  });

  it("ima2x cancel without requestId exits 2", async () => {
    const { code, stderr } = await runCLI(["cancel"]);
    assert.strictEqual(code, 2);
    assert.match(stderr, /requestId/i);
  });

  it("ima2x cancel marks a request id canceled", async () => {
    const { stdout, code } = await runCLI(["cancel", "req_cli_test_cancel"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /canceled req_cli_test_cancel/);
  });

  it("ima2x cancel --json returns parseable shape", async () => {
    const { stdout, code } = await runCLI(["cancel", "req_cli_test_cancel_json", "--json"]);
    assert.strictEqual(code, 0);
    const obj = JSON.parse(stdout.trim());
    assert.deepStrictEqual(obj, { ok: true, requestId: "req_cli_test_cancel_json" });
  });

  it("ima2x --help lists new commands", async () => {
    const { stdout, code } = await runCLI(["--help"]);
    assert.strictEqual(code, 0);
    assert.match(stdout, /gen <prompt>/);
    assert.match(stdout, /ping/);
    assert.match(stdout, /cancel <id>/);
  });
});
