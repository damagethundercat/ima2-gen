import { spawnBin } from "../bin/lib/platform.js";
import { config } from "../config.js";
import { findAvailablePort, parseLocalhostPortFromUrl, parseOAuthReadyUrl } from "./runtimePorts.js";
import type { ChildProcess } from "node:child_process";

export function startOAuthProxy(options: any = {}) {
  const oauthPort = options.oauthPort ?? config.oauth.proxyPort;
  const restartDelayMs = options.restartDelayMs ?? config.oauth.restartDelayMs;
  let currentChild: ChildProcess | null = null;
  let stopping = false;
  let restartTimer: NodeJS.Timeout | null = null;

  const spawnProxy = async () => {
    let launchPort = oauthPort;
    try {
      launchPort = await findAvailablePort(oauthPort, {
        host: "127.0.0.1",
        maxAttempts: options.maxPortAttempts ?? 80,
      });
    } catch (error) {
      options.onExit?.({ code: "PORT_UNAVAILABLE", error });
      console.error(`[oauth] failed to find an available local port: ${error instanceof Error ? error.message : String(error)}`);
      if (!stopping) restartTimer = setTimeout(() => void spawnProxy(), restartDelayMs);
      return;
    }

    if (launchPort !== oauthPort) {
      console.log(`[oauth] requested port ${oauthPort}, preselected available port ${launchPort}`);
    }
    console.log(`Starting openai-oauth on port ${launchPort}...`);
    const child = spawnBin("npx", ["openai-oauth", "--port", String(launchPort)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    currentChild = child;

    child.stdout?.on("data", (d) => {
      const msg = d.toString().trim();
      if (!msg) return;
      console.log(`[oauth] ${msg}`);
      for (const line of msg.split(/\r?\n/)) {
        const url = parseOAuthReadyUrl(line);
        if (!url) continue;
        const port = parseLocalhostPortFromUrl(url);
        if (port && port !== oauthPort) {
          console.log(`[oauth] requested port ${oauthPort}, actual port ${port}`);
        }
        options.onReady?.({ url, port: port || oauthPort, requestedPort: oauthPort });
      }
    });

    child.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg && !msg.includes("npm warn")) console.error(`[oauth] ${msg}`);
    });

    child.on("exit", (code) => {
      if (currentChild === child) currentChild = null;
      if (stopping) return;
      options.onExit?.({ code });
      console.log(`[oauth] exited with code ${code}, restarting in ${Math.round(restartDelayMs / 1000)}s...`);
      restartTimer = setTimeout(() => void spawnProxy(), restartDelayMs);
    });
  };

  void spawnProxy();

  return {
    get child() {
      return currentChild;
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      this.stop(signal);
    },
    stop(signal: NodeJS.Signals = "SIGTERM") {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { currentChild?.kill(signal); } catch {}
    },
  };
}
