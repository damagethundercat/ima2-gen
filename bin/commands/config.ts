import { createInterface } from "readline/promises";
import { parseArgs } from "../lib/args.js";
import { out, die, color, json } from "../lib/output.js";
import {
  CONFIG_FILE,
  buildEffectiveConfig,
  deleteNestedKey,
  displayPath,
  envOverrideForKey,
  getNestedKey,
  isAuthConfigKey,
  isSensitiveConfigKey,
  isWritableConfigKey,
  loadFileCfg,
  parseConfigValue,
  redactValue,
  restartNotice,
  saveFileCfg,
  setNestedKey,
} from "../lib/config-store.js";

const HELP = `
  ima2x config <subcommand> [options]

  Subcommands:
    path                          Print config file path
    ls [--effective] [--json]     List file layer (or merged effective config with --effective)
    get <key> [--json]            Get a dotted key from effective config (redacts secrets)
    set <key> <value> [-y]        Write a key to the file layer
    rm <key>                      Remove a key from the file layer

  Keys use dot notation, e.g.: imageModels.default, log.level, features.cardNews

  Options:
    --effective     Use effective (merged env+file+defaults) config for ls/get
    --json          Output raw JSON
    -y, --yes       Skip confirmation prompts
`;

const FLAGS = {
  effective: { type: "boolean" },
  json:      { type: "boolean" },
  yes:       { short: "y", type: "boolean" },
  help:      { short: "h", type: "boolean" },
};

async function pathSub(_argv: string[]) {
  out(CONFIG_FILE);
}

async function lsSub(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  if (args.effective) {
    const eff = buildEffectiveConfig();
    if (args.json) { json(eff); return; }
    out(JSON.stringify(eff, null, 2));
  } else {
    const fileCfg = loadFileCfg();
    if (args.json) { json(fileCfg); return; }
    out(JSON.stringify(fileCfg, null, 2));
  }
}

async function getSub(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  const key = args.positional[0];
  if (!key) die(2, "key required. Usage: config get <dotted.key>");
  const eff = buildEffectiveConfig();
  const raw = getNestedKey(eff, key);
  const value = redactValue(key, raw);
  if (args.json) { json({ key, value }); return; }
  if (value === undefined) {
    out(color.dim(`(key not found: ${key})`));
  } else {
    out(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
  }
}

async function setSub(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  const [key, rawValue] = args.positional;
  if (!key || rawValue === undefined) die(2, "usage: config set <key> <value>");

  if (isAuthConfigKey(key)) {
    die(2, `"${key}" is an auth key. Use 'ima2x setup' or 'ima2x login' to change authentication.`);
  }
  if (!isWritableConfigKey(key)) {
    die(2, `unknown config key: "${key}". Run 'ima2x config ls --effective' to see the config structure.`);
  }

  const value = parseConfigValue(rawValue);

  // Warn if env var is overriding this key
  const override = envOverrideForKey(key);
  if (override) {
    out(color.yellow(`warning: env ${override.envVar}=${override.value} is currently overriding this value.`));
    out(`The file change will only apply after unsetting the env var and restarting the server.`);
  }

  // Confirm if writing a sensitive key
  if (isSensitiveConfigKey(key) && !args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`warning: "${key}" is a sensitive credential. Write to config file? [y/N] `);
    rl.close();
    if (!ans.trim().toLowerCase().startsWith("y")) { out("Aborted."); process.exit(0); }
  }

  const fileCfg = loadFileCfg();
  setNestedKey(fileCfg, key, value);
  saveFileCfg(fileCfg);

  out(color.green("✓ ") + `wrote ${key}=${JSON.stringify(value)} to ${displayPath(CONFIG_FILE)}`);
  out(color.dim(restartNotice()));
}

async function rmSub(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  const key = args.positional[0];
  if (!key) die(2, "key required. Usage: config rm <key>");

  if (isAuthConfigKey(key)) {
    die(2, `"${key}" is an auth key. Use 'ima2x setup' or 'ima2x login' to change authentication.`);
  }

  const fileCfg = loadFileCfg();
  const removed = deleteNestedKey(fileCfg, key);
  if (!removed) {
    out(color.dim(`(key not found in file layer: ${key})`));
    return;
  }
  saveFileCfg(fileCfg);
  out(color.green("✓ ") + `removed ${key} from ${displayPath(CONFIG_FILE)}`);
  out(color.dim(restartNotice()));
}

type Sub = (argv: any[]) => Promise<void>;
const SUB: Record<string, Sub> = {
  path: pathSub,
  ls:   lsSub,
  get:  getSub,
  set:  setSub,
  rm:   rmSub,
};

export default async function configCmd(argv: string[]) {
  const sub = argv[0];
  if (!sub || sub === "--help" || sub === "-h") { out(HELP); return; }
  const handler = SUB[sub];
  if (!handler) die(2, `unknown subcommand: ${sub}\n${HELP}`);
  return handler(argv.slice(1));
}
