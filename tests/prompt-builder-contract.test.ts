import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { configureRoutes } from "../routes/index.ts";
import type { RouteRuntimeContext } from "../lib/runtimeContext.ts";

const rootDir = process.cwd();

function makeCtx(oauthUrl: string): RouteRuntimeContext {
  return {
    rootDir,
    oauthUrl,
    oauthPort: 10531,
    oauthReadyState: "ready" as const,
    oauthReadyPromise: Promise.resolve(),
    config: {
      features: { cardNews: false },
      storage: { generatedDir: "/tmp/ima2-prompt-builder", staticMaxAge: "0" },
      server: { bodyLimit: "2mb" },
      oauth: {
        proxyPort: 10531,
        statusTimeoutMs: 3000,
        generationTimeoutMs: 10_000,
        validModeration: new Set(["auto", "low"]),
      },
      imageModels: {
        default: "gpt-5.4-mini",
        valid: new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]),
        unsupported: new Set(["gpt-5.3-codex-spark"]),
        reasoningEffort: "medium",
        validReasoningEfforts: new Set(["none", "low", "medium", "high", "xhigh"]),
      },
    },
  };
}

async function listen(app: express.Express) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as import("node:net").AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe("prompt builder OAuth chat contract", () => {
  it("posts a text-only chat request through the OAuth proxy", async () => {
    let captured: Record<string, unknown> | null = null;
    const upstream = express();
    upstream.use(express.json());
    upstream.post("/v1/chat/completions", (req, res) => {
      captured = req.body as Record<string, unknown>;
      res.json({
        choices: [
          {
            message: {
              role: "assistant",
              content: "cinematic rainy Seoul street, 35mm documentary photo",
            },
          },
        ],
        usage: { total_tokens: 42 },
      });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json());
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [{ role: "user", content: "Refine a rainy Seoul street prompt" }],
          context: {
            currentPrompt: "documentary photo",
            insertedPrompts: [{ name: "film texture", text: "muted grain" }],
            settings: { quality: "high", size: "1536x1024" },
          },
        }),
      });

      assert.equal(response.status, 200);
      const body = await response.json() as {
        message?: { role?: string; content?: string };
        model?: string;
        provider?: string;
        usage?: { total_tokens?: number };
      };
      assert.equal(body.provider, "oauth");
      assert.equal(body.model, "gpt-5.4-mini");
      assert.equal(body.message?.role, "assistant");
      assert.match(body.message?.content ?? "", /cinematic rainy Seoul/);
      assert.equal(body.usage?.total_tokens, 42);

      assert.ok(captured, "OAuth proxy request should be captured");
      assert.equal(captured?.model, "gpt-5.4-mini");
      assert.equal(captured?.stream, false);
      assert.equal(captured?.reasoning_effort, "low");
      assert.doesNotMatch(JSON.stringify(captured), /image_generation/);
      assert.match(JSON.stringify(captured), /documentary photo/);
      assert.match(JSON.stringify(captured), /rainy Seoul street/);
      const capturedMessages = captured?.messages as Array<{ role?: string; content?: string }>;
      assert.equal(capturedMessages[0]?.role, "system");
      assert.match(capturedMessages[0]?.content ?? "", /prompt enhancement GPT specialized for GPT Image 2/);
      assert.match(capturedMessages[0]?.content ?? "", /Final Prompt - Korean:/);
      assert.match(capturedMessages[0]?.content ?? "", /Final Prompt - English:/);
      assert.match(capturedMessages[0]?.content ?? "", /Current ima2-gen context:/);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });

  it("posts image attachments through Responses as input_image parts", async () => {
    let captured: Record<string, unknown> | null = null;
    const upstream = express();
    upstream.use(express.json({ limit: "2mb" }));
    upstream.post("/v1/responses", (req, res) => {
      captured = req.body as Record<string, unknown>;
      res.setHeader("Content-Type", "text/event-stream");
      res.send([
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Brief Intent Summary:\\nExtract "}',
        "",
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"the attached image prompt."}',
        "",
        'event: response.completed',
        'data: {"type":"response.completed","response":{"usage":{"total_tokens":64,"input_tokens":12,"output_tokens":52}}}',
        "",
        "",
      ].join("\n"));
    });
    upstream.post("/v1/chat/completions", (_req, res) => {
      res.status(500).json({ error: { message: "image attachments should not use chat completions" } });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json({ limit: "2mb" }));
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            {
              role: "user",
              content: "Extract a generation prompt from this image",
              attachments: [
                {
                  kind: "image",
                  name: "image.png",
                  mimeType: "image/png",
                  size: 68,
                  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
                },
              ],
            },
          ],
        }),
      });

      assert.equal(response.status, 200);
      const body = await response.json() as {
        message?: { role?: string; content?: string };
        model?: string;
        provider?: string;
        usage?: { total_tokens?: number };
      };
      assert.equal(body.provider, "oauth");
      assert.equal(body.model, "gpt-5.4-mini");
      assert.equal(body.message?.role, "assistant");
      assert.match(body.message?.content ?? "", /Extract the attached image prompt/);
      assert.equal(body.usage?.total_tokens, 64);

      assert.ok(captured, "OAuth Responses request should be captured");
      assert.equal(captured?.model, "gpt-5.4-mini");
      assert.equal(captured?.stream, true);
      assert.equal(captured?.reasoning, undefined);
      assert.equal(captured?.reasoning_effort, undefined);
      assert.equal(captured?.max_output_tokens, 2400);
      assert.equal(typeof captured?.instructions, "string");
      const responseInput = captured?.input as Array<{ role?: string }> | undefined;
      assert.equal(responseInput?.[0]?.role, "user");
      const serialized = JSON.stringify(captured);
      assert.match(serialized, /input_image/);
      assert.match(serialized, /data:image\/png;base64/);
      assert.match(serialized, /input_text/);
      assert.doesNotMatch(serialized, /"type":"image_url"/);
      assert.match(serialized, /Extract a generation prompt/);
      assert.match(serialized, /prompt enhancement GPT specialized for GPT Image 2/);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });

  it("validates model and user message before hitting OAuth", async () => {
    const app = express();
    app.use(express.json());
    configureRoutes(app, makeCtx("http://127.0.0.1:9"));
    const server = await listen(app);

    try {
      const badModel = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.3-codex-spark",
          messages: [{ role: "user", content: "hello" }],
        }),
      });
      assert.equal(badModel.status, 400);
      assert.equal(((await badModel.json()) as { error?: { code?: string } }).error?.code, "PROMPT_BUILDER_BAD_MODEL");

      const emptyMessage = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "   " }] }),
      });
      assert.equal(emptyMessage.status, 400);
      assert.equal(((await emptyMessage.json()) as { error?: { code?: string } }).error?.code, "PROMPT_BUILDER_EMPTY_MESSAGE");
    } finally {
      await server.close();
    }
  });

  it("returns safe upstream diagnostics when an image prompt builder request fails", async () => {
    const upstream = express();
    upstream.use(express.json({ limit: "2mb" }));
    upstream.post("/v1/responses", (_req, res) => {
      res.status(400).json({
        error: {
          code: "unsupported_image_input",
          type: "invalid_request_error",
          param: "input[1].content[1].image_url",
          message: "Raw provider message should stay server-side.",
        },
      });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json({ limit: "2mb" }));
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            {
              role: "user",
              content: "Extract a generation prompt from this image",
              attachments: [
                {
                  kind: "image",
                  name: "image.png",
                  mimeType: "image/png",
                  size: 68,
                  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
                },
              ],
            },
          ],
        }),
      });

      assert.equal(response.status, 502);
      const body = await response.json() as {
        error?: {
          code?: string;
          upstreamStatus?: number;
          upstreamEndpoint?: string;
          upstreamCode?: string;
          upstreamType?: string;
          upstreamParam?: string;
          upstreamBodyChars?: number;
        };
      };
      assert.equal(body.error?.code, "PROMPT_BUILDER_UPSTREAM_FAILED");
      assert.equal(body.error?.upstreamStatus, 400);
      assert.equal(body.error?.upstreamEndpoint, "responses");
      assert.equal(body.error?.upstreamCode, "unsupported_image_input");
      assert.equal(body.error?.upstreamType, "invalid_request_error");
      assert.equal(body.error?.upstreamParam, "input[1].content[1].image_url");
      assert.equal(typeof body.error?.upstreamBodyChars, "number");
      assert.doesNotMatch(JSON.stringify(body), /Raw provider message/);
      assert.doesNotMatch(JSON.stringify(body), /data:image/);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });

  it("surfaces Responses refusal text as a builder message instead of a generic failure", async () => {
    const upstream = express();
    upstream.use(express.json({ limit: "2mb" }));
    upstream.post("/v1/responses", (_req, res) => {
      res.json({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "refusal",
                refusal: "I can help with a safer prompt if you describe the intended image.",
              },
            ],
          },
        ],
        usage: { total_tokens: 18 },
      });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json({ limit: "2mb" }));
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            {
              role: "user",
              content: "Extract a generation prompt from this image",
              attachments: [
                {
                  kind: "image",
                  name: "image.png",
                  mimeType: "image/png",
                  size: 68,
                  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
                },
              ],
            },
          ],
        }),
      });

      assert.equal(response.status, 200);
      const body = await response.json() as {
        message?: { role?: string; content?: string };
        usage?: { total_tokens?: number };
      };
      assert.equal(body.message?.role, "assistant");
      assert.match(body.message?.content ?? "", /safer prompt/);
      assert.equal(body.usage?.total_tokens, 18);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });

  it("returns safe response-shape diagnostics when Responses has no usable text", async () => {
    const upstream = express();
    upstream.use(express.json({ limit: "2mb" }));
    upstream.post("/v1/responses", (_req, res) => {
      res.json({
        id: "resp_test",
        output: [
          {
            type: "reasoning",
            summary: [],
          },
        ],
      });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json({ limit: "2mb" }));
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            {
              role: "user",
              content: "Extract a generation prompt from this image",
              attachments: [
                {
                  kind: "image",
                  name: "image.png",
                  mimeType: "image/png",
                  size: 68,
                  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
                },
              ],
            },
          ],
        }),
      });

      assert.equal(response.status, 502);
      const body = await response.json() as {
        error?: {
          code?: string;
          upstreamEndpoint?: string;
          responseStatus?: string;
          responseBodyKeys?: string;
          responseOutputTypes?: string;
          responseContentTypes?: string;
          responseOutputCount?: number;
          responseContentCount?: number;
        };
      };
      assert.equal(body.error?.code, "PROMPT_BUILDER_EMPTY_RESPONSE");
      assert.equal(body.error?.upstreamEndpoint, "responses");
      assert.equal(body.error?.responseStatus, undefined);
      assert.equal(body.error?.responseBodyKeys, "id,output");
      assert.equal(body.error?.responseOutputTypes, "reasoning");
      assert.equal(body.error?.responseContentTypes, "");
      assert.equal(body.error?.responseOutputCount, 1);
      assert.equal(body.error?.responseContentCount, 0);
      assert.doesNotMatch(JSON.stringify(body), /data:image/);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });

  it("returns safe Responses status diagnostics when a 200 response object failed internally", async () => {
    const upstream = express();
    upstream.use(express.json({ limit: "2mb" }));
    upstream.post("/v1/responses", (_req, res) => {
      res.json({
        id: "resp_failed",
        object: "response",
        status: "failed",
        error: {
          code: "model_not_supported",
          type: "invalid_request_error",
          param: "model",
          message: "Raw provider message should stay server-side.",
        },
        incomplete_details: {
          reason: "max_output_tokens",
        },
        output: [],
      });
    });
    const upstreamServer = await listen(upstream);

    const app = express();
    app.use(express.json({ limit: "2mb" }));
    configureRoutes(app, makeCtx(upstreamServer.baseUrl));
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/prompt-builder/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.5",
          messages: [
            {
              role: "user",
              content: "Extract a generation prompt from this image",
              attachments: [
                {
                  kind: "image",
                  name: "image.png",
                  mimeType: "image/png",
                  size: 68,
                  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
                },
              ],
            },
          ],
        }),
      });

      assert.equal(response.status, 502);
      const body = await response.json() as {
        error?: {
          code?: string;
          upstreamEndpoint?: string;
          responseStatus?: string;
          responseErrorCode?: string;
          responseErrorType?: string;
          responseErrorParam?: string;
          responseIncompleteReason?: string;
          responseOutputCount?: number;
        };
      };
      assert.equal(body.error?.code, "PROMPT_BUILDER_EMPTY_RESPONSE");
      assert.equal(body.error?.upstreamEndpoint, "responses");
      assert.equal(body.error?.responseStatus, "failed");
      assert.equal(body.error?.responseErrorCode, "model_not_supported");
      assert.equal(body.error?.responseErrorType, "invalid_request_error");
      assert.equal(body.error?.responseErrorParam, "model");
      assert.equal(body.error?.responseIncompleteReason, "max_output_tokens");
      assert.equal(body.error?.responseOutputCount, 0);
      assert.doesNotMatch(JSON.stringify(body), /Raw provider message/);
      assert.doesNotMatch(JSON.stringify(body), /data:image/);
    } finally {
      await server.close();
      await upstreamServer.close();
    }
  });
});
