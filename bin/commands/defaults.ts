import { config } from "../../config.js";
import { parseArgs } from "../lib/args.js";
import { resolveServer, request } from "../lib/client.js";
import {
  buildEffectiveConfig,
  deleteNestedKey,
  displayPath,
  envOverrideForKey,
  getNestedKey,
  loadFileCfg,
  restartNotice,
  saveFileCfg,
  setNestedKey,
  CONFIG_FILE,
} from "../lib/config-store.js";
import { color, die, dieWithError, json, out } from "../lib/output.js";

const MODEL_KEYS = ["imageModels.default", "apiProvider.defaultImageModel"] as const;
const REASONING_KEYS = ["imageModels.reasoningEffort", "apiProvider.defaultReasoningEffort"] as const;

const HELP = `
  ima2x defaults [subcommand] [options]

  Inspect or change persistent model/reasoning defaults.

  Subcommands:
    ls                         Show effective defaults
    set model <model>          Persist default model for OAuth and API paths
    set reasoning <effort>     Persist default reasoning effort for OAuth and API paths
    reset model                Remove persisted model defaults
    reset reasoning            Remove persisted reasoning defaults

  Options:
    --json                     Print JSON
    --local                    Do not query running server
    --server <url>             Query a specific running server for ls/default output
`;

const FLAGS = {
  json: { type: "boolean" },
  local: { type: "boolean" },
  server: { type: "string" },
  help: { short: "h", type: "boolean" },
};

function localDefaults() {
  const effective = buildEffectiveConfig();
  return {
    ok: true,
    source: "local",
    server: null,
    defaults: {
      oauth: {
        model: getNestedKey(effective, "imageModels.default"),
        reasoningEffort: getNestedKey(effective, "imageModels.reasoningEffort"),
      },
      api: {
        model: getNestedKey(effective, "apiProvider.defaultImageModel"),
        reasoningEffort: getNestedKey(effective, "apiProvider.defaultReasoningEffort"),
        size: getNestedKey(effective, "apiProvider.defaultSize"),
        webSearchEnabled: getNestedKey(effective, "apiProvider.allowWebSearch"),
      },
    },
  };
}

async function readDefaults(args: ReturnType<typeof parseArgs>) {
  if (args.local) return localDefaults();
  try {
    const server = await resolveServer({ serverFlag: args.server });
    const capabilities = await request(server.base, "/api/capabilities", { timeoutMs: 5000 });
    return {
      ok: true,
      source: "server",
      server: server.base,
      defaults: capabilities.defaults,
    };
  } catch (error) {
    if (args.server) throw error;
    return localDefaults();
  }
}

function printDefaults(payload: any): void {
  out(`ima2x defaults (${payload.source})`);
  out(`server: ${payload.server || "none"}`);
  out("");
  out(`oauth model: ${payload.defaults?.oauth?.model}`);
  out(`oauth reasoning: ${payload.defaults?.oauth?.reasoningEffort}`);
  out(`api model: ${payload.defaults?.api?.model}`);
  out(`api reasoning: ${payload.defaults?.api?.reasoningEffort}`);
  if (payload.defaults?.api?.size) out(`api size: ${payload.defaults.api.size}`);
  if (payload.defaults?.api?.webSearchEnabled !== undefined) {
    out(`api web search: ${payload.defaults.api.webSearchEnabled ? "enabled" : "disabled"}`);
  }
}

function validateModel(value: string): void {
  if (!config.imageModels.valid.has(value)) {
    die(2, `model must be one of: ${Array.from(config.imageModels.valid).join(", ")}`);
  }
}

function validateReasoning(value: string): void {
  if (!config.imageModels.validReasoningEfforts.has(value)) {
    die(2, `reasoning must be one of: ${Array.from(config.imageModels.validReasoningEfforts).join(", ")}`);
  }
}

function warnOverrides(keys: readonly string[]): void {
  for (const key of keys) {
    const override = envOverrideForKey(key);
    if (!override) continue;
    out(color.yellow(`warning: env ${override.envVar}=${override.value} is currently overriding ${key}.`));
  }
}

function setDefaults(keys: readonly string[], value: string): void {
  const fileCfg = loadFileCfg();
  for (const key of keys) setNestedKey(fileCfg, key, value);
  saveFileCfg(fileCfg);
  warnOverrides(keys);
  out(color.green("✓ ") + `wrote ${keys.join(", ")}=${JSON.stringify(value)} to ${displayPath(CONFIG_FILE)}`);
  out(color.dim(restartNotice()));
}

function resetDefaults(keys: readonly string[]): void {
  const fileCfg = loadFileCfg();
  let changed = false;
  for (const key of keys) changed = deleteNestedKey(fileCfg, key) || changed;
  if (!changed) {
    out(color.dim(`(no persisted defaults found for ${keys.join(", ")})`));
    return;
  }
  saveFileCfg(fileCfg);
  out(color.green("✓ ") + `removed ${keys.join(", ")} from ${displayPath(CONFIG_FILE)}`);
  out(color.dim(restartNotice()));
}

async function listSub(argv: string[]): Promise<void> {
  const args = parseArgs(argv, { flags: FLAGS });
  try {
    const payload = await readDefaults(args);
    if (args.json) json(payload);
    else printDefaults(payload);
  } catch (error) {
    dieWithError(error);
  }
}

async function setSub(argv: string[]): Promise<void> {
  const args = parseArgs(argv, { flags: FLAGS });
  const [target, value] = args.positional;
  if (!target || !value) die(2, "usage: defaults set <model|reasoning> <value>");
  if (target === "model") {
    validateModel(value);
    setDefaults(MODEL_KEYS, value);
    return;
  }
  if (target === "reasoning") {
    validateReasoning(value);
    setDefaults(REASONING_KEYS, value);
    return;
  }
  die(2, "target must be one of: model, reasoning");
}

async function resetSub(argv: string[]): Promise<void> {
  const args = parseArgs(argv, { flags: FLAGS });
  const target = args.positional[0];
  if (target === "model") {
    resetDefaults(MODEL_KEYS);
    return;
  }
  if (target === "reasoning") {
    resetDefaults(REASONING_KEYS);
    return;
  }
  die(2, "usage: defaults reset <model|reasoning>");
}

export default async function defaultsCmd(argv: string[]) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h") {
    out(HELP);
    return;
  }
  if (!sub || sub === "ls" || sub.startsWith("-")) return listSub(sub === "ls" ? argv.slice(1) : argv);
  if (sub === "set") return setSub(argv.slice(1));
  if (sub === "reset") return resetSub(argv.slice(1));
  die(2, `unknown subcommand: ${sub}\n${HELP}`);
}
