import { copyFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { config } from "../../config.js";
import { request } from "./client.js";

export type RecoverOutputTarget = {
  explicitOut?: string | null;
  outDir?: string | null;
  expectedCount?: number;
  json?: boolean;
};

export type RecoverOutputResult = {
  recovered: boolean;
  paths: string[];
  requestId: string;
  source: "terminal" | "history" | "active" | "none";
  message?: string;
};

export function createCliRequestId(prefix = "req_cli"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function copyFilesToTarget(
  filenames: string[],
  target: RecoverOutputTarget,
  generatedDir: string,
): Promise<string[]> {
  const saved: string[] = [];
  for (let i = 0; i < filenames.length; i++) {
    const name = basename(filenames[i]);
    const src = join(generatedDir, name);
    let dest: string;
    if (target.explicitOut && i === 0) {
      dest = target.explicitOut;
    } else if (target.outDir) {
      dest = join(target.outDir, name);
    } else {
      saved.push(src);
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    saved.push(dest);
  }
  return saved;
}

async function tryTerminalRecovery(
  base: string,
  requestId: string,
  target: RecoverOutputTarget,
): Promise<RecoverOutputResult | null> {
  const inflight = await request(base, "/api/inflight?includeTerminal=1");
  const jobs = Array.isArray(inflight.jobs) ? (inflight.jobs as any[]) : [];
  const terminalJobs = Array.isArray(inflight.terminalJobs) ? (inflight.terminalJobs as any[]) : [];

  const activeMatch = jobs.find((j) => j.requestId === requestId);
  if (activeMatch) {
    return {
      recovered: false,
      paths: [],
      requestId,
      source: "active",
      message: `Generation in progress (requestId: ${requestId}). Check: ima2 ps --json`,
    };
  }

  const termMatch = terminalJobs.find((j) => j.requestId === requestId);
  if (!termMatch) return null;

  const filenames: string[] = Array.isArray(termMatch.meta?.filenames) ? termMatch.meta.filenames : [];
  if (filenames.length === 0) return null;

  const paths = await copyFilesToTarget(filenames, target, config.storage.generatedDir);
  return { recovered: paths.length > 0, paths, requestId, source: "terminal" };
}

async function tryHistoryRecovery(
  base: string,
  requestId: string,
  target: RecoverOutputTarget,
): Promise<RecoverOutputResult | null> {
  const hist = await request(base, "/api/history?limit=200");
  const items = Array.isArray(hist.items) ? (hist.items as any[]) : [];
  const match = items.find((it) => it.requestId === requestId);
  if (!match?.filename) return null;

  const paths = await copyFilesToTarget([String(match.filename)], target, config.storage.generatedDir);
  return { recovered: paths.length > 0, paths, requestId, source: "history" };
}

export async function recoverGeneratedOutputs(
  base: string,
  requestId: string,
  target: RecoverOutputTarget,
): Promise<RecoverOutputResult> {
  try {
    const result = await tryTerminalRecovery(base, requestId, target);
    if (result) return result;
  } catch {}

  try {
    const result = await tryHistoryRecovery(base, requestId, target);
    if (result) return result;
  } catch {}

  return { recovered: false, paths: [], requestId, source: "none" };
}

export function formatRecoveryHint(result: RecoverOutputResult): string {
  if (result.source === "active") {
    return result.message ?? `Generation in progress (requestId: ${result.requestId})`;
  }
  if (result.recovered) {
    return `Recovered ${result.paths.length} file(s) via ${result.source} (requestId: ${result.requestId})`;
  }
  return `Could not recover output (requestId: ${result.requestId}). Check ${config.storage.generatedDir}/`;
}
