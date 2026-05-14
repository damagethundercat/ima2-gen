# CLI Reference

Every server route under `/api/*` has a CLI wrapper. The CLI is a thin shell over the local server, so most commands require a running `ima2x serve` (the few exceptions — `serve`, `setup`, `doctor`, `status`, `open`, `reset`, `config`, `skill`, `capabilities`, and local `defaults` inspection — work without a live server).

For a quick start, see the [main README](../README.md). For endpoint mapping, see [API.md](API.md).

## Server commands

| Command | Description |
|---|---|
| `ima2x serve [--dev] [--no-open]` | Start the local web server and open the web UI; `--dev` enables verbose server diagnostics; `--no-open` keeps the browser closed |
| `ima2x setup` / `ima2x login` | Reconfigure saved auth (interactive) |
| `ima2x status` | Show config and OAuth status |
| `ima2x doctor` | Diagnose Node, package, config, and auth |
| `ima2x open` | Open the web UI in a browser |
| `ima2x reset` | Remove saved config |

## Common flags

These work on most client commands:

| Flag | Meaning |
|---|---|
| `--server <url>` | Override server discovery (default uses `~/.ima2/server.json`, falls back to `IMA2_SERVER` env) |
| `--json` | Emit machine-readable JSON instead of human-formatted output |
| `-h`, `--help` | Show subcommand help |

## Agent discovery

Agents should start from the packaged skill and capability commands instead of guessing from scattered help text.

| Command | Description |
|---|---|
| `ima2x skill` | Print the packaged Markdown skill from `skills/ima2/SKILL.md` |
| `ima2x skill --json` | Print a JSON wrapper around the Markdown skill content |
| `ima2x skill path` | Print the installed skill file path |
| `ima2x capabilities --json` | Print supported commands, model/quality/reasoning values, and advisory limits |
| `ima2x defaults --json` | Print the running server's effective model/reasoning defaults, falling back to local config when no server is reachable |
| `ima2x defaults --local --json` | Print local effective defaults without contacting the server |

`ima2x capabilities --json` separates supported and unsupported model ids. Agents should use only `valid.imageModels.supported` for generation/default choices. `limits.maxParallel` is advisory queue guidance; it is not a server-side concurrency semaphore.

## Generation

| Command | Description |
|---|---|
| `ima2x gen <prompt>` | Generate from the CLI |
| `ima2x edit <file> --prompt <text>` | Edit an existing image |
| `ima2x multimode <prompt>` | Multi-image SSE generation (streams `phase` / `partial` / `image` events) |
| `ima2x node generate` | Node-mode generate (SSE; supports `--no-stream`) |
| `ima2x node show <nodeId>` | Read node metadata |

Generation flags include `--provider <auto|oauth|api>`, `--reasoning-effort {none\|low\|medium\|high\|xhigh}`, `--web-search` / `--no-web-search`, `--model`, `--mode`, `--moderation`, `--ref <file>` (repeatable, up to 5 where supported), `-q low|medium|high`, `-n <count>`, `-o <file>`.

Provider override semantics:

- `api` forces the API-key Responses path and requires a configured API key.
- `oauth` forces the local OAuth proxy path.
- `auto` preserves route default behavior and currently resolves to OAuth unless server routing changes.

```bash
ima2x gen "a poster of a samurai cat" --model gpt-5.4 --provider api --reasoning-effort high
ima2x edit input.png --prompt "make it rainy" --provider oauth --web-search
ima2x multimode "two cats playing" --max-images 2 --ref cat.png --mode direct
ima2x node generate --node n_abc --prompt "add neon lights" --no-stream
```

Multimode-specific flags include `--max-images <1..8>`, `--ref <file>` (repeatable, max 5), `--mode <auto|direct>`, `--provider <auto|oauth|api>`, and `--show-partial`. `ima2x edit --mask` remains intentionally deferred to #31 because current mask plumbing is guided edit rather than guaranteed true masked/inpaint semantics.

## History and metadata

