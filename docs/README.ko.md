# ima2-genX

[![npm version](https://img.shields.io/npm/v/%40damagethundercat%2Fima2-gen)](https://www.npmjs.com/package/%40damagethundercat%2Fima2-gen)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

<p align="center">
  <a href="../assets/screenshots/tutorial1-readme.mp4">
    <img src="../assets/screenshots/tutorial1-readme.gif" alt="ima2-genX 43초 튜토리얼 영상">
  </a>
  <br>
  <a href="../assets/screenshots/tutorial1-readme.mp4"><strong>43초 튜토리얼 영상 보기</strong></a>
</p>

> **다른 언어로 읽기**: [English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

`ima2-genX`는 ChatGPT/Codex 이미지 생성 흐름을 로컬 데스크톱 앱처럼 다루기 위한 이미지 생성 스튜디오입니다. 거친 아이디어를 Prompt Builder로 정리하고, 생성 결과를 히스토리, 레퍼런스, 노드 브랜치, 멀티모드 배치, 개선 중인 Canvas Mode 정리 도구로 계속 이어갈 수 있습니다.

> **Fork note**
> `ima2-genX`는 [`lidge-jun/ima2-gen`](https://github.com/lidge-jun/ima2-gen)을 존중하며 이어 만든, 크게 수정된 fork입니다. 로컬 OAuth 기반 이미지 생성 흐름은 계승했지만, 제품 표면, 프롬프트 워크플로우, 갤러리 동작, multimode, Node mode, provider 처리, CLI 범위, 패키징 흐름, 그리고 개선 중인 Canvas Mode 방향은 상당히 달라졌습니다.
>
> 제품명은 `ima2-genX`입니다. npm 패키지는 기존 설치 경로와 업데이트 연속성을 위해 `@damagethundercat/ima2-gen`을 유지하고, CLI 명령은 upstream의 `ima2`와 충돌하지 않도록 `ima2x`를 사용합니다.

![프롬프트 작성창, 생성 이미지, 히스토리, 결과 컨트롤이 보이는 ima2-genX 다크 모드 클래식 생성 화면](../assets/screenshots/classic-darkmode.png)

## 빠른 시작

```bash
npx @damagethundercat/ima2-gen serve
```

웹 UI는 서버가 준비되면 자동으로 열립니다. 직접 열고 싶다면 `--no-open`을 붙이고 터미널에 출력된 URL을 사용하세요.

Codex 로그인이 아직 없다면:

```bash
npx @openai/codex login
npx @damagethundercat/ima2-gen serve
```

`3333`이 이미 사용 중이면 `ima2-genX`는 다음 사용 가능한 포트로 열리고 실제 URL을 `~/.ima2/server.json`에 기록합니다. 포트를 추측하지 말고 터미널에 출력된 URL이나 `ima2x open`을 사용하세요.

전역 설치도 가능합니다.

```bash
npm install -g @damagethundercat/ima2-gen
ima2x serve
```

## 무엇이 달라졌나요?

- **Prompt Builder 중심 흐름**: 거친 아이디어를 오른쪽 Prompt Builder에서 주제, 구도, 스타일, 제약 조건, 후속 의도까지 정리한 뒤 생성할 수 있습니다.
- **ima2-genX UI**: 하단 대형 프롬프트 작성창, 이미지별 builder 세션, grouped multimode history, 개선된 이미지 뷰어, 새로 정리된 Node mode 패널을 제공합니다.
- **Node mode**: 마음에 드는 이미지를 여러 방향으로 분기해 비교하고, 각 노드의 prompt와 결과를 따로 추적합니다.
- **Multimode batches**: 같은 프롬프트에서 여러 후보 슬롯을 동시에 만들고, 가장 좋은 결과에서 이어갑니다.
- **Canvas Mode, 개선 중**: 현재 빌드에는 확대, 이동, 주석, 지우개, 배경 정리, export 도구가 포함되어 있지만, `ima2-genX`에서는 아직 적극적으로 정비 중인 영역입니다. 이후 릴리스에서 UI와 동작이 바뀔 수 있습니다.
- **Local gallery**: 생성물을 로컬에 저장하고 session-aware history로 관리합니다.
- **Provider paths**: 기본 Codex OAuth 경로와 설정된 OpenAI API key 경로를 함께 지원합니다.
- **CLI coverage**: `ima2x` 명령으로 생성, 편집, 히스토리, 세션, 프롬프트 라이브러리, 진행 중 작업 등을 다룹니다.

## 이미지 생성 경로

기본 이미지 생성은 로컬 Codex/ChatGPT OAuth 경로로 실행됩니다. 기본 경로에서는 OpenAI API 키가 필요하지 않습니다.

API 키가 env/config에 있으면 생성 요청에서 `provider: "api"`를 사용해 OpenAI Responses API의 hosted `image_generation` tool을 호출할 수 있습니다. API-key generation은 classic generate, edit, mask-guided edit, multimode, node generation을 지원합니다.

![OAuth 활성화와 API key provider available 상태를 보여주는 설정 화면](../assets/screenshots/settings-oauth-generation.png)

## 모델 안내

앱 기본값은 빠른 로컬 반복 작업에 맞춘 **`gpt-5.4-mini`**입니다. 안정적인 균형을 원하면 **`gpt-5.4`**를 권장합니다.

- `gpt-5.4`: 추천 균형 선택지.
- `gpt-5.4-mini`: 현재 기본값이며 빠른 초안에 적합합니다.
- `gpt-5.5`: 지원되는 환경에서는 가장 강한 품질 선택지입니다. 다만 더 많은 할당량을 쓸 수 있고, Codex CLI 업데이트가 필요하거나 계정/백엔드별 이미지 capability가 다를 수 있습니다.

품질은 `low`, `medium`, `high`, 모더레이션은 `auto`, `low`를 지원합니다.

## 주요 흐름

### Prompt Builder에서 이미지까지

1. 하단 composer에 거친 아이디어를 씁니다.
2. Prompt Builder로 subject, composition, style, constraints, follow-up intent를 정리합니다.
3. 필요하면 reference를 붙이거나 현재 이미지를 다음 단계의 기준으로 재사용합니다.
4. 한 장을 생성하거나 multimode로 여러 후보를 동시에 만듭니다.
5. 가장 좋은 결과에서 계속 생성하거나, Node mode로 분기하거나, 현재 Canvas Mode 정리 도구를 사용해봅니다.

![Prompt Builder, 여러 후보 슬롯, active job history, 후속 생성 컨트롤이 함께 보이는 multimode 화면](../assets/screenshots/multimode.png)

### Node mode

아이디어를 가지치기하면서 비교하고 싶을 때 사용합니다. 각 노드는 자기 prompt와 결과를 가지며, 완료된 작업은 request ID로 다시 매칭되어 새로고침이나 graph version conflict 뒤에도 결과를 복구할 수 있습니다.

![분기된 생성 카드, 노드별 메타데이터, 사이드 패널 컨트롤이 보이는 Node mode 화면](../assets/screenshots/node-graph.png)

### Canvas Mode

Canvas Mode는 포함되어 있지만, `ima2-genX`에서는 아직 기능 개선이 진행 중인 영역입니다. 현재 버전은 가벼운 정리, 주석, export 확인에 사용할 수 있고, 앞으로 UI와 동작이 더 업데이트될 예정입니다.

- 현재 빌드는 viewport zoom/pan, annotation, eraser, sticky note, background-cleanup preview, alpha/matte export에 초점을 둡니다.
- pan/zoom 감각, cleanup 흐름, 저장된 canvas version 동작, 후속 reference workflow는 계속 다듬는 중입니다.
- 이 섹션의 스크린샷은 업데이트된 Canvas Mode 흐름이 안정되면 다시 교체할 예정입니다.

![Zoom controls, annotation, sticky note, canvas toolbar가 보이는 Canvas Mode 화면](../assets/screenshots/canvas-mode-cleanup.png)

### Prompt Builder, Library, Import

Prompt Builder는 의도를 generation-ready prompt로 정리하고, Prompt library는 재사용 가능한 prompt material을 저장합니다. 강화된 Library 화면에서는 가져온 prompts를 더 쉽게 둘러보고 검색할 수 있으며, local files, GitHub folders, curated sources, GPT-image hint packs에서 prompt를 가져올 수 있습니다. 가져온 prompt는 local index에 저장되어 다시 import하지 않아도 검색과 ranking에 사용할 수 있습니다.

![재사용 가능한 prompts, 검색, 태그, import controls가 보이는 Prompt library 화면](../assets/screenshots/prompt-library.png)

## CLI 명령어

| 명령어 | 설명 |
|---|---|
| `ima2x serve [--dev] [--no-open]` | 로컬 웹 서버를 시작하고 웹 UI를 엽니다 |
| `ima2x setup` | 저장된 인증을 다시 설정합니다 |
| `ima2x status` | config와 OAuth 상태를 확인합니다 |
| `ima2x doctor` | Node, package, config, auth를 진단합니다 |
| `ima2x open` | 웹 UI를 엽니다 |
| `ima2x gen <prompt>` | CLI에서 이미지를 생성합니다 |
| `ima2x edit <file> --prompt <text>` | 기존 이미지를 수정합니다 |
| `ima2x multimode <prompt>` | 멀티 이미지 SSE 생성을 실행합니다 |
| `ima2x prompt ls -q <검색어>` | Prompt library를 검색합니다 |
| `ima2x inflight ls [--terminal]` | 진행 중이거나 최근 완료된 작업을 봅니다 |

전체 명령 목록은 [CLI 레퍼런스](CLI.md)에 있습니다.

## 설정

Config 우선순위:

```text
environment variables > ~/.ima2/config.json > built-in defaults
```

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `IMA2_PORT` / `PORT` | `3333` | 웹 서버 포트 |
| `IMA2_HOST` | `127.0.0.1` | 웹 서버 bind host |
| `IMA2_OAUTH_PROXY_PORT` / `OAUTH_PORT` | `10531` | OAuth proxy 포트 |
| `IMA2_SERVER` | — | CLI 대상 서버 직접 지정 |
| `IMA2_CONFIG_DIR` | `~/.ima2` | config와 SQLite 저장 위치 |
| `IMA2_ADVERTISE_FILE` | `~/.ima2/server.json` | 실행 중 서버 discovery 파일 |
| `IMA2_GENERATED_DIR` | `~/.ima2/generated` | 생성 이미지 저장 위치 |
| `IMA2_IMAGE_MODEL_DEFAULT` | `gpt-5.4-mini` | 서버 fallback 이미지 모델 |
| `OPENAI_API_KEY` | — | `provider: "api"` 이미지 경로와 보조 API-key 기능용 API 키 |

## 문서

- [CLI Reference](CLI.md)
- [API Reference](API.md)
- [FAQ](FAQ.ko.md)
- [Recover old images](RECOVER_OLD_IMAGES.md)

## 문제 해결

**`ima2x ping`이 서버에 연결하지 못한다고 나와요**
`ima2x serve`를 먼저 실행하고 `~/.ima2/server.json`을 확인하세요.

**OAuth 로그인이 안 돼요**
`npx @openai/codex login`을 실행하고, `ima2x status`를 확인한 뒤 `ima2x serve`를 다시 시작하세요.

**이미지 생성이 `API_KEY_REQUIRED`로 실패해요**
`provider: "api"` 요청에 사용할 API 키가 설정되어 있지 않다는 뜻입니다. API 키를 설정하거나 OAuth provider로 전환하세요.

**큰 레퍼런스 이미지가 실패해요**
JPEG/PNG는 업로드 전에 자동 압축됩니다. 그래도 실패하면 해상도를 낮춘 JPEG/PNG로 바꿔 다시 시도하세요. HEIC/HEIF는 브라우저 경로에서 지원하지 않습니다.

**업데이트 후 예전 갤러리 이미지가 안 보여요**
최근 버전에서 생성 이미지 위치가 설치 폴더에서 `~/.ima2/generated`로 이동했습니다. `ima2x doctor`를 실행하고 [예전 이미지 복구 안내](RECOVER_OLD_IMAGES.md)를 확인하세요.

## 개발

```bash
git clone https://github.com/damagethundercat/ima2-gen.git
cd ima2-gen
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## 라이선스

MIT
