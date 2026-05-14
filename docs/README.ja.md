# ima2-genX

[![npm version](https://img.shields.io/npm/v/%40damagethundercat%2Fima2-gen)](https://www.npmjs.com/package/%40damagethundercat%2Fima2-gen)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

> **他の言語で読む**: [English](../README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md)

`ima2-genX` は、ChatGPT/Codex の画像生成フローをローカルのデスクトップアプリのように扱うための画像生成スタジオです。ラフなアイデアを Prompt Builder で整え、生成履歴、参照画像、Node 分岐、multimode batch、改善中の Canvas Mode cleanup tools へ自然につなげられます。

> **Fork note**
> `ima2-genX` は [`lidge-jun/ima2-gen`](https://github.com/lidge-jun/ima2-gen) への敬意を保ちながら作られた、大きく変更された fork です。ローカル OAuth による画像生成の基盤は継承していますが、product surface、prompt workflow、gallery behavior、multimode flow、Node mode、provider handling、CLI coverage、packaging path、そして改善中の Canvas Mode work は大きく変わっています。
>
> 製品名は `ima2-genX` です。npm package はインストール継続性のため `@damagethundercat/ima2-gen` のまま、CLI command は upstream の `ima2` と衝突しないよう `ima2x` のままです。

<!-- Screenshot refresh: 新しい ima2-genX メインワークフローのキャプチャに差し替え予定。 -->
![Prompt composer, generated image, compact model label, and result metadata in ima2-genX classic generation screen](../assets/screenshots/classic-generate-light.png)

## Quick Start

```bash
npx @damagethundercat/ima2-gen serve
```

Web UI は server が準備できると自動で開きます。手動で開きたい場合は `--no-open` を使い、terminal に表示された URL を開いてください。

Codex にまだログインしていない場合:

```bash
npx @openai/codex login
npx @damagethundercat/ima2-gen serve
```

`3333` がすでに使われている場合、`ima2-genX` は次に空いている port を使い、実際の URL を `~/.ima2/server.json` に記録します。port を決め打ちせず、terminal の URL または `ima2x open` を使ってください。

Global install も可能です。

```bash
npm install -g @damagethundercat/ima2-gen
ima2x serve
```

## What Changed

- **Prompt Builder first**: ラフなアイデアを subject、composition、style、constraints、follow-up intent まで整理してから生成できます。
- **ima2-genX UI**: 大きな bottom composer、image-scoped builder sessions、grouped multimode history、改善された image viewer、整理された Node-mode side panels を備えています。
- **Node mode**: 良い画像を起点に複数方向へ分岐し、各 node の prompt と result を追跡できます。
- **Multimode batches**: 1つの prompt から複数候補を同時に生成し、最も良い結果から続けられます。
- **Canvas Mode, in progress**: 現在の build には zoom、pan、annotation、eraser、background cleanup、export tools が含まれていますが、`ima2-genX` ではまだ積極的に改善中の領域です。今後の release で UI や behavior が変わる可能性があります。
- **Local gallery**: 生成物をローカルに保存し、session-aware history として扱えます。
- **Provider paths**: 既定の Codex OAuth path と、設定済み OpenAI API key path の両方を使えます。
- **CLI coverage**: `ima2x` で generation、edit、history、sessions、prompt library、inflight jobs などを操作できます。

## Provider Paths

既定の画像生成はローカル Codex/ChatGPT OAuth path で実行されます。この path では OpenAI API key は不要です。

env/config に API key がある場合、generation request で `provider: "api"` を使うと OpenAI Responses API の hosted `image_generation` tool を呼び出せます。API-key generation は classic generate、edit、mask-guided edit、multimode、node generation をサポートします。

![Settings workspace showing OAuth active and API key provider available](../assets/screenshots/settings-oauth-generation.png)

## Model Guidance

アプリの既定値は、速いローカル iteration 向けの **`gpt-5.4-mini`** です。安定したバランスを重視するなら **`gpt-5.4`** をおすすめします。

- `gpt-5.4`: 推奨の balanced choice。
- `gpt-5.4-mini`: 現在の default。速い draft に向いています。
- `gpt-5.5`: 対応環境では最も強い quality option です。ただし quota 消費が増えたり、Codex CLI update や account/backend 側の image capability が必要になる場合があります。

Quality は `low`, `medium`, `high`、moderation は `auto`, `low` をサポートします。

## Workflows

### Prompt Builder To Image

1. Bottom composer にラフな idea を書きます。
2. Prompt Builder で subject、composition、style、constraints、follow-up intent を整理します。
3. 必要なら reference を添付するか、現在の image を次の基準として再利用します。
4. 1枚生成するか、multimode で複数候補を同時に生成します。
5. 最も良い result から続ける、Node mode で分岐する、または現在の Canvas Mode cleanup tools を試します。

<!-- Screenshot refresh: Prompt Builder が見える main workflow capture に差し替え予定。 -->
![Multimode sequence with candidate slots and active job history](../assets/screenshots/multimode-sequence.png)

### Node mode

アイデアを枝分かれさせて比較したいときに使います。各 node は独自の prompt と result を持ち、完了した jobs は request ID で再接続されるため、reload や graph version conflict の後でも復元できます。

![Node mode with connected generated cards and compact metadata](../assets/screenshots/node-graph-branching.png)

### Canvas Mode

Canvas Mode は含まれていますが、`ima2-genX` ではまだ active improvement 中です。現在の version は light cleanup、annotation、export checks に使えますが、この workflow は今後さらに UI と behavior の更新を受ける予定です。

- Current builds focus on viewport zoom/pan、annotation、eraser、sticky notes、background-cleanup previews、alpha/matte-backed export.
- Pan/zoom feel、cleanup flow、saved canvas-version behavior、follow-up reference workflow are still being revised.
- Screenshots in this section will be refreshed once the updated Canvas Mode workflow settles.

![Canvas Mode with zoom controls, annotation marks, sticky note, and toolbar](../assets/screenshots/canvas-mode-cleanup.png)

### Prompt Builder, Library, And Imports

Prompt Builder は intent を generation-ready prompt に整え、Prompt library は reusable prompt material を保存します。Library は local files、GitHub folders、curated sources、GPT-image hint packs から import でき、import した prompts は local index に保存されます。

![Prompt import dialog with GitHub folder controls and candidate prompts](../assets/screenshots/prompt-import-dialog.png)

## CLI Commands

| Command | Description |
|---|---|
| `ima2x serve [--dev] [--no-open]` | Start the local web server and open the web UI |
| `ima2x setup` | Reconfigure saved auth |
| `ima2x status` | Show config and OAuth status |
| `ima2x doctor` | Diagnose Node, package, config, and auth |
| `ima2x open` | Open the web UI |
| `ima2x gen <prompt>` | Generate from the CLI |
| `ima2x edit <file> --prompt <text>` | Edit an existing image |
| `ima2x multimode <prompt>` | Multi-image SSE generation |
| `ima2x prompt ls -q <search>` | Search the Prompt library |
| `ima2x inflight ls [--terminal]` | List active and recent jobs |

Full reference: [CLI Reference](CLI.md).

## Configuration

Config priority:

```text
environment variables > ~/.ima2/config.json > built-in defaults
```

| Variable | Default | Description |
|---|---:|---|
| `IMA2_PORT` / `PORT` | `3333` | Web server port |
| `IMA2_HOST` | `127.0.0.1` | Web server bind host |
| `IMA2_OAUTH_PROXY_PORT` / `OAUTH_PORT` | `10531` | OAuth proxy port |
| `IMA2_SERVER` | — | CLI target override |
| `IMA2_CONFIG_DIR` | `~/.ima2` | Config and SQLite location |
| `IMA2_ADVERTISE_FILE` | `~/.ima2/server.json` | Runtime discovery file |
| `IMA2_GENERATED_DIR` | `~/.ima2/generated` | Generated image directory |
| `IMA2_IMAGE_MODEL_DEFAULT` | `gpt-5.4-mini` | Server fallback image model |
| `OPENAI_API_KEY` | — | API key for the `provider: "api"` image path and auxiliary API-key features |

## Documents

- [CLI Reference](CLI.md)
- [API Reference](API.md)
- [FAQ](FAQ.md)
- [Recover old images](RECOVER_OLD_IMAGES.md)

## Troubleshooting

**`ima2x ping` says the server is unreachable**
Start `ima2x serve`, then check `~/.ima2/server.json`.

**OAuth login does not work**
Run `npx @openai/codex login`, confirm `ima2x status`, then restart `ima2x serve`.

**Images fail with `API_KEY_REQUIRED`**
Set `OPENAI_API_KEY` or switch back to the OAuth provider.

**A large reference image fails**
JPEG/PNG references are compressed before upload. If a file still fails, convert it to a lower-resolution JPEG or PNG. HEIC/HEIF files are not supported by the browser path.

**Old gallery images are missing after updating**
Recent versions moved generated images from the installed package folder to `~/.ima2/generated`. Run `ima2x doctor` and see [Recover old images](RECOVER_OLD_IMAGES.md).

## Development

```bash
git clone https://github.com/damagethundercat/ima2-gen.git
cd ima2-gen
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## License

MIT
