# ima2-genX

[![npm version](https://img.shields.io/npm/v/%40damagethundercat%2Fima2-gen)](https://www.npmjs.com/package/%40damagethundercat%2Fima2-gen)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

> **其他语言**: [English](../README.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

`ima2-genX` 是一个本地图像生成工作室，让你像使用桌面应用一样操作 ChatGPT/Codex 图像生成流程。你可以从粗略想法开始，用 Prompt Builder 整理提示词，再通过历史记录、参考图、节点分支、multimode 批量候选和仍在改进中的 Canvas Mode cleanup tools 继续迭代。

> **Fork note**
> `ima2-genX` 是在尊重 [`lidge-jun/ima2-gen`](https://github.com/lidge-jun/ima2-gen) 的基础上继续发展、并做了大量修改的 fork。它继承了本地 OAuth 图像生成基础，但产品界面、prompt workflow、gallery behavior、multimode flow、Node mode、provider handling、CLI coverage、packaging path，以及仍在改进中的 Canvas Mode 方向都已经有明显变化。
>
> 产品名是 `ima2-genX`。为了保持安装与更新连续性，npm package 仍为 `@damagethundercat/ima2-gen`；CLI command 仍为 `ima2x`，以避免覆盖 upstream 的 `ima2` 命令。

<!-- Screenshot refresh: 稍后替换为新的 ima2-genX 主工作流截图。 -->
![显示 prompt composer、生成图、模型标签和结果元数据的 ima2-genX classic 界面](../assets/screenshots/classic-generate-light.png)

## 快速开始

```bash
npx @damagethundercat/ima2-gen serve
```

Web UI 会在 server 准备好后自动打开。如果你想手动打开，请使用 `--no-open`，然后访问 terminal 输出的 URL。

如果还没有登录 Codex：

```bash
npx @openai/codex login
npx @damagethundercat/ima2-gen serve
```

如果 `3333` 已被占用，`ima2-genX` 会绑定下一个可用 port，并把实际 URL 写入 `~/.ima2/server.json`。不要假设端口固定，请使用 terminal 输出的 URL 或 `ima2x open`。

也可以全局安装：

```bash
npm install -g @damagethundercat/ima2-gen
ima2x serve
```

## 有哪些变化

- **Prompt Builder first**：把粗略想法整理成更明确的 subject、composition、style、constraints 和 follow-up intent 后再生成。
- **ima2-genX UI**：底部大 prompt composer、image-scoped builder sessions、grouped multimode history、改进后的 image viewer，以及重新整理的 Node-mode side panels。
- **Node mode**：从一张满意的图出发向多个方向分支，并分别追踪每个 node 的 prompt 和 result。
- **Multimode batches**：用同一个 prompt 同时生成多个候选，并从最好的结果继续。
- **Canvas Mode, 改进中**：当前 build 包含 zoom、pan、annotation、eraser、background cleanup 和 export tools，但在 `ima2-genX` 中这仍是积极改进中的区域。后续 release 中 UI 和 behavior 可能继续变化。
- **Local gallery**：生成结果保存在本地，并通过 session-aware history 管理。
- **Provider paths**：支持默认 Codex OAuth path，也支持配置后的 OpenAI API key path。
- **CLI coverage**：通过 `ima2x` 操作 generation、edit、history、sessions、prompt library、inflight jobs 等功能。

## 图像生成路径

默认图像生成通过本地 Codex/ChatGPT OAuth path 执行。默认路径不需要 OpenAI API key。

如果 env/config 中有 API key，generation request 可以使用 `provider: "api"` 调用 OpenAI Responses API 的 hosted `image_generation` tool。API-key generation 支持 classic generate、edit、mask-guided edit、multimode 和 node generation。

![显示 OAuth active 与 API key provider available 状态的设置页](../assets/screenshots/settings-oauth-generation.png)

## 模型建议

应用默认使用适合快速本地迭代的 **`gpt-5.4-mini`**。如果想要更稳定、均衡的结果，建议切换到 **`gpt-5.4`**。

- `gpt-5.4`：推荐的均衡选择。
- `gpt-5.4-mini`：当前默认值，适合快速草稿。
- `gpt-5.5`：在支持的环境中是质量最高的选择。但它可能消耗更多额度，也可能需要更新 Codex CLI，或依赖账号/后端路径是否开放对应的 image capability。

Quality 支持 `low`, `medium`, `high`；moderation 支持 `auto`, `low`。

## 工作流

### Prompt Builder To Image

1. 在底部 composer 写下粗略想法。
2. 用 Prompt Builder 整理 subject、composition、style、constraints 和 follow-up intent。
3. 需要时添加 reference，或复用当前 image 作为下一步基准。
4. 生成一张图，或用 multimode 同时生成多个候选。
5. 从最好的 result 继续，进入 Node mode 分支，或尝试当前的 Canvas Mode cleanup tools。

<!-- Screenshot refresh: 稍后替换为显示 Prompt Builder 的主工作流截图。 -->
![一个 prompt 正在生成多个 candidate slots，sidebar 中显示 active job history 的 multimode sequence 界面](../assets/screenshots/multimode-sequence.png)

### Node mode

适合将创意分支发散并进行对比。每个 node 都有自己的 prompt 和 result。完成的 jobs 会通过 request ID 重新匹配，因此刷新或 graph version conflict 后也能恢复结果。

![显示连接节点、生成卡片和节点元数据的 Node mode 界面](../assets/screenshots/node-graph-branching.png)

### Canvas Mode

Canvas Mode 已经包含在当前版本中，但在 `ima2-genX` 中仍处于 active improvement 阶段。当前版本可用于轻量 cleanup、annotation 和 export checks；这个 workflow 后续还会继续更新 UI 和 behavior。

- Current builds focus on viewport zoom/pan、annotation、eraser、sticky notes、background-cleanup previews，以及 alpha/matte-backed export。
- Pan/zoom feel、cleanup flow、saved canvas-version behavior、follow-up reference workflow 仍在修订中。
- 本节 screenshots 会在新的 Canvas Mode workflow 稳定后再更新。

![显示 zoom controls、annotation marks、sticky note 和 canvas toolbar 的 Canvas Mode 界面](../assets/screenshots/canvas-mode-cleanup.png)

### Prompt Builder, Library, And Imports

Prompt Builder 把 intent 整理成 generation-ready prompt；Prompt library 保存可复用的 prompt material。Library 可以从 local files、GitHub folders、curated sources 和 GPT-image hint packs 导入。导入后的 prompts 会写入 local index，因此之后仍可搜索和 ranking。

![导入到 prompt library 前用于查看 GitHub folder、curated sources 和搜索候选 prompt 的 dialog](../assets/screenshots/prompt-import-dialog.png)

## CLI 命令

| Command | Description |
|---|---|
| `ima2x serve [--dev] [--no-open]` | 启动本地 web server 并打开 Web UI |
| `ima2x setup` | 重新配置保存的 auth |
| `ima2x status` | 查看 config 和 OAuth 状态 |
| `ima2x doctor` | 诊断 Node、package、config、auth |
| `ima2x open` | 打开 Web UI |
| `ima2x gen <prompt>` | 从 CLI 生成图片 |
| `ima2x edit <file> --prompt <text>` | 编辑已有图片 |
| `ima2x multimode <prompt>` | 多图 SSE 生成 |
| `ima2x prompt ls -q <搜索>` | 搜索 Prompt library |
| `ima2x inflight ls [--terminal]` | 查看进行中和最近完成的 jobs |

完整列表见 [CLI Reference](CLI.md)。

## 配置

Config 优先级：

```text
environment variables > ~/.ima2/config.json > built-in defaults
```

| Variable | Default | Description |
|---|---:|---|
| `IMA2_PORT` / `PORT` | `3333` | Web server port |
| `IMA2_HOST` | `127.0.0.1` | Web server bind host |
| `IMA2_OAUTH_PROXY_PORT` / `OAUTH_PORT` | `10531` | OAuth proxy port |
| `IMA2_SERVER` | — | CLI target override |
| `IMA2_CONFIG_DIR` | `~/.ima2` | Config 和 SQLite 位置 |
| `IMA2_ADVERTISE_FILE` | `~/.ima2/server.json` | Runtime discovery file |
| `IMA2_GENERATED_DIR` | `~/.ima2/generated` | Generated image directory |
| `IMA2_IMAGE_MODEL_DEFAULT` | `gpt-5.4-mini` | Server fallback image model |
| `OPENAI_API_KEY` | — | `provider: "api"` image path 和辅助 API-key features 用 API key |

## 文档

- [CLI Reference](CLI.md)
- [API Reference](API.md)
- [FAQ](FAQ.md)
- [Recover old images](RECOVER_OLD_IMAGES.md)

## 常见问题

**`ima2x ping` 提示 server unreachable**
先启动 `ima2x serve`，再检查 `~/.ima2/server.json`。

**OAuth 登录失败**
运行 `npx @openai/codex login`，用 `ima2x status` 确认状态，然后重启 `ima2x serve`。

**生成图片时返回 `API_KEY_REQUIRED`**
请设置 `OPENAI_API_KEY`，或切换回 OAuth provider。

**大参考图上传失败**
JPEG/PNG 会在上传前自动压缩。如果仍然失败，请转成更低分辨率的 JPEG/PNG。HEIC/HEIF 不支持 browser path。

**更新后看不到旧图库图片**
新版本把 generated image directory 从已安装 package 文件夹移到了 `~/.ima2/generated`。请运行 `ima2x doctor`，并查看 [Recover old images](RECOVER_OLD_IMAGES.md)。

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
