import { errInfo } from "./errInfo.js";
import { logWarn } from "./logger.js";
import { fetchOAuth, waitForOAuthReady } from "./oauthProxy/runtime.js";
import { PROMPT_BUILDER_SYSTEM_PROMPT } from "./promptBuilderSystemPrompt.js";
import type { RouteRuntimeContext } from "./runtimeContext.js";

const VALID_PROMPT_BUILDER_MODELS = new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]);
const DEFAULT_PROMPT_BUILDER_MODEL = "gpt-5.5";
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 16_000;
const PROMPT_BUILDER_RESPONSE_MAX_OUTPUT_TOKENS = 2400;

type PromptBuilderRole = "user" | "assistant";

export type PromptBuilderMessage = {
  role: PromptBuilderRole;
  content: string;
  attachments?: PromptBuilderAttachment[];
};

type PromptBuilderContext = {
  currentPrompt?: string;
  insertedPrompts?: Array<{ name?: string; text?: string }>;
  settings?: Record<string, unknown>;
  currentResultPrompt?: string | null;
};

type PromptBuilderAttachment = {
  kind: "image" | "text" | "file";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
};

type PromptBuilderRequest = {
  model?: unknown;
  messages?: unknown;
  context?: PromptBuilderContext;
};

type PromptBuilderError = Error & {
  status?: number;
  code?: string;
  upstreamStatus?: number;
  upstreamBodyChars?: number;
  upstreamEndpoint?: "chat" | "responses";
  upstreamCode?: string;
  upstreamType?: string;
  upstreamParam?: string;
  responseBodyKeys?: string;
  responseStatus?: string;
  responseErrorCode?: string;
  responseErrorType?: string;
  responseErrorParam?: string;
  responseIncompleteReason?: string;
  responseOutputTypes?: string;
  responseContentTypes?: string;
  responseOutputCount?: number;
  responseContentCount?: number;
};

type ResponseShapeSummary = Pick<
  PromptBuilderError,
  | "responseBodyKeys"
  | "responseStatus"
  | "responseErrorCode"
  | "responseErrorType"
  | "responseErrorParam"
  | "responseIncompleteReason"
  | "responseOutputTypes"
  | "responseContentTypes"
  | "responseOutputCount"
  | "responseContentCount"
>;

type ChatCompletionBody = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
    };
  }>;
  usage?: Record<string, unknown>;
};

type ResponsesBody = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string | { value?: string };
      value?: string;
      refusal?: string;
    }>;
  }>;
  usage?: Record<string, unknown>;
};

type ResponsesReadResult = {
  content: string;
  usage: Record<string, unknown> | null;
  summary: ResponseShapeSummary;
};

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

function promptBuilderError(message: string, code: string, status = 400): PromptBuilderError {
  const err = new Error(message) as PromptBuilderError;
  err.code = code;
  err.status = status;
  return err;
}

function normalizeModel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return DEFAULT_PROMPT_BUILDER_MODEL;
  if (!VALID_PROMPT_BUILDER_MODELS.has(raw)) {
    throw promptBuilderError("model must be one of: gpt-5.5, gpt-5.4, gpt-5.4-mini", "PROMPT_BUILDER_BAD_MODEL");
  }
  return raw;
}

function normalizeMessages(raw: unknown): PromptBuilderMessage[] {
  if (!Array.isArray(raw)) {
    throw promptBuilderError("messages must be an array", "PROMPT_BUILDER_BAD_MESSAGES");
  }
  const messages = raw.slice(-MAX_MESSAGES).map((message): PromptBuilderMessage => {
    if (!message || typeof message !== "object") {
      throw promptBuilderError("each message must be an object", "PROMPT_BUILDER_BAD_MESSAGES");
    }
    const item = message as { role?: unknown; content?: unknown; attachments?: unknown };
    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    if (!role) throw promptBuilderError("message role must be user or assistant", "PROMPT_BUILDER_BAD_MESSAGES");
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content && role === "user") {
      throw promptBuilderError("message content is required", "PROMPT_BUILDER_EMPTY_MESSAGE");
    }
    return {
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
      attachments: normalizeAttachments(item.attachments),
    };
  });
  const last = messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim()) {
    throw promptBuilderError("last message must be a non-empty user message", "PROMPT_BUILDER_EMPTY_MESSAGE");
  }
  return messages;
}

