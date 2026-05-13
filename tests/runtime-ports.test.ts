import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:net";
import {
  findAvailablePort,
  getServerPort,
  isPortFallbackError,
  listenWithPortFallback,
  parseLocalhostPortFromUrl,
  parseOAuthReadyUrl,
} from "../lib/runtimePorts.ts";

function closeServer(server: import("node:net").Server | null | undefined) {
  return new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

function occupy(port: number) {
  return new Promise<import("node:net").Server>((resolve, reject) => {
    const server = createServer()
      .once("error", reject)
      .listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve(server);
      });
  });
}

async function occupyBindablePair(startPort: number, attempts = 800) {
  for (let offset = 0; offset < attempts; offset += 2) {
    const base = startPort + offset;
    let blocker: import("node:net").Server | null = null;
    let probe: import("node:net").Server | null = null;
    try {
      blocker = await occupy(base);
      probe = await occupy(base + 1);
      await closeServer(probe);
      return { base, blocker };
    } catch {
      await closeServer(probe);
      await closeServer(blocker);
    }
  }
  throw new Error(`No bindable test port pair found from ${startPort}`);
}

test("findAvailablePort skips occupied preferred port", async () => {
  const { base, blocker } = await occupyBindablePair(3900);
  try {
    const port = await findAvailablePort(base, { host: "127.0.0.1", maxAttempts: 2 });
    assert.equal(port, base + 1);
  } finally {
    await closeServer(blocker);
  }
});

test("local port fallback treats Windows reserved ports as skippable", () => {
  assert.equal(isPortFallbackError(Object.assign(new Error("busy"), { code: "EADDRINUSE" })), true);
  assert.equal(isPortFallbackError(Object.assign(new Error("denied"), { code: "EACCES" })), true);
  assert.equal(isPortFallbackError(Object.assign(new Error("bad host"), { code: "EADDRNOTAVAIL" })), false);
});

test("listenWithPortFallback binds the next available port", async () => {
  const { base, blocker } = await occupyBindablePair(4300);
  const app = express();
  try {
    const server = await listenWithPortFallback(app, base, {
      host: "127.0.0.1",
      maxAttempts: 2,
      label: "test-server",
    }) as import("node:http").Server;
    assert.equal(getServerPort(server), base + 1);
    await closeServer(server);
  } finally {
    await closeServer(blocker);
  }
});

test("OAuth ready URL parser returns actual fallback port", () => {
  const url = parseOAuthReadyUrl("OpenAI-compatible endpoint ready at http://127.0.0.1:10532/v1");
  assert.equal(url, "http://127.0.0.1:10532");
  assert.equal(parseLocalhostPortFromUrl(url), 10532);
});