| Command | Description |
|---|---|
| `ima2x ls [--session <id>] [--favorites]` | List recent history; `--favorites` uses server-side favorites filtering before pagination |
| `ima2x show <name> [--metadata]` | Reveal a generated asset; optional embedded-metadata read |
| `ima2x history rm <name> [--permanent]` | Soft-delete (default) or permanently delete |
| `ima2x history restore --trash-id <id>` | Restore from trash |
| `ima2x history favorite <name>` | Toggle favorite (sends `X-Ima2-Browser-Id`) |
| `ima2x history import <file>` | Import a local image (raw PNG/JPEG/WEBP) into history |
| `ima2x metadata <file>` | Read embedded metadata from any local image (no server roundtrip needed for the read itself, but the route lives on the server) |

## Sessions and graphs

| Command | Description |
|---|---|
| `ima2x session ls / show <id> / create <title> / rm <id> / rename <id> <title>` | Session CRUD |
| `ima2x session graph save <id> --file <graph.json>` | Save a graph (uses GET-then-PUT with `If-Match` to guard against `GRAPH_VERSION_CONFLICT`) |
| `ima2x session graph load <id>` | Read the latest graph snapshot |
| `ima2x session style-sheet get <id> / put <id> --file <style.json> / enable <id> / disable <id> / extract <id>` | Style-sheet ops (advanced; UI no longer surfaces this — kept for API-level workflows) |

## Annotations and canvas

| Command | Description |
|---|---|
| `ima2x annotate get <name>` | Read annotation for an image |
| `ima2x annotate set <name> --body <json\|@file\|->` | Write annotation (sends `X-Ima2-Browser-Id`) |
| `ima2x annotate rm <name>` | Remove annotation |
| `ima2x canvas-versions save <imagefile> [--source <name>] [--prompt <text>]` | Save a raw PNG canvas version |
| `ima2x canvas-versions update <name> <imagefile>` | Update an existing canvas version |

## Prompt library

| Command | Description |
|---|---|
| `ima2x prompt ls [-q <search>] [--folder <id>] [--favorites]` | List prompts |
| `ima2x prompt show <id>` | Read one prompt |
| `ima2x prompt create --name <n> --text <t> [--folder <id>] [--tags <a,b>]` | Create |
| `ima2x prompt edit <id> [--name] [--text] [--folder] [--tags]` | Edit |
| `ima2x prompt rm <id>` | Delete |
| `ima2x prompt favorite <id>` | Toggle favorite |
| `ima2x prompt export <id> [-o <file>]` | Export one prompt to JSON |
| `ima2x prompt folder ls / create <name> / rename <id> <name> / rm <id> [--strategy moveToRoot\|deleteItems]` | Folder CRUD |
| `ima2x prompt import sources` | List configured import sources |
| `ima2x prompt import refresh --source <id>` | Re-index a source |
| `ima2x prompt import curated --source <id> --q <query>` | Curated import (commits prompts) |
| `ima2x prompt import discovery --q <query> --seeds <a,b,c>` | Discovery import (curator-only on some servers) |
| `ima2x prompt import folder <localpath>` | Import a local folder of prompts |

## Card News (gated)

Card News requires the server to be started with `IMA2_CARD_NEWS=1` (or `features.cardNews: true` in `~/.ima2/config.json`). When disabled, the CLI exits 2 with a clear message instead of producing a 404.

| Command | Description |
|---|---|
| `ima2x cardnews templates` | List image-templates and role-templates |
| `ima2x cardnews template preview <id>` | Preview an image template |
| `ima2x cardnews sets` | List card sets |
| `ima2x cardnews set show <id>` / `set manifest <id>` | Show a set or its manifest |
| `ima2x cardnews draft / generate / export [--data <json>]` | Pass-through bodies (server forwards `req.body`) |
| `ima2x cardnews job create [--data <json>]` | Create + start a job |
| `ima2x cardnews job show <jobId>` | Show one job |
| `ima2x cardnews job retry <jobId> [--cards <id,id>]` | Retry a job (optionally specific cards) |
| `ima2x cardnews card regenerate <cardId> [--data <json>]` | Regenerate a single card |

## Observability and jobs