function normalizeAttachments(raw: unknown): PromptBuilderAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const attachments = raw.slice(0, 6).flatMap((attachment): PromptBuilderAttachment[] => {
    if (!attachment || typeof attachment !== "object") return [];
    const item = attachment as Record<string, unknown>;
    const kind =
      item.kind === "image" || item.kind === "text" || item.kind === "file"
        ? item.kind
        : "file";
    const name = typeof item.name === "string" && item.name.trim()
      ? item.name.trim().slice(0, 160)
      : "attachment";
    const mimeType = typeof item.mimeType === "string" && item.mimeType.trim()
      ? item.mimeType.trim().slice(0, 120)
      : "application/octet-stream";
    const size = typeof item.size === "number" && Number.isFinite(item.size)
      ? Math.max(0, Math.trunc(item.size))
      : 0;
    if (kind === "image") {
      const dataUrl = typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/")
        ? item.dataUrl
        : "";
      if (!dataUrl) return [];
      return [{ kind, name, mimeType, size, dataUrl }];
    }
    if (kind === "text") {
      const text = typeof item.text === "string" ? item.text.slice(0, 20_000) : "";
      return [{ kind, name, mimeType, size, text }];
    }
    return [{ kind, name, mimeType, size }];
  });
  return attachments.length > 0 ? attachments : undefined;
}

function contextText(context: PromptBuilderContext | undefined): string {
  const lines: string[] = [];
  const currentPrompt = typeof context?.currentPrompt === "string" ? context.currentPrompt.trim() : "";
  if (currentPrompt) lines.push(`Current main prompt:\n${currentPrompt}`);
  const blocks = Array.isArray(context?.insertedPrompts) ? context.insertedPrompts : [];
  if (blocks.length > 0) {
    lines.push(`Inserted prompt blocks:\n${blocks.map((block, index) => {
      const name = typeof block.name === "string" && block.name.trim() ? block.name.trim() : `Block ${index + 1}`;
      const text = typeof block.text === "string" ? block.text.trim() : "";
      return `- ${name}: ${text}`;
    }).join("\n")}`);
  }
  if (context?.settings && typeof context.settings === "object") {
    lines.push(`Generation settings:\n${JSON.stringify(context.settings)}`);
  }
  const resultPrompt = typeof context?.currentResultPrompt === "string" ? context.currentResultPrompt.trim() : "";
  if (resultPrompt) lines.push(`Current result prompt:\n${resultPrompt}`);
  return lines.join("\n\n");
}

function attachmentText(attachments: PromptBuilderAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return "";
  const lines = attachments.flatMap((attachment, index) => {
    const label = `Attachment ${index + 1}: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`;
    if (attachment.kind === "text" && attachment.text?.trim()) {
      return [`${label}\n${attachment.text.trim()}`];
    }
    if (attachment.kind === "image") {
      return [`${label}\nImage is attached as visual reference.`];
    }
    return [label];
  });
  return `User attachments:\n${lines.join("\n\n")}`;
}

function toChatContent(message: PromptBuilderMessage): string | ChatContentPart[] {
  const text = [message.content, attachmentText(message.attachments)].filter(Boolean).join("\n\n");
  const imageParts = (message.attachments ?? [])
    .filter((attachment) => attachment.kind === "image" && attachment.dataUrl)
    .map((attachment): ChatContentPart => ({
      type: "image_url",
      image_url: { url: attachment.dataUrl as string },
    }));
  if (imageParts.length === 0) return text;
  return [
    { type: "text", text },
    ...imageParts,
  ];
}

function toResponsesContent(message: PromptBuilderMessage): string | ResponsesContentPart[] {
  const text = [message.content, attachmentText(message.attachments)].filter(Boolean).join("\n\n");
  const imageParts = (message.attachments ?? [])
    .filter((attachment) => attachment.kind === "image" && attachment.dataUrl)
    .map((attachment): ResponsesContentPart => ({
      type: "input_image",
      image_url: attachment.dataUrl as string,
    }));
  if (imageParts.length === 0) return text;
  return [
    { type: "input_text", text },
    ...imageParts,
  ];
}

