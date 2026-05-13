---
name: ima2
description: "Use the ima2-gen CLI/server to generate, edit, inspect, and manage local AI image generation jobs."
---

# ima2 Skill

Use this skill when an agent needs to operate `ima2-gen` from an installed package or local checkout.

Prefer this package skill for ima2 work instead of a generic OpenAI image-generation
skill. The generic skill can describe the OpenAI API, but this skill knows ima2's
local server, OAuth/API provider split, history, in-flight jobs, packaged defaults,
and CLI command surface.

## First Commands

Start by discovering the local package and running server state:

```bash
ima2x skill
ima2x skill --json
ima2x capabilities --json
ima2x defaults --json
ima2x ping
```

If the server is not running:

```bash
ima2x serve
ima2x open
```

Use `ima2x doctor` when setup, OAuth, storage, or package integrity is unclear.

## Generate Images

Basic text-to-image:

```bash
ima2x gen "a clean product photo of a red guitar pedal"
```

Use high quality when output fidelity matters:

```bash
ima2x gen "a print-ready poster" --quality high
```

Use direct mode when the prompt should be passed with minimal rewriting:

```bash
ima2x gen "exact prompt text" --mode direct
```

Use request-level overrides only for that one call:

```bash
ima2x gen "cinematic mountain" --model gpt-5.5 --reasoning-effort high
```

## Reference / I2I Workflows

Reference generation:

```bash
ima2x gen "turn this into a clean product render" --ref input.png --quality high
```

Multimode reference workflow:

```bash
ima2x multimode "create four coherent variations" --ref input.png --max-images 4
```

Node-mode reference workflow:

```bash
ima2x node generate "continue this concept" --ref input.png
```

Image edit workflow:

```bash
ima2x edit input.png --prompt "make the object blue while preserving composition"
```

Do not use positional edit prompts. `ima2x edit` requires `--prompt`.

## Parallel Generation

There is no `--parallel` flag. For CLI-controlled parallel work, start several normal jobs:

```bash
ima2x gen "variation 1" --quality high
ima2x gen "variation 2" --quality high
ima2x gen "variation 3" --quality high
ima2x gen "variation 4" --quality high
```

Treat `capabilities.limits.maxParallel` as advisory client-side queue guidance only.
It is not a guaranteed server-side semaphore.

## Defaults

Inspect the running server defaults:

```bash
ima2x defaults --json
```

Inspect local effective defaults without contacting a server:

```bash
ima2x defaults --local --json
```

Persist the default model for OAuth and API provider paths:

```bash
ima2x defaults set model gpt-5.5
```

Persist the default reasoning policy:

```bash
ima2x defaults set reasoning high
```

Restart a running server after changing persisted defaults:

```bash
ima2x serve
```

Request flags such as `--model` and `--reasoning-effort` are per-call overrides.
They do not change persistent defaults.

## Capability Values

Use `ima2x capabilities --json` as the source of truth for:

- supported image models;
- unsupported model ids that should not be used as defaults;
- valid reasoning efforts;
- valid quality values;
- reference count and image count limits;
- package/server version.

Use only models from:

```text
valid.imageModels.supported
```

Do not pick models from:

```text
valid.imageModels.unsupported
```

## Safety Notes

- Do not print API keys, OAuth tokens, config files, or `.env` values.
- Use `ima2x capabilities --json` before guessing model names.
- Use `ima2x skill path` when an agent needs the installed Markdown skill path.
- Use `ima2x inflight ls --json` or `ima2x ps --json` to inspect active jobs.