| Command | Description |
|---|---|
| `ima2x ps` | Alias for `inflight ls` (kept for backward compatibility) |
| `ima2x cancel <id>` | Alias for `inflight rm` |
| `ima2x inflight ls [--kind classic\|node\|multimode] [--session <id>] [--terminal]` | List active (and optionally terminal) jobs with phase / model / prompt |
| `ima2x inflight rm <requestId>` | Force-remove a stuck job |
| `ima2x storage status` | Storage inspection (richer than `doctor`) |
| `ima2x storage open` | Open the generated dir in the OS file manager (POST) |
| `ima2x billing` | API usage / quota |
| `ima2x providers` | Configured providers |
| `ima2x oauth status` | OAuth proxy state |
| `ima2x ping` | Health-check the running server |

## Config

`config` reads/writes `~/.ima2/config.json` (the file layer). Effective values follow `env > file > defaults`.

| Command | Description |
|---|---|
| `ima2x config path` | Print the config file path |
| `ima2x config ls [--effective]` | Print the file layer (default), or merged effective config with `--effective` |
| `ima2x config get <key>` | Read a dotted key from the effective config; secrets matching `/token\|secret\|apikey\|password/i` are redacted |
| `ima2x config set <key> <value>` | Write to the file layer; rejects unknown keys, refuses auth keys (`provider`, `apiKey`), warns when an env var is overriding the same key, prints a restart-required note |
| `ima2x config rm <key>` | Remove a key from the file layer |

`defaults` is the agent-friendly wrapper for persistent image model and reasoning policy. It writes both OAuth and API-provider default keys so the user-facing "default model" stays one concept across provider paths.

| Command | Description |
|---|---|
| `ima2x defaults` / `ima2x defaults ls` | Show default model/reasoning values |
| `ima2x defaults --json` | Prefer running server defaults; fall back to local effective config |
| `ima2x defaults --local --json` | Read local effective config only |
| `ima2x defaults set model <model>` | Write `imageModels.default` and `apiProvider.defaultImageModel` |
| `ima2x defaults set reasoning <effort>` | Write `imageModels.reasoningEffort` and `apiProvider.defaultReasoningEffort` |
| `ima2x defaults reset model` | Remove persisted model defaults |
| `ima2x defaults reset reasoning` | Remove persisted reasoning defaults |

Allowed keys (whitelist):

```
imageModels.default          imageModels.reasoningEffort
apiProvider.defaultImageModel apiProvider.defaultReasoningEffort
log.level                    features.cardNews
cardNewsPlanner.{enabled,model,timeoutMs,deterministicFallback}
comfy.{defaultUrl,uploadTimeoutMs,maxUploadBytes}
storage.{generatedDir,generatedDirName}
server.{port,host,bodyLimit}
oauth.{proxyPort,statusTimeoutMs,restartDelayMs}
limits.{maxRefCount,maxParallel}
history.{defaultPageSize,maxPageCap}
```

To change `provider` / `apiKey`, run `ima2x setup` or `ima2x login` instead.

## Other

| Command | Description |
|---|---|
| `ima2x comfy export <filename>` | Export a ComfyUI workflow (`POST /api/comfy/export-image`) |

## Discovery

The server writes `~/.ima2/server.json` on start. CLI commands read this file to find the actual port (the backend can fall back from `3333` to `3334+`). Override discovery with `--server <url>` or `IMA2_SERVER=http://localhost:3333`.

## Examples

```bash
# Generation with reasoning effort and web search
ima2x gen "poster" --model gpt-5.4 --moderation low --reasoning-effort high
ima2x edit input.png --prompt "make it rainy" --web-search
ima2x multimode "two cats playing" --max-images 2 --ref cat.png --mode direct -o cat.png

# History and metadata
ima2x ls --session sess_abc --favorites
ima2x show img_xyz.png --metadata
ima2x history import ./local.png

# Prompts
ima2x prompt ls -q sunset
ima2x prompt import refresh --source curated

# Observability
ima2x inflight ls --terminal
ima2x storage status --json

# Config
ima2x skill --json
ima2x capabilities --json
ima2x defaults set model gpt-5.5
ima2x defaults set reasoning high
ima2x config set imageModels.reasoningEffort high
ima2x config get log.level
ima2x config ls --effective --json
```
