import type { Express, Request, Response } from "express";
import { errInfo } from "../lib/errInfo.js";
import { requestPromptBuilderChat } from "../lib/promptBuilderClient.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

function sendError(res: Response, error: unknown) {
  const info = errInfo(error);
  const raw = info.raw && typeof info.raw === "object" ? info.raw as Record<string, unknown> : {};
  const upstreamDetails = info.code === "PROMPT_BUILDER_UPSTREAM_FAILED"
    ? {
        upstreamStatus: typeof raw.upstreamStatus === "number" ? raw.upstreamStatus : undefined,
        upstreamEndpoint: typeof raw.upstreamEndpoint === "string" ? raw.upstreamEndpoint : undefined,
        upstreamCode: typeof raw.upstreamCode === "string" ? raw.upstreamCode : undefined,
        upstreamType: typeof raw.upstreamType === "string" ? raw.upstreamType : undefined,
        upstreamParam: typeof raw.upstreamParam === "string" ? raw.upstreamParam : undefined,
        upstreamBodyChars: typeof raw.upstreamBodyChars === "number" ? raw.upstreamBodyChars : undefined,
      }
    : {};
  const responseShapeDetails = info.code === "PROMPT_BUILDER_EMPTY_RESPONSE"
    ? {
        upstreamEndpoint: typeof raw.upstreamEndpoint === "string" ? raw.upstreamEndpoint : undefined,
        responseBodyKeys: typeof raw.responseBodyKeys === "string" ? raw.responseBodyKeys : undefined,
        responseStatus: typeof raw.responseStatus === "string" ? raw.responseStatus : undefined,
        responseErrorCode: typeof raw.responseErrorCode === "string" ? raw.responseErrorCode : undefined,
        responseErrorType: typeof raw.responseErrorType === "string" ? raw.responseErrorType : undefined,
        responseErrorParam: typeof raw.responseErrorParam === "string" ? raw.responseErrorParam : undefined,
        responseIncompleteReason: typeof raw.responseIncompleteReason === "string" ? raw.responseIncompleteReason : undefined,
        responseOutputTypes: typeof raw.responseOutputTypes === "string" ? raw.responseOutputTypes : undefined,
        responseContentTypes: typeof raw.responseContentTypes === "string" ? raw.responseContentTypes : undefined,
        responseOutputCount: typeof raw.responseOutputCount === "number" ? raw.responseOutputCount : undefined,
        responseContentCount: typeof raw.responseContentCount === "number" ? raw.responseContentCount : undefined,
      }
    : {};
  res.status(info.status || 500).json({
    error: {
      code: info.code || "PROMPT_BUILDER_ERROR",
      message: info.message || "Prompt builder request failed",
      ...upstreamDetails,
      ...responseShapeDetails,
    },
  });
}

export function registerPromptBuilderRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/prompt-builder/chat", async (req: Request, res: Response) => {
    try {
      res.json(await requestPromptBuilderChat(ctx, (req.body ?? {}) as Parameters<typeof requestPromptBuilderChat>[1]));
    } catch (error) {
      sendError(res, error);
    }
  });
}