function hasImageAttachments(messages: PromptBuilderMessage[]): boolean {
  return messages.some((message) =>
    message.attachments?.some((attachment) => attachment.kind === "image" && attachment.dataUrl),
  );
}

function safeUpstreamString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined;
}

function parseUpstreamError(text: string): Pick<
  PromptBuilderError,
  "upstreamCode" | "upstreamType" | "upstreamParam"
> {
  try {
    const body = JSON.parse(text) as { error?: Record<string, unknown> };
    const error = body && typeof body.error === "object" ? body.error : undefined;
    return {
      upstreamCode: safeUpstreamString(error?.code),
      upstreamType: safeUpstreamString(error?.type),
      upstreamParam: safeUpstreamString(error?.param),
    };
  } catch {
    return {};
  }
}

function responseSummary(body: unknown): ResponseShapeSummary {
  if (!body || typeof body !== "object") {
    return {
      responseBodyKeys: "",
      responseStatus: undefined,
      responseErrorCode: undefined,
      responseErrorType: undefined,
      responseErrorParam: undefined,
      responseIncompleteReason: undefined,
      responseOutputTypes: "",
      responseContentTypes: "",
      responseOutputCount: 0,
      responseContentCount: 0,
    };
  }
  const record = body as Record<string, unknown>;
  const output = Array.isArray(record.output) ? record.output : [];
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : undefined;
  const incomplete = record.incomplete_details && typeof record.incomplete_details === "object"
    ? record.incomplete_details as Record<string, unknown>
    : undefined;
  const contentItems = output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    return Array.isArray(content) ? content : [];
  });
  const outputTypes = output
    .map((item) => item && typeof item === "object" ? (item as { type?: unknown }).type : undefined)
    .filter((type): type is string => typeof type === "string" && type.length > 0);
  const contentTypes = contentItems
    .map((item) => item && typeof item === "object" ? (item as { type?: unknown }).type : undefined)
    .filter((type): type is string => typeof type === "string" && type.length > 0);
  return {
    responseBodyKeys: Object.keys(record).slice(0, 12).join(","),
    responseStatus: safeUpstreamString(record.status),
    responseErrorCode: safeUpstreamString(error?.code),
    responseErrorType: safeUpstreamString(error?.type),
    responseErrorParam: safeUpstreamString(error?.param),
    responseIncompleteReason: safeUpstreamString(incomplete?.reason),
    responseOutputTypes: Array.from(new Set(outputTypes)).slice(0, 12).join(","),
    responseContentTypes: Array.from(new Set(contentTypes)).slice(0, 12).join(","),
    responseOutputCount: output.length,
    responseContentCount: contentItems.length,
  };
}

function extractSseData(block: string): string {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

function parseSseJson(block: string): Record<string, unknown> | null {
  const data = extractSseData(block);
  if (!data || data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function extractChatText(body: ChatCompletionBody): string {
  return body.choices?.find((choice) =>
    typeof choice.message?.content === "string" && choice.message.content.trim(),
  )?.message?.content ?? "";
}

function extractResponsesText(body: ResponsesBody): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) return content.text;
      if (content.text && typeof content.text === "object" && typeof content.text.value === "string" && content.text.value.trim()) {
        return content.text.value;
      }
      if (typeof content.value === "string" && content.value.trim()) return content.value;
      if (typeof content.refusal === "string" && content.refusal.trim()) return content.refusal;
    }
  }
  return "";
}

async function readResponsesStream(res: Response): Promise<ResponsesReadResult> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const deltas: string[] = [];
  let buffer = "";
  let usage: Record<string, unknown> | null = null;
  let summary = responseSummary(null);
  if (!reader) return { content: "", usage, summary };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = parseSseJson(block);
      if (data) {
        const type = typeof data.type === "string" ? data.type : "";
        if (type === "response.output_text.delta" && typeof data.delta === "string") {
          deltas.push(data.delta);
        } else if ((type === "response.completed" || type === "response.incomplete") && data.response && typeof data.response === "object") {
          const response = data.response as Record<string, unknown>;
          summary = responseSummary(response);
          if (response.usage && typeof response.usage === "object") usage = response.usage as Record<string, unknown>;
        } else if (type === "error") {
          throw promptBuilderError("Prompt builder stream failed", "PROMPT_BUILDER_STREAM_ERROR", 502);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) {
    const data = parseSseJson(buffer);
    if (data?.type === "response.output_text.delta" && typeof data.delta === "string") {
      deltas.push(data.delta);
    }
  }
  return { content: deltas.join(""), usage, summary };
}

