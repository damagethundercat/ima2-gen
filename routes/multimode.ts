import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { summarizeReferencePayload, validateAndNormalizeRefs } from "../lib/refs.js";
import { classifyUpstreamError } from "../lib/errorClassify.js";
import { normalizeOAuthParams } from "../lib/oauthNormalize.js";
import { resolveProviderOptions } from "../lib/providerOptions.js";
import { generateMultimodeViaResponses } from "../lib/responsesImageAdapter.js";
import { startJob, finishJob, registerJobAbortController, isJobCanceled } from "../lib/inflight.js";
import {
  isGenerationCanceledError,
  makeGenerationCanceledError,
  throwIfJobCanceled,
} from "../lib/generationCancel.js";
import { logEvent, logError } from "../lib/logger.js";
import { embedImageMetadataBestEffort } from "../lib/imageMetadataStore.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import { normalizeComposerInsertedPrompts, normalizeComposerPrompt } from "../lib/composerSnapshot.js";

import { errInfo } from "../lib/errInfo.js";
import { requireRuntimeContext, type RouteRuntimeContext, type RuntimeContext } from "../lib/runtimeContext.js";
function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function validateModeration(ctx: RuntimeContext, moderation: unknown) {
  if (typeof moderation !== "string" || !ctx.config.oauth.validModeration.has(moderation)) {
    return { error: "moderation must be one of: auto, low" };
  }
  return { moderation };
}

function normalizeMaxImages(value: unknown): number {
  return Math.min(8, Math.max(1, Math.trunc(Number(value) || 1)));
}

function sequenceStatus(returned: number, requested: number): "empty" | "partial" | "complete" {
  if (returned <= 0) return "empty";
  if (returned < requested) return "partial";
  return "complete";
}

interface MultimodeImage {
  b64: string;
  revisedPrompt?: string | null;
}

type MultimodeRouteItem = {
  image: string;
  filename: string;
  revisedPrompt: string | null;
  sequenceId: string;
  sequenceIndex: number;
  sequenceTotalRequested: number;
  sequenceTotalReturned: number;
  sequenceStatus: ReturnType<typeof sequenceStatus>;
};

