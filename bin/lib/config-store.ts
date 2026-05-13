import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { config as runtimeConfig } from "../../config.js";

export const CONFIG_FILE = runtimeConfig.storage.configFile;
export const CONFIG_DIR = runtimeConfig.storage.configDir;

export const AUTH_KEYS = new Set(["provider", "apiKey"]);

export const WRITABLE_CONFIG_KEYS = new Set([
  "imageModels.default",
  "imageModels.reasoningEffort",
  "apiProvider.defaultImageModel",
  "apiProvider.defaultReasoningEffort",
  "log.level",
  "features.cardNews",
  "cardNewsPlanner.enabled",
  "cardNewsPlanner.model",
  "cardNewsPlanner.timeoutMs",
  "cardNewsPlanner.deterministicFallback",
  "comfy.defaultUrl",
  "comfy.uploadTimeoutMs",
  "comfy.maxUploadBytes",
  "storage.generatedDir",
  "storage.generatedDirName",
  "server.port",
  "server.host",
  "server.bodyLimit",
  "oauth.proxyPort",
  "oauth.statusTimeoutMs",
  "oauth.restartDelayMs",
  "limits.maxRefCount",
  "limits.maxParallel",
  "history.defaultPageSize",
  "history.maxPageCap",
]);

const REDACT_PATTERN = /token|secret|apikey|password/i;
const ALWAYS_REDACT = new Set(["provider", "apiKey", "oauth.token", "oauth.refreshToken"]);

export const KEY_TO_ENV: Record<string, string> = {
  "imageModels.default": "IMA2_IMAGE_MODEL_DEFAULT",
  "imageModels.reasoningEffort": "IMA2_REASONING_EFFORT",
  "apiProvider.defaultImageModel": "IMA2_API_IMAGE_MODEL_DEFAULT",
  "apiProvider.defaultReasoningEffort": "IMA2_API_REASONING_EFFORT",
  "log.level": "IMA2_LOG_LEVEL",
  "features.cardNews": "IMA2_CARD_NEWS",
  "server.port": "IMA2_PORT",
  "server.host": "IMA2_HOST",
  "server.bodyLimit": "IMA2_BODY_LIMIT",
  "oauth.proxyPort": "IMA2_OAUTH_PROXY_PORT",
  "storage.generatedDir": "IMA2_GENERATED_DIR",
  "cardNewsPlanner.enabled": "IMA2_CARD_NEWS_PLANNER",
  "cardNewsPlanner.model": "IMA2_CARD_NEWS_PLANNER_MODEL",
  "cardNewsPlanner.timeoutMs": "IMA2_CARD_NEWS_PLANNER_TIMEOUT_MS",
  "limits.maxParallel": "IMA2_MAX_PARALLEL",
  "limits.maxRefCount": "IMA2_MAX_REF_COUNT",
  "history.defaultPageSize": "IMA2_HISTORY_PAGE_SIZE",
};

export function isAuthConfigKey(key: string): boolean {
  return AUTH_KEYS.has(key);
}

export function isWritableConfigKey(key: string): boolean {
  return WRITABLE_CONFIG_KEYS.has(key);
}

export function isSensitiveConfigKey(key: string): boolean {
  return ALWAYS_REDACT.has(key) || REDACT_PATTERN.test(key);
}

export function redactValue(key: string, value: unknown): unknown {
  if (isSensitiveConfigKey(key)) return value ? "<redacted>" : value;
  return value;
}

export function loadFileCfg(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveFileCfg(cfg: Record<string, unknown>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function getNestedKey(obj: unknown, dotKey: string): unknown {
  const parts = dotKey.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setNestedKey(obj: Record<string, unknown>, dotKey: string, value: unknown): void {
  const parts = dotKey.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = cur[part];
    if (next == null || typeof next !== "object" || Array.isArray(next)) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function deleteNestedKey(obj: Record<string, unknown>, dotKey: string): boolean {
  const parts = dotKey.split(".");
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur == null || typeof cur !== "object") return false;
  const last = parts[parts.length - 1];
  if (!(last in cur)) return false;
  delete (cur as Record<string, unknown>)[last];
  return true;
}

export function stripSets(value: unknown): unknown {
  if (value instanceof Set) return [...value].map(stripSets);
  if (Array.isArray(value)) return value.map(stripSets);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) result[key] = stripSets(nested);
    return result;
  }
  return value;
}

export function buildEffectiveConfig(): Record<string, unknown> {
  return stripSets(runtimeConfig) as Record<string, unknown>;
}

export function parseConfigValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

export function envOverrideForKey(key: string): { envVar: string; value: string } | null {
  const envVar = KEY_TO_ENV[key];
  if (!envVar || process.env[envVar] === undefined) return null;
  return { envVar, value: String(process.env[envVar]) };
}

export function displayPath(p: string): string {
  const home = process.env.HOME || "";
  return home && p.startsWith(home) ? p.replace(home, "~") : p;
}

export function restartNotice(): string {
  return "note: server must be restarted to pick up config changes (run `ima2x serve`)";
}