async function readResponsesResult(res: Response): Promise<ResponsesReadResult> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return readResponsesStream(res);
  }
  const body = await res.json() as ResponsesBody;
  return {
    content: extractResponsesText(body),
    usage: body.usage ?? null,
    summary: responseSummary(body),
  };
}

export async function requestPromptBuilderChat(ctx: RouteRuntimeContext, input: PromptBuilderRequest) {
  const model = normalizeModel(input.model);
  const messages = normalizeMessages(input.messages);
  const currentContextText = contextText(input.context);
  await waitForOAuthReady(ctx);
  const timeoutMs = ctx.config?.oauth?.generationTimeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const systemText = [
      PROMPT_BUILDER_SYSTEM_PROMPT,
      currentContextText
        ? `Current ima2-genX context:\n${currentContextText}`
        : "",
    ].filter(Boolean).join("\n\n");
    const useResponses = hasImageAttachments(messages);
    const endpoint = useResponses ? "responses" : "chat";
    const payload = useResponses
      ? {
          model,
          instructions: systemText,
          input: messages.map((message) => ({
              role: message.role,
              content: toResponsesContent(message),
            })),
          stream: true,
          max_output_tokens: PROMPT_BUILDER_RESPONSE_MAX_OUTPUT_TOKENS,
        }
      : {
          model,
          messages: [
            {
              role: "system",
              content: systemText,
            },
            ...messages.map((message) => ({
              role: message.role,
              content: toChatContent(message),
            })),
          ],
          stream: false,
          reasoning_effort: "low",
        };
    const res = await fetchOAuth(`${ctx.oauthUrl}${endpoint === "responses" ? "/v1/responses" : "/v1/chat/completions"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload),
    }, { scope: "prompt-builder" });
    if (!res.ok) {
      const text = await res.text();
      const upstream = parseUpstreamError(text);
      logWarn("prompt-builder", "upstream_failed", {
        endpoint,
        model,
        status: res.status,
        hasImageAttachments: useResponses,
        upstreamBodyChars: text.length,
        upstreamCode: upstream.upstreamCode,
        upstreamType: upstream.upstreamType,
        upstreamParam: upstream.upstreamParam,
      });
      const err = promptBuilderError("Prompt builder upstream failed", "PROMPT_BUILDER_UPSTREAM_FAILED", 502);
      err.upstreamStatus = res.status;
      err.upstreamBodyChars = text.length;
      err.upstreamEndpoint = endpoint;
      err.upstreamCode = upstream.upstreamCode;
      err.upstreamType = upstream.upstreamType;
      err.upstreamParam = upstream.upstreamParam;
      throw err;
    }
    const body = useResponses
      ? await readResponsesResult(res)
      : await res.json() as ChatCompletionBody;
    const content = (useResponses
      ? (body as ResponsesReadResult).content
      : extractChatText(body as ChatCompletionBody)
    ).trim();
    if (!content) {
      const summary = useResponses
        ? (body as ResponsesReadResult).summary
        : responseSummary(body);
      logWarn("prompt-builder", "empty_response", {
        endpoint,
        model,
        ...summary,
      });
      const err = promptBuilderError("Prompt builder returned an empty response", "PROMPT_BUILDER_EMPTY_RESPONSE", 502);
      err.upstreamEndpoint = endpoint;
      Object.assign(err, summary);
      throw err;
    }
    return {
      provider: "oauth" as const,
      model,
      message: { role: "assistant" as const, content },
      usage: useResponses ? (body as ResponsesReadResult).usage : (body as ChatCompletionBody).usage ?? null,
    };
  } catch (error) {
    const info = errInfo(error);
    if (info.name === "AbortError") {
      throw promptBuilderError("Prompt builder timed out", "PROMPT_BUILDER_TIMEOUT", 504);
    }
    throw info.raw;
  } finally {
    clearTimeout(timer);
  }
}