export function registerMultimodeRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/generate/multimode", async (req: Request, res: Response) => {
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : req.id;
    let finishStatus = "completed";
    let finishHttpStatus = 200;
    let finishErrorCode;
    let finishMeta = {};
    let finishCanceled = false;
    const cancelController = new AbortController();
    const images: MultimodeRouteItem[] = [];
    const persistedIndexes = new Set<number>();
    let routeMaxImages = 0;
    let routeSequenceId = "";
    let routeStartTime = Date.now();
    let routeActiveProvider = "auto";
    let routeQuality = "medium";
    let routeEffectiveSize = "1024x1024";
    let routeModeration = "low";
    let routeImageModel: string | null = null;
    let routeWebSearchEnabled = true;
    let routePromptMode: "auto" | "direct" = "auto";
    let routeComposerPrompt: string | null = null;
    let routeComposerInsertedPrompts: ReturnType<typeof normalizeComposerInsertedPrompts> = [];
    let routeQualityWarnings: unknown[] = [];
    let latestUsage: Record<string, number> | null = null;
    let latestWebSearchCalls = 0;
    let latestExtraIgnored = 0;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      const {
        prompt,
        quality: rawQuality = "medium",
        size = "1024x1024",
        format = "png",
        moderation = "low",
        provider = "auto",
        references = [],
        mode: promptMode = "auto",
        model: rawModel,
        reasoningEffort: rawReasoningEffort,
        webSearchEnabled: rawWebSearchEnabled = true,
      } = req.body;
      const composerPrompt = normalizeComposerPrompt(req.body?.composerPrompt);
      const composerInsertedPrompts = normalizeComposerInsertedPrompts(req.body?.composerInsertedPrompts);
      const maxImages = normalizeMaxImages(req.body?.maxImages);
      const normalizedPromptMode = promptMode === "direct" ? "direct" : "auto";
      const { quality, warnings: qualityWarnings } = normalizeOAuthParams({ provider, quality: rawQuality });
      const providerOptions = resolveProviderOptions(ctx, {
        provider,
        rawModel,
        rawReasoningEffort,
        rawSize: size,
        rawWebSearchEnabled,
      });
      if (providerOptions.error) {
        finishStatus = "error";
        finishHttpStatus = providerOptions.status;
        finishErrorCode = providerOptions.code;
        sendSse(res, "error", { error: providerOptions.error, code: providerOptions.code, status: providerOptions.status, requestId });
        return;
      }
      const imageModel = providerOptions.model;
      const reasoningEffort = providerOptions.reasoningEffort;
      const effectiveSize = providerOptions.size;
      const webSearchEnabled = providerOptions.webSearchEnabled;
      const activeProvider = providerOptions.provider;
      if (!prompt) {
        finishStatus = "error";
        finishHttpStatus = 400;
        finishErrorCode = "PROMPT_REQUIRED";
        sendSse(res, "error", { error: "Prompt is required", code: finishErrorCode, status: 400, requestId });
        return;
      }
      const moderationCheck = validateModeration(ctx, moderation);
      if (moderationCheck.error) {
        finishStatus = "error";
        finishHttpStatus = 400;
        finishErrorCode = "INVALID_MODERATION";
        sendSse(res, "error", { error: moderationCheck.error, code: finishErrorCode, status: 400, requestId });
        return;
      }
      const refCheckResult = validateAndNormalizeRefs(references);
      if (refCheckResult.error) {
        finishStatus = "error";
        finishHttpStatus = 400;
        finishErrorCode = refCheckResult.code;
        sendSse(res, "error", { error: refCheckResult.error, code: refCheckResult.code, status: 400, requestId });
        return;
      }
      const refCheck = refCheckResult as Extract<typeof refCheckResult, { refs: string[] }>;
      const referencePayload = summarizeReferencePayload(references);

      startJob({
        requestId,
        kind: "multimode",
        prompt,
        meta: {
          kind: "multimode",
          quality,
          model: imageModel,
          size: effectiveSize,
          maxImages,
          refsCount: referencePayload.refsCount,
          referenceBytes: referencePayload.referenceBytes,
          referenceB64Chars: referencePayload.referenceB64Chars,
        },
      });
      registerJobAbortController(requestId, cancelController);

      logEvent("multimode", "request", {
        requestId,
        quality,
        model: imageModel,
        size: effectiveSize,
        moderation,
        maxImages,
        refs: refCheck.refs.length,
        referenceBytes: referencePayload.referenceBytes,
        promptChars: typeof prompt === "string" ? prompt.length : 0,
        webSearchEnabled,
      });

      const startTime = Date.now();
      const mimeMap: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
      const mime = mimeMap[String(format)] || "image/png";
      const sequenceId = `seq_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
      routeMaxImages = maxImages;
      routeSequenceId = sequenceId;
      routeStartTime = startTime;
      routeActiveProvider = activeProvider ?? "auto";
      routeQuality = quality;
      routeEffectiveSize = effectiveSize;
      routeModeration = moderation;
      routeImageModel = imageModel ?? null;
      routeWebSearchEnabled = webSearchEnabled ?? false;
      routePromptMode = normalizedPromptMode;
      routeComposerPrompt = composerPrompt;
      routeComposerInsertedPrompts = composerInsertedPrompts;
      routeQualityWarnings = qualityWarnings;
      await mkdir(ctx.config.storage.generatedDir, { recursive: true });

      const persistAndSendImage = async (
        image: MultimodeImage,
        index: number,
        totalReturned: number,
        status: ReturnType<typeof sequenceStatus>,
      ) => {
        if (persistedIndexes.has(index)) return;
        throwIfJobCanceled(requestId);
        const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
        const filename = `${Date.now()}_${rand}_multimode_${index}.${format}`;
        const meta = {
          kind: "multimode-image",
          generationStrategy: "one-call-text-sequence",
          sequenceId,
          sequenceIndex: index + 1,
          sequenceTotalRequested: maxImages,
          sequenceTotalReturned: totalReturned,
          sequenceStatus: status,
          stageLabel: String.fromCharCode(65 + index),
          requestId,
          prompt,
          userPrompt: prompt,
          revisedPrompt: image.revisedPrompt || null,
          promptMode: normalizedPromptMode,
          composerPrompt,
          composerInsertedPrompts,
          quality,
          size: effectiveSize,
          format,
          moderation,
          model: imageModel,
          provider: activeProvider,
          createdAt: Date.now(),
          usage: latestUsage,
          webSearchCalls: latestWebSearchCalls,
          webSearchEnabled,
          refsCount: refCheck.refs.length,
        };
        const rawBuffer = Buffer.from(image.b64, "base64");
        const embedded = await embedImageMetadataBestEffort(rawBuffer, format, meta, {
          version: ctx.packageVersion,
        });
        await writeFile(join(ctx.config.storage.generatedDir, filename), embedded.buffer);
        await writeFile(join(ctx.config.storage.generatedDir, filename + ".json"), JSON.stringify(meta)).catch(() => {});
        invalidateHistoryIndex();
        const item = {
          image: `data:${mime};base64,${image.b64}`,
          filename,
          revisedPrompt: image.revisedPrompt || null,
          sequenceId,
          sequenceIndex: index + 1,
          sequenceTotalRequested: maxImages,
          sequenceTotalReturned: totalReturned,
          sequenceStatus: status,
        };
        persistedIndexes.add(index);
        images.push(item);
        sendSse(res, "image", item);
      };

      sendSse(res, "phase", { phase: "streaming", requestId, sequenceId, maxImages });
      const generated = await generateMultimodeViaResponses(
        activeProvider,
        prompt,
        quality,
        effectiveSize,
        moderation,
        refCheck.refDetails || refCheck.refs,
        requestId,
        normalizedPromptMode,
        ctx,
        {
          model: imageModel,
          maxImages,
          reasoningEffort,
          webSearchEnabled,
          onPartialImage: (partial) =>
            isJobCanceled(requestId)
              ? undefined
              : sendSse(res, "partial", {
                  image: `data:${mime};base64,${partial.b64}`,
                  requestId,
                  sequenceId,
                  index: partial.index,
                }),
          onFinalImage: async (image, index) => {
            const totalReturned = Math.max(index + 1, images.length + 1);
            await persistAndSendImage(
              image,
              index,
              totalReturned,
              sequenceStatus(totalReturned, maxImages),
            );
          },
          signal: cancelController.signal,
        },
      );
      throwIfJobCanceled(requestId);

      latestUsage = generated.usage || null;
      latestWebSearchCalls = generated.webSearchCalls || 0;
      latestExtraIgnored = generated.extraIgnored || 0;
      for (const [index, image] of generated.images.entries() as IterableIterator<[number, MultimodeImage]>) {
        await persistAndSendImage(
          image,
          index,
          generated.images.length,
          sequenceStatus(generated.images.length, maxImages),
        );
      }

      const returned = images.length;
      const status = sequenceStatus(returned, maxImages);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      finishMeta = {
        sequenceId,
        filenames: images.map((image) => image.filename),
        imageCount: returned,
        maxImages,
        status,
      };
      finishHttpStatus = 200;
      sendSse(res, "done", {
        ok: true,
        requestId,
        sequenceId,
        requested: maxImages,
        returned,
        status,
        elapsed,
        images,
        provider: activeProvider,
        quality,
        size: effectiveSize,
        moderation,
        model: imageModel,
        usage: latestUsage,
        webSearchCalls: latestWebSearchCalls,
        webSearchEnabled,
        warnings: qualityWarnings,
        extraIgnored: latestExtraIgnored,
        promptMode: normalizedPromptMode,
        composerPrompt,
        composerInsertedPrompts,
      });
      logEvent("multimode", "saved", {
        requestId,
        sequenceId,
        imageCount: returned,
        maxImages,
        status,
        elapsedMs: Date.now() - startTime,
      });
    } catch (e) {
      const err = errInfo(e);
      const ext = (err.raw && typeof err.raw === "object" ? err.raw as Record<string, unknown> : {});
      const fallbackCode = err.code || classifyUpstreamError(err.message);
      if (isGenerationCanceledError(err.raw) || isJobCanceled(requestId)) {
        const canceled = makeGenerationCanceledError();
        finishCanceled = true;
        finishHttpStatus = canceled.status;
        finishErrorCode = canceled.code;
        sendSse(res, "error", {
          error: canceled.message,
          code: canceled.code,
          status: canceled.status,
          requestId,
        });
        return;
      }
      if ((fallbackCode === "RESPONSES_IMAGE_TIMEOUT" || err.status === 504) && images.length > 0) {
        const status = sequenceStatus(images.length, routeMaxImages);
        const elapsed = ((Date.now() - routeStartTime) / 1000).toFixed(1);
        finishStatus = "completed";
        finishHttpStatus = 206;
        finishMeta = {
          sequenceId: routeSequenceId,
          filenames: images.map((image) => image.filename),
          imageCount: images.length,
          maxImages: routeMaxImages,
          status,
          partialErrorCode: "RESPONSES_IMAGE_TIMEOUT",
        };
        sendSse(res, "done", {
          ok: true,
          partial: true,
          requestId,
          sequenceId: routeSequenceId,
          requested: routeMaxImages,
          returned: images.length,
          status,
          elapsed,
          images,
          provider: routeActiveProvider,
          quality: routeQuality,
          size: routeEffectiveSize,
          moderation: routeModeration,
          model: routeImageModel,
          usage: latestUsage,
          webSearchCalls: latestWebSearchCalls,
          webSearchEnabled: routeWebSearchEnabled,
          warnings: routeQualityWarnings,
          extraIgnored: latestExtraIgnored,
          promptMode: routePromptMode,
          composerPrompt: routeComposerPrompt,
          composerInsertedPrompts: routeComposerInsertedPrompts,
          warning: {
            code: "RESPONSES_IMAGE_TIMEOUT",
            message: "The provider timed out after returning partial multimode results.",
          },
        });
        logEvent("multimode", "partial_timeout", {
          requestId,
          sequenceId: routeSequenceId,
          imageCount: images.length,
          maxImages: routeMaxImages,
        });
        return;
      }
      finishStatus = "error";
      finishHttpStatus = err.status || 500;
      finishErrorCode = fallbackCode || "MULTIMODE_GENERATE_FAILED";
      logError("multimode", "error", err.raw, { requestId, code: finishErrorCode });
      sendSse(res, "error", {
        error: err.message,
        code: finishErrorCode,
        status: finishHttpStatus,
        requestId,
        upstreamCode: ext.upstreamCode || null,
        upstreamType: ext.upstreamType || null,
        upstreamParam: ext.upstreamParam || null,
      });
    } finally {
      finishJob(requestId, {
        canceled: finishCanceled,
        status: finishStatus,
        httpStatus: finishHttpStatus,
        errorCode: finishErrorCode,
        meta: finishMeta,
      });
      res.end();
    }
  });
}
