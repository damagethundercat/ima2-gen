import { existsSync, readFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "../lib/args.js";
import { die, json, out } from "../lib/output.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL_PATH = join(ROOT, "skills", "ima2", "SKILL.md");
const PACKAGE_PATH = join(ROOT, "package.json");

const HELP = `
  ima2x skill [path] [--json]

  Print the packaged ima2 Markdown skill for agents.

  Commands:
    ima2x skill          Print skills/ima2/SKILL.md
    ima2x skill path     Print resolved skill path
    ima2x skill --json   Print a JSON wrapper around the Markdown skill
`;

const FLAGS = {
  json: { type: "boolean" },
  help: { short: "h", type: "boolean" },
};

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf-8")) as { version?: string };
    return pkg.version || "?";
  } catch {
    return "?";
  }
}

function readSkill(): string {
  if (!existsSync(SKILL_PATH)) {
    die(5, `packaged skill not found: ${SKILL_PATH}`);
  }
  return readFileSync(SKILL_PATH, "utf-8");
}

export default async function skillCmd(argv: string[]) {
  const args = parseArgs(argv, { flags: FLAGS });
  if (args.help) {
    out(HELP);
    return;
  }

  if (args.positional[0] === "path") {
    out(SKILL_PATH);
    return;
  }

  const content = readSkill();
  if (args.json) {
    json({
      name: "ima2",
      format: "markdown-skill",
      formatVersion: "1",
      packageVersion: readPackageVersion(),
      path: relative(ROOT, SKILL_PATH),
      source: "package",
      content,
    });
    return;
  }

  out(content.replace(/\n$/, ""));
}
