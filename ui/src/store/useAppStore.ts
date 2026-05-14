// All localStorage keys this store touches MUST be listed in
// ./persistenceRegistry.ts. The contract test
// tests/settings-persistence-contract.test.js enforces this invariant.
// Legacy generation-controls contract: GENERATION_DEFAULTS_STORAGE_KEY = "ima2.generationDefaults".
import { create } from "zustand";
import type { CanvasExportBackground, HexColor } from "../types/canvas";
import type {
  ComposerInsertedPromptSnapshot,
  Count,
  Format,
  GenerateItem,
  GenerateResponse,
  HistoryStripLayout,
  EmbeddedGenerationMetadata,
  ImageModel,
  Moderation,
  MultimodeGenerateResponse,
  MultimodeSequenceStatus,
  Provider,
  Quality,
  ResolvedTheme,
  SettingsSection,
  SizePreset,
  ThemeFamily,
  ThemePreference,
  UIMode,
} from "../types";
import { THEME_FAMILIES } from "../types";
import { isMultiResponse } from "../types";
import {
  postGenerate,
  postMultimodeGenerateStream,
  getHistory,
  getInflight,
  cancelInflight,
  postNodeGenerateStream,
  listSessions as apiListSessions,
  createSession as apiCreateSession,
  getSession as apiGetSession,
  renameSession as apiRenameSession,
  deleteSession as apiDeleteSession,
  saveSessionGraph,
  readImageMetadata,
  getBrowserId,
  deleteHistoryItem,
  restoreHistoryItem,
  permanentlyDeleteHistoryItem,
  getPromptLibrary,
  createPrompt,
  deletePrompt,
  togglePromptFavorite,
  toggleGalleryFavorite,
  importPromptLibrary,
  importLocalImage,
  postPromptBuilderChat,
  type HistoryCursor,
  type PromptBuilderChatAttachment,
  type PromptBuilderChatMessage,
  type SessionSummary,
  type SessionFull,
  type SessionGraphEdge,
} from "../lib/api";
import { compressImage, readFileAsDataURL } from "../lib/image";
import { compressToBase64, isHeic, hasAlphaChannel } from "../lib/compress";
import {
  normalizeCustomSizePairDetailed,
  parseRequestedCustomSide,
  type CustomSizeAdjustmentReason,
} from "../lib/size";
import {
  DEFAULT_IMAGE_MODEL,
  isImageModel,
} from "../lib/imageModels";
import {
  DEFAULT_REASONING_EFFORT,
  isReasoningEffort,
  type ReasoningEffort,
} from "../lib/reasoning";
import {
  DEFAULT_WEB_SEARCH_ENABLED,
} from "../lib/webSearch";
import {
  ACTIVE_SESSION_ID_STORAGE_KEY,
  CANVAS_EXPORT_BG_KEY,
  GALLERY_DEFAULT_SCOPE_STORAGE_KEY,
  GALLERY_SCOPE_STORAGE_KEY,
  GENERATION_DEFAULTS_STORAGE_KEY,
  GRAPH_TAB_ID_KEY,
  HISTORY_STRIP_LAYOUT_STORAGE_KEY,
  IMAGE_MODEL_STORAGE_KEY,
  IN_FLIGHT_STORAGE_KEY,
  LEFT_SIDEBAR_OPEN_STORAGE_KEY,
  PROMPT_BUILDER_SESSIONS_STORAGE_KEY,
  REASONING_EFFORT_STORAGE_KEY,
  RIGHT_PANEL_OPEN_STORAGE_KEY,
  SELECTED_FILENAME_STORAGE_KEY,
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  WEB_SEARCH_STORAGE_KEY,
} from "./persistenceRegistry";
import { newClientNodeId, type ClientNodeId } from "../lib/graph";
import {
  deriveParentServerNodeIds,
  wouldCreateMultipleIncomingEdge,
} from "../lib/nodeGraph";
import { getNextChildPosition, getNextRootPosition } from "../lib/nodeLayout";
import {
  clearNodeRefs as clearStoredNodeRefs,
  loadNodeRefs,
  pruneNodeRefs,
  saveNodeRefs,
} from "../lib/nodeRefStorage";
import {
  applyComponentSelection,
  applySelectedNodeIds,
  getSelectedNodeIds,
} from "../lib/nodeSelection";
import {
  getDirectUnselectedChildren,
  getUnselectedDownstreamIds,
  nodeHasImage,
  topologicalSortSelected,
  validateBatchDependencies,
  type NodeBatchMode,
} from "../lib/nodeBatch";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";
import { t, loadLocale, saveLocale, type Locale } from "../i18n";
import type { ImaErrorCode } from "../lib/errorCodes";
import { handleError } from "../lib/errorHandler";
import { ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import {
  getNeighborAfterRemoval,
  getShortcutTarget,
  getVisibleGalleryItems,
  resolveVisibleShortcutCurrent,
  type GalleryShortcutAction,
} from "../lib/galleryShortcuts";

export type GalleryScope = "current-session" | "all";

function loadRightPanelOpen(): boolean {
  try {
    const raw = localStorage.getItem(RIGHT_PANEL_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

function loadLeftSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(LEFT_SIDEBAR_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

function loadUIMode(): UIMode {
  try {
    const raw = localStorage.getItem(UI_MODE_STORAGE_KEY);
    if (raw === "card-news") return ENABLE_CARD_NEWS_MODE ? raw : "classic";
    if (raw === "node") return ENABLE_NODE_MODE ? raw : "classic";
    if (raw === "classic") return raw;
  } catch {}
  return "classic";
}

function loadThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "system" || raw === "dark" || raw === "light") return raw;
  } catch {}
  return "system";
}

function loadThemeFamily(): ThemeFamily {
  try {
    const raw = localStorage.getItem(THEME_FAMILY_STORAGE_KEY);
    if (raw && (THEME_FAMILIES as readonly string[]).includes(raw)) {
      return raw as ThemeFamily;
    }
  } catch {}
  return "default";
}

function loadHistoryStripLayout(): HistoryStripLayout {
  try {
    const raw = localStorage.getItem(HISTORY_STRIP_LAYOUT_STORAGE_KEY);
    if (raw === "rail" || raw === "horizontal" || raw === "sidebar") return raw;
  } catch {}
  return "rail";
}

function loadGalleryScope(key: string): GalleryScope {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "current-session" || raw === "all") return raw;
  } catch {}
  return "current-session";
}

function loadCanvasExportBackground(): { mode: CanvasExportBackground; matteColor: HexColor } {
  if (typeof window === "undefined") return { mode: "alpha", matteColor: "#ffffff" };
  try {
    const raw = window.localStorage.getItem(CANVAS_EXPORT_BG_KEY);
    if (!raw) return { mode: "alpha", matteColor: "#ffffff" };
    const parsed = JSON.parse(raw) as Partial<{ mode: CanvasExportBackground; matteColor: string }>;
    const mode: CanvasExportBackground = parsed.mode === "matte" ? "matte" : "alpha";
    const matteColor: HexColor =
      typeof parsed.matteColor === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.matteColor)
        ? (parsed.matteColor as HexColor)
        : "#ffffff";
    return { mode, matteColor };
  } catch {
    return { mode: "alpha", matteColor: "#ffffff" };
  }
}

function persistCanvasExportBackground(mode: CanvasExportBackground, matteColor: HexColor): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_EXPORT_BG_KEY, JSON.stringify({ mode, matteColor }));
  } catch {
    /* ignore quota / unavailable */
  }
}

function loadImageModel(): ImageModel {
  try {
    const raw = localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
    if (isImageModel(raw)) return raw;
  } catch {}
  return DEFAULT_IMAGE_MODEL;
}

function saveImageModel(model: ImageModel): void {
  try {
    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, model);
  } catch {}
}

function loadReasoningEffort(): ReasoningEffort {
  try {
    const raw = localStorage.getItem(REASONING_EFFORT_STORAGE_KEY);
    if (isReasoningEffort(raw)) return raw;
  } catch {}
  return DEFAULT_REASONING_EFFORT;
}

function saveReasoningEffort(effort: ReasoningEffort): void {
  try {
    localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, effort);
  } catch {}
}

function loadWebSearchEnabled(): boolean {
  try {
    const raw = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
    if (raw === "false") return false;
    if (raw === "true") return true;
  } catch {}
  return DEFAULT_WEB_SEARCH_ENABLED;
}

function saveWebSearchEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(enabled));
  } catch {}
}

function resolveThemePreference(theme: ThemePreference): ResolvedTheme {
  if (theme === "dark" || theme === "light") return theme;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

type PersistedInFlight = {
  id: string;
  prompt: string;
  startedAt: number;
  composerPrompt?: string;
  composerInsertedPrompts?: ComposerInsertedPromptSnapshot[];
  promptBuilderScope?: PromptBuilderScope;
  phase?: string;
  sessionId?: string | null;
  parentNodeId?: string | null;
  clientNodeId?: string | null;
  kind?: "classic" | "node" | "multimode";
};
const INFLIGHT_TTL_MS = 180_000;

// Module-level lock to dedupe concurrent runGenerateNodeInPlace calls for the
// same clientId. Prevents double-fire from rapid clicks before React's
// disabled propagation lands, React 18 StrictMode dev re-invocation, or any
// other path that funnels through runGenerateNodeInPlace twice in one tick.
const nodeGenerationLocks = new Set<string>();

type ServerInFlightJob = {
  requestId: string;
  kind?: string;
  prompt?: string;
  startedAt: number;
  phase?: string;
  meta?: Record<string, unknown>;
};

type ServerTerminalJob = ServerInFlightJob & {
  status?: "completed" | "error" | "canceled";
  finishedAt?: number;
  durationMs?: number;
  httpStatus?: number;
  errorCode?: string;
};

type InflightQueryScope = {
  kind: NonNullable<PersistedInFlight["kind"]>;
  sessionId?: string;
};

function getInflightQueryScopes(state: {
  uiMode: UIMode;
  activeSessionId?: string | null;
  inFlight: PersistedInFlight[];
}): InflightQueryScope[] {
  const scopes: InflightQueryScope[] = state.uiMode === "node"
    ? [{ kind: "node", sessionId: state.activeSessionId ?? undefined }]
    : [{ kind: "classic" }];
  if (state.inFlight.some((job) => job.kind === "multimode")) {
    scopes.push({ kind: "multimode" });
  }
  return scopes;
}

function matchesInflightScope(job: PersistedInFlight, scopes: InflightQueryScope[]): boolean {
  const kind = job.kind ?? "classic";
  return scopes.some((scope) =>
    kind === scope.kind &&
    (scope.kind !== "node" || (job.sessionId ?? null) === (scope.sessionId ?? null)),
  );
}

async function fetchInflightScopes(scopes: InflightQueryScope[]): Promise<{
  jobs: ServerInFlightJob[];
  terminalJobs: ServerTerminalJob[];
}> {
  const responses = await Promise.all(scopes.map((scope) =>
    getInflight({
      kind: scope.kind,
      sessionId: scope.sessionId,
      includeTerminal: true,
    }),
  ));
  return {
    jobs: responses.flatMap((response) => response.jobs),
    terminalJobs: responses.flatMap((response) => response.terminalJobs ?? []) as ServerTerminalJob[],
  };
}

type InsertedPromptPlacement = "before" | "after";

type InsertedPrompt = ComposerInsertedPromptSnapshot;

type InsertedPromptInput = Omit<InsertedPrompt, "placement"> & {
  placement?: InsertedPromptPlacement;
};

export type PromptBuilderModel = ImageModel;

export type PromptBuilderAttachment = PromptBuilderChatAttachment & {
  id: string;
};

export type PromptBuilderMessage = {
  id: string;
  role: PromptBuilderChatMessage["role"];
  content: string;
  createdAt: number;
  model?: PromptBuilderModel;
  attachments?: PromptBuilderAttachment[];
};

const PROMPT_BUILDER_DRAFT_SCOPE_ID = "draft:new";
const MAX_PROMPT_BUILDER_ATTACHMENTS = 6;
const MAX_PROMPT_BUILDER_TEXT_ATTACHMENT_CHARS = 20_000;
const MAX_PROMPT_BUILDER_PERSISTED_SESSIONS = 80;
const MAX_PROMPT_BUILDER_PERSISTED_MESSAGES = 80;
const MAX_PROMPT_BUILDER_MESSAGE_CHARS = 80_000;

export type PromptBuilderScope =
  | { kind: "draft"; id: typeof PROMPT_BUILDER_DRAFT_SCOPE_ID }
  | { kind: "image"; id: string; imageKey: string };

const PROMPT_BUILDER_DRAFT_SCOPE: PromptBuilderScope = {
  kind: "draft",
  id: PROMPT_BUILDER_DRAFT_SCOPE_ID,
};

function normalizePromptBuilderScope(value: unknown): PromptBuilderScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.kind === "draft" && item.id === PROMPT_BUILDER_DRAFT_SCOPE_ID) {
    return PROMPT_BUILDER_DRAFT_SCOPE;
  }
  if (
    item.kind === "image" &&
    typeof item.id === "string" &&
    typeof item.imageKey === "string"
  ) {
    return {
      kind: "image",
      id: item.id,
      imageKey: item.imageKey,
    };
  }
  return undefined;
}

function getPromptBuilderImageKey(item: GenerateItem | null | undefined): string | null {
  return item?.filename ?? item?.url ?? item?.image ?? null;
}

function createPromptBuilderImageScope(item: GenerateItem): PromptBuilderScope {
  const imageKey = getPromptBuilderImageKey(item) ?? `image:${Date.now().toString(36)}`;
  return {
    kind: "image",
    id: `image:${imageKey}`,
    imageKey,
  };
}

function getPromptBuilderSessionMessages(
  sessions: Record<string, PromptBuilderMessage[]>,
  scope: PromptBuilderScope,
): PromptBuilderMessage[] {
  return sessions[scope.id] ?? [];
}

function normalizePromptBuilderAttachment(value: unknown): PromptBuilderAttachment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const kind = item.kind === "image" || item.kind === "text" || item.kind === "file" ? item.kind : null;
  if (!kind) return null;
  return {
    id: typeof item.id === "string" ? item.id : `pba_${Date.now().toString(36)}`,
    kind,
    name: typeof item.name === "string" ? item.name : "attachment",
    mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
    size: typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0,
    dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : undefined,
    text: typeof item.text === "string" ? item.text.slice(0, MAX_PROMPT_BUILDER_TEXT_ATTACHMENT_CHARS) : undefined,
  };
}

function normalizePromptBuilderMessage(value: unknown): PromptBuilderMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const role = item.role === "user" || item.role === "assistant" ? item.role : null;
  if (!role || typeof item.content !== "string") return null;
  const attachments = Array.isArray(item.attachments)
    ? item.attachments.flatMap((attachment) => {
        const normalized = normalizePromptBuilderAttachment(attachment);
        return normalized ? [normalized] : [];
      }).slice(0, MAX_PROMPT_BUILDER_ATTACHMENTS)
    : undefined;
  return {
    id: typeof item.id === "string" ? item.id : `pbm_${Date.now().toString(36)}`,
    role,
    content: item.content.slice(0, MAX_PROMPT_BUILDER_MESSAGE_CHARS),
    createdAt:
      typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
    model: isImageModel(item.model) ? item.model : undefined,
    attachments,
  };
}

function normalizePromptBuilderSessions(value: unknown): Record<string, PromptBuilderMessage[]> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([scopeId]) => scopeId === PROMPT_BUILDER_DRAFT_SCOPE_ID || scopeId.startsWith("image:"))
    .slice(-MAX_PROMPT_BUILDER_PERSISTED_SESSIONS)
    .flatMap(([scopeId, rawMessages]) => {
      if (!Array.isArray(rawMessages)) return [];
      const messages = rawMessages
        .slice(-MAX_PROMPT_BUILDER_PERSISTED_MESSAGES)
        .flatMap((message) => {
          const normalized = normalizePromptBuilderMessage(message);
          return normalized ? [normalized] : [];
        });
      return messages.length > 0 ? [[scopeId, messages] as const] : [];
    });
  return Object.fromEntries(entries);
}

function loadPromptBuilderSessions(): Record<string, PromptBuilderMessage[]> {
  try {
    const raw = localStorage.getItem(PROMPT_BUILDER_SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    return normalizePromptBuilderSessions(JSON.parse(raw));
  } catch {
    return {};
  }
}

function stripPromptBuilderAttachmentPayloads(
  sessions: Record<string, PromptBuilderMessage[]>,
): Record<string, PromptBuilderMessage[]> {
  return Object.fromEntries(
    Object.entries(sessions).map(([scopeId, messages]) => [
      scopeId,
      messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map(({ dataUrl: _dataUrl, text: _text, ...attachment }) => attachment),
      })),
    ]),
  );
}

function persistPromptBuilderSessions(sessions: Record<string, PromptBuilderMessage[]>): void {
  const normalized = normalizePromptBuilderSessions(sessions);
  try {
    localStorage.setItem(PROMPT_BUILDER_SESSIONS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    try {
      localStorage.setItem(
        PROMPT_BUILDER_SESSIONS_STORAGE_KEY,
        JSON.stringify(stripPromptBuilderAttachmentPayloads(normalized)),
      );
    } catch {}
  }
}

function shouldRetainDraftPromptBuilderSession(inFlight: PersistedInFlight[]): boolean {
  return inFlight.some((job) => job.promptBuilderScope?.id === PROMPT_BUILDER_DRAFT_SCOPE.id);
}

function omitPromptBuilderDraftSession(
  sessions: Record<string, PromptBuilderMessage[]>,
): Record<string, PromptBuilderMessage[]> {
  if (!sessions[PROMPT_BUILDER_DRAFT_SCOPE.id]) return sessions;
  const { [PROMPT_BUILDER_DRAFT_SCOPE.id]: _draftMessages, ...rest } = sessions;
  return rest;
}

const initialPromptBuilderSessions = loadPromptBuilderSessions();

function findPromptBuilderScopeImage(state: AppState, scope: PromptBuilderScope): GenerateItem | null {
  if (scope.kind !== "image") return null;
  const currentKey = getPromptBuilderImageKey(state.currentImage);
  if (currentKey === scope.imageKey) return state.currentImage;
  return state.history.find((item) => getPromptBuilderImageKey(item) === scope.imageKey) ?? null;
}

function isPromptBuilderTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(txt|md|markdown|json|csv|tsv|yaml|yml|xml|html|css|js|ts|tsx|jsx)$/i.test(file.name);
}

async function createPromptBuilderAttachment(file: File): Promise<PromptBuilderAttachment> {
  const base = {
    id: `pba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || "attachment",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
  if (file.type.startsWith("image/")) {
    const raw = await readFileAsDataURL(file);
    const dataUrl = await compressImage(raw, 768);
    return { ...base, kind: "image", dataUrl };
  }
  if (isPromptBuilderTextFile(file)) {
    const text = (await file.text()).slice(0, MAX_PROMPT_BUILDER_TEXT_ATTACHMENT_CHARS);
    return { ...base, kind: "text", text };
  }
  return { ...base, kind: "file" };
}

function composePrompt(mainPrompt: string, insertedPrompts: InsertedPrompt[]): string {
  const before = insertedPrompts
    .filter((prompt) => prompt.placement === "before")
    .map((prompt) => prompt.text.trim())
    .filter(Boolean);
  const after = insertedPrompts
    .filter((prompt) => prompt.placement === "after")
    .map((prompt) => prompt.text.trim())
    .filter(Boolean);
  return [
    ...before,
    mainPrompt.trim(),
    ...after,
  ].filter(Boolean).join("\n\n");
}

function createPromptBuilderMessage(
  role: PromptBuilderMessage["role"],
  content: string,
  model?: PromptBuilderModel,
  attachments?: PromptBuilderAttachment[],
): PromptBuilderMessage {
  return {
    id: `pb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    model,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
}

function toPersistedInFlightJob(job: ServerInFlightJob): PersistedInFlight {
  const meta = job.meta ?? {};
  const kind =
    job.kind === "classic" || job.kind === "node" || job.kind === "multimode"
      ? job.kind
      : meta.kind === "classic" || meta.kind === "node" || meta.kind === "multimode"
        ? meta.kind
        : undefined;
  return {
    id: job.requestId,
    prompt: typeof job.prompt === "string" ? job.prompt : "",
    startedAt: job.startedAt,
    phase: typeof job.phase === "string" ? job.phase : undefined,
    sessionId: typeof meta.sessionId === "string" ? meta.sessionId : null,
    parentNodeId: typeof meta.parentNodeId === "string" ? meta.parentNodeId : null,
    clientNodeId: typeof meta.clientNodeId === "string" ? meta.clientNodeId : null,
    kind,
  };
}

function terminalJobError(job: ServerTerminalJob): Error & { code?: string; status?: number } {
  const code = typeof job.errorCode === "string" && job.errorCode
    ? job.errorCode
    : "UNKNOWN";
  const e = new Error(code === "EMPTY_RESPONSE"
    ? "No image data returned from the image backend."
    : "Generation failed on the server.") as Error & { code?: string; status?: number };
  e.code = code;
  e.status = typeof job.httpStatus === "number" ? job.httpStatus : undefined;
  return e;
}

function isCanceledGenerationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const value = err as { code?: unknown; status?: unknown };
  return value.code === "GENERATION_CANCELED" || value.status === 499;
}

function multimodeImageKey(item: GenerateItem): string {
  return item.filename || item.image;
}

function mergeMultimodeImages(current: GenerateItem[], incoming: GenerateItem[]): GenerateItem[] {
  const byKey = new Map(current.map((item) => [multimodeImageKey(item), item] as const));
  for (const item of incoming) byKey.set(multimodeImageKey(item), item);
  return [...byKey.values()].sort((a, b) =>
    (a.sequenceIndex ?? Number.MAX_SAFE_INTEGER) -
    (b.sequenceIndex ?? Number.MAX_SAFE_INTEGER),
  );
}

function removeImageFromMultimodeSequences(
  sequences: Record<string, MultimodeSequenceState>,
  filename: string,
): Record<string, MultimodeSequenceState> {
  let changed = false;
  const next: Record<string, MultimodeSequenceState> = {};
  for (const [id, sequence] of Object.entries(sequences)) {
    const images = sequence.images.filter((image) => image.filename !== filename);
    if (images.length === sequence.images.length) {
      next[id] = sequence;
      continue;
    }
    changed = true;
    if (images.length === 0) {
      continue;
    }
    next[id] = {
      ...sequence,
      images,
      returned: images.length,
      status:
        sequence.status === "complete" && images.length < sequence.requested
          ? "partial"
          : sequence.status,
    };
  }
  return changed ? next : sequences;
}

function loadInFlight(): PersistedInFlight[] {
  try {
    const raw = localStorage.getItem(IN_FLIGHT_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr
      .filter(
        (x) =>
          x && typeof x.id === "string" && typeof x.prompt === "string" &&
          typeof x.startedAt === "number" && now - x.startedAt < INFLIGHT_TTL_MS,
      )
      .map((x) => ({
        id: x.id,
        prompt: x.prompt,
        startedAt: x.startedAt,
        composerPrompt: typeof x.composerPrompt === "string" ? x.composerPrompt : undefined,
        composerInsertedPrompts: normalizeInsertedPromptArray(x.composerInsertedPrompts) ?? undefined,
        promptBuilderScope: normalizePromptBuilderScope(x.promptBuilderScope),
        phase: typeof x.phase === "string" ? x.phase : undefined,
        sessionId: typeof x.sessionId === "string" ? x.sessionId : null,
        parentNodeId: typeof x.parentNodeId === "string" ? x.parentNodeId : null,
        clientNodeId: typeof x.clientNodeId === "string" ? x.clientNodeId : null,
        kind: x.kind === "classic" || x.kind === "node" || x.kind === "multimode" ? x.kind : undefined,
      }));
  } catch {
    return [];
  }
}

function saveInFlight(list: PersistedInFlight[]): void {
  try {
    localStorage.setItem(IN_FLIGHT_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // Quota exceeded or storage disabled. Notify the user once per tab.
    const w = window as unknown as { __ima2QuotaWarned?: boolean };
    if (!w.__ima2QuotaWarned) {
      w.__ima2QuotaWarned = true;
      console.warn("[ima2] localStorage write failed:", err);
      try {
        useAppStore.getState().showToast(t("toast.localStorageFull"), true);
      } catch {}
    }
  }
}

function loadSelectedFilename(): string | null {
  try {
    const raw = localStorage.getItem(SELECTED_FILENAME_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveSelectedFilename(filename: string | null): void {
  try {
    if (filename) localStorage.setItem(SELECTED_FILENAME_STORAGE_KEY, filename);
    else localStorage.removeItem(SELECTED_FILENAME_STORAGE_KEY);
  } catch {}
}

function loadActiveSessionId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_ID_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveActiveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_ID_STORAGE_KEY);
  } catch {}
}

const HISTORY_LIMIT = 120;
const MAX_REFERENCE_IMAGES = 5;

type GraphSaveReason =
  | "debounced"
  | "manual"
  | "switch-session"
  | "recovery"
  | "beforeunload"
  | "queued"
  | "edge-disconnect"
  | "node-complete";
type GraphSaveResult = "saved" | "skipped" | "conflict" | "failed";

function narrowGenerateKind(k?: string | null): GenerateItem["kind"] {
  return k === "classic" || k === "edit" || k === "generate" ||
    k === "card-news-card" || k === "card-news-set" ? k : null;
}

function mapHistoryItem(it: Awaited<ReturnType<typeof getHistory>>["items"][number]): GenerateItem {
  return {
    image: it.url,
    url: it.url,
    filename: it.filename,
    thumb: it.url,
    prompt: it.prompt ?? undefined,
    userPrompt: it.userPrompt ?? null,
    revisedPrompt: it.revisedPrompt ?? null,
    promptMode: it.promptMode ?? null,
    composerPrompt: it.composerPrompt ?? null,
    composerInsertedPrompts: normalizeInsertedPromptArray(it.composerInsertedPrompts) ?? null,
    size: it.size ?? undefined,
    quality: it.quality ?? undefined,
    format: it.format as Format | undefined,
    model: it.model ?? undefined,
    provider: it.provider,
    usage: (it.usage as GenerateItem["usage"]) ?? undefined,
    createdAt: it.createdAt,
    sessionId: it.sessionId ?? null,
    nodeId: it.nodeId ?? null,
    clientNodeId: it.clientNodeId ?? null,
    requestId: it.requestId ?? null,
    kind: narrowGenerateKind(it.kind),
    canvasVersion: Boolean(it.canvasVersion),
    canvasSourceFilename: it.canvasSourceFilename ?? null,
    canvasEditableFilename: it.canvasEditableFilename ?? null,
    canvasMergedAt: it.canvasMergedAt ?? undefined,
    setId: it.setId ?? null,
    cardId: it.cardId ?? null,
    cardOrder: it.cardOrder ?? null,
    headline: it.headline ?? null,
    body: it.body ?? null,
    cards: it.cards,
    refsCount: it.refsCount ?? 0,
    isFavorite: it.isFavorite ?? false,
    sequenceId: it.sequenceId ?? null,
    sequenceIndex: it.sequenceIndex ?? null,
    sequenceTotalRequested: it.sequenceTotalRequested ?? null,
    sequenceTotalReturned: it.sequenceTotalReturned ?? null,
    sequenceStatus: it.sequenceStatus ?? null,
  };
}

function historyKey(item: Pick<GenerateItem, "filename" | "image">): string {
  return item.filename ?? item.image;
}

function withoutHistoryDuplicate(
  history: GenerateItem[],
  item: Pick<GenerateItem, "filename" | "image">,
): GenerateItem[] {
  const key = historyKey(item);
  return history.filter((existing) => historyKey(existing) !== key);
}

function findHistoryDuplicate(
  history: GenerateItem[],
  item: Pick<GenerateItem, "filename" | "image">,
): GenerateItem | undefined {
  const key = historyKey(item);
  return history.find((existing) => historyKey(existing) === key);
}

function preserveHistoryMetadata(incoming: GenerateItem, existing?: GenerateItem): GenerateItem {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    createdAt: incoming.createdAt ?? existing.createdAt,
    requestId: incoming.requestId ?? existing.requestId,
    sessionId: incoming.sessionId ?? existing.sessionId,
    kind: incoming.kind ?? existing.kind,
    refsCount: incoming.refsCount ?? existing.refsCount,
    isFavorite: incoming.isFavorite ?? existing.isFavorite,
  };
}

function mergeHistoryItems(current: GenerateItem[], incoming: GenerateItem[]): GenerateItem[] {
  const byKey = new Map(current.map((item) => [historyKey(item), item]));
  for (const item of incoming) byKey.set(historyKey(item), item);
  return [
    ...current.map((item) => byKey.get(historyKey(item)) ?? item),
    ...incoming.filter((item) => !current.some((h) => historyKey(h) === historyKey(item))),
  ];
}

function retainHistoryItems(items: GenerateItem[], limit: number): GenerateItem[] {
  return items.slice(0, Math.max(HISTORY_LIMIT, limit));
}

function stripDataUrlPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

async function compressReferenceSource(src: string, filename = "reference.png"): Promise<string> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`reference fetch failed: ${resp.status}`);
  const blob = await resp.blob();
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  return compressToBase64(file, {
    // Generated PNGs can exceed the server's base64 reference cap. For i2i
    // references, a flattened JPEG is the intended upload format.
    preserveTransparency: false,
  });
}

export type ImageNodeStatus =
  | "empty"
  | "pending"
  | "reconciling"
  | "ready"
  | "stale"
  | "asset-missing"
  | "error";

export type ImageNodeData = {
  clientId: ClientNodeId;
  serverNodeId: string | null;
  parentServerNodeId: string | null;
  prompt: string;
  imageUrl: string | null;
  status: ImageNodeStatus;
  pendingRequestId: string | null;
  recoveryRequestId?: string | null;
  pendingPhase?: string | null;
  pendingStartedAt?: number | null;
  partialImageUrl?: string | null;
  error?: string;
  elapsed?: number;
  webSearchCalls?: number;
  model?: string | null;
  size?: string | null;
  referenceImages?: string[];
};

export type GraphNode = FlowNode<ImageNodeData>;
export type GraphEdge = FlowEdge;

const DEFAULT_CHILD_SOURCE_HANDLE = "source-right";
const DEFAULT_CHILD_TARGET_HANDLE = "target-left";

function newGraphEdgeId(
  sourceClientId: ClientNodeId,
  targetClientId: ClientNodeId,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): string {
  const sourceAnchor = sourceHandle ?? "auto";
  const targetAnchor = targetHandle ?? "auto";
  return `${sourceClientId}:${sourceAnchor}->${targetClientId}:${targetAnchor}`;
}

function normalizeNodeHandleId(
  handleId: string | null | undefined,
  type: "source" | "target",
): string | null {
  if (!handleId) return null;
  return handleId.startsWith(`${type}-`) ? handleId : null;
}

function getOppositeTargetHandle(sourceHandle?: string | null): string | null {
  switch (sourceHandle) {
    case "source-top":
      return "target-bottom";
    case "source-right":
      return "target-left";
    case "source-bottom":
      return "target-top";
    case "source-left":
      return "target-right";
    default:
      return null;
  }
}

function mapSessionToGraph(session: SessionFull): {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphVersion: number;
} {
  const graphNodes: GraphNode[] = session.nodes.map((n) => {
    const d = (n.data ?? {}) as Partial<ImageNodeData>;
    const explicitImageUrl =
      typeof d.imageUrl === "string" && d.imageUrl.length > 0 ? d.imageUrl : null;
    const fallbackImageUrl =
      typeof d.serverNodeId === "string" && d.serverNodeId.length > 0
        ? `/generated/${d.serverNodeId}.png`
        : null;
    const imageUrl = explicitImageUrl ?? fallbackImageUrl;
    const data: ImageNodeData = {
      clientId: n.id as ClientNodeId,
      serverNodeId: (d.serverNodeId ?? null) as string | null,
      parentServerNodeId: (d.parentServerNodeId ?? null) as string | null,
      prompt: typeof d.prompt === "string" ? d.prompt : "",
      imageUrl,
      status: (d.status ?? (imageUrl ? "ready" : "empty")) as ImageNodeStatus,
      pendingRequestId: (d.pendingRequestId ?? null) as string | null,
      recoveryRequestId: (d.recoveryRequestId ?? null) as string | null,
      pendingPhase: (d.pendingPhase ?? null) as string | null,
      pendingStartedAt:
        typeof d.pendingStartedAt === "number" ? d.pendingStartedAt : null,
      partialImageUrl: null,
      error: d.error as string | undefined,
      elapsed: d.elapsed as number | undefined,
      webSearchCalls: d.webSearchCalls as number | undefined,
      model: (d.model ?? null) as string | null,
      size: (d.size ?? null) as string | null,
      referenceImages: loadNodeRefs(session.id, n.id),
    };
    return {
      id: n.id,
      type: "imageNode",
      position: { x: n.x, y: n.y },
      data,
    };
  });
  const graphEdges: GraphEdge[] = session.edges.map((e) => {
    const data = (e.data ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: typeof data.sourceHandle === "string" ? data.sourceHandle : null,
      targetHandle: typeof data.targetHandle === "string" ? data.targetHandle : null,
    };
  });
  return {
    graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
    graphEdges,
    graphVersion: session.graphVersion,
  };
}

type ToastEntry = { message: string; error: boolean; id: number; createdAt: number };
type ToastState = ToastEntry | null;
type ErrorCardEntry = { code: ImaErrorCode; fallbackMessage?: string; id: number; createdAt: number };
export type ComposeSheetTab = "prompt" | "controls" | "library";
type TrashPendingState = {
  filename: string;
  trashId: string;
  item: GenerateItem;
  expiresAt: number;
} | null;

type CustomSizeConfirmState = {
  requestedW: number;
  requestedH: number;
  adjustedW: number;
  adjustedH: number;
  reasons: CustomSizeAdjustmentReason[];
  continuation:
    | { kind: "classic" }
    | { kind: "multimode" }
    | { kind: "node"; clientId: ClientNodeId }
    | { kind: "node-in-place"; clientId: ClientNodeId }
    | { kind: "node-variation"; clientId: ClientNodeId };
} | null;

type MetadataRestoreState = {
  filename: string;
  image: string;
  metadata: EmbeddedGenerationMetadata;
  source: "xmp" | "png-comment" | string;
  targetNodeId?: ClientNodeId | null;
} | null;

export type MultimodeSequenceState = {
  sequenceId: string;
  requestId: string;
  requested: number;
  returned: number;
  images: GenerateItem[];
  partials: Array<{ image: string; index?: number | null }>;
  status: MultimodeSequenceStatus;
  elapsed?: string;
  error?: string | null;
};

type AppState = {
  provider: Provider;
  quality: Quality;
  sizePreset: SizePreset;
  customW: number;
  customH: number;
  format: Format;
  moderation: Moderation;
  imageModel: ImageModel;
  reasoningEffort: ReasoningEffort;
  webSearchEnabled: boolean;
  count: Count;
  multimode: boolean;
  multimodeMaxImages: Count;
  multimodeSequences: Record<string, MultimodeSequenceState>;
  multimodeAbortControllers: Record<string, AbortController>;
  multimodePreviewFlightId: string | null;
  promptMode: "auto" | "direct";
  prompt: string;
  referenceImages: string[];
  canvasReferenceImage: string | null;
  addReferences: (files: File[]) => Promise<void>;
  addReferenceDataUrl: (dataUrl: string) => void;
  removeReference: (index: number) => void;
  clearReferences: () => void;
  useCurrentAsReference: () => Promise<void>;
  useImageAsReference: (item: GenerateItem) => Promise<void>;
  attachCanvasVersionReference: (item: GenerateItem) => Promise<void>;
  activeGenerations: number;
  unseenGeneratedCount: number;
  inFlight: PersistedInFlight[];
  cancelInFlightJob: (requestId: string) => Promise<void>;
  showInFlightJob: (requestId: string) => void;
  startInFlightPolling: () => void;
  reconcileInflight: () => Promise<void>;
  reconcileGraphPending: () => Promise<void>;
  syncFromStorage: () => void;
  currentImage: GenerateItem | null;
  applyMergedCanvasImage: (item: GenerateItem) => void;
  addGeneratedHistoryItem: (item: GenerateItem) => Promise<void>;
  history: GenerateItem[];
  historyNextCursor: HistoryCursor | null;
  historyLoadingOlder: boolean;
  favoriteHistoryNextCursor: HistoryCursor | null;
  favoriteHistoryLoadingOlder: boolean;
  loadedHistoryRetainLimit: number;
  loadOlderHistory: () => Promise<void>;
  loadFavoriteHistory: () => Promise<void>;
  loadOlderFavoriteHistory: () => Promise<void>;
  trashPending: TrashPendingState;
  toast: ToastState;
  toastLog: ToastEntry[];
  customSizeConfirm: CustomSizeConfirmState;
  metadataRestore: MetadataRestoreState;
  readDroppedImageMetadata: (file: File, targetNodeId?: ClientNodeId | null) => Promise<boolean>;
  applyMetadataRestore: () => void;
  cancelMetadataRestore: () => void;
  addMetadataRestoreAsReference: () => void;
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  composeSheetOpen: boolean;
  composeSheetTab: ComposeSheetTab;
  openComposeSheet: (tab?: ComposeSheetTab) => void;
  setComposeSheetTab: (tab: ComposeSheetTab) => void;
  closeComposeSheet: () => void;
  galleryOpen: boolean;
  openGallery: () => void;
  closeGallery: () => void;
  galleryScope: GalleryScope;
  galleryDefaultScope: GalleryScope;
  setGalleryScope: (scope: GalleryScope) => void;
  setGalleryDefaultScope: (scope: GalleryScope) => void;

  settingsOpen: boolean;
  activeSettingsSection: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  setActiveSettingsSection: (section: SettingsSection) => void;

  uiMode: UIMode;
  setUIMode: (m: UIMode) => void;

  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  themeFamily: ThemeFamily;
  historyStripLayout: HistoryStripLayout;
  setTheme: (theme: ThemePreference) => void;
  setThemeFamily: (family: ThemeFamily) => void;
  setHistoryStripLayout: (layout: HistoryStripLayout) => void;
  syncThemeFromStorage: () => void;
  syncThemeFamilyFromStorage: () => void;
  refreshResolvedTheme: () => void;

  locale: Locale;
  setLocale: (l: Locale) => void;

  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  setGraphNodes: (n: GraphNode[]) => void;
  setGraphEdges: (e: GraphEdge[]) => void;
  nodeSelectionMode: boolean;
  nodeBatchRunning: boolean;
  nodeBatchStopping: boolean;
  toggleNodeSelectionMode: () => void;
  selectAllGraphNodes: () => void;
  selectNodeGraph: (clientId: ClientNodeId, additive: boolean) => void;
  clearNodeSelection: () => void;
  runNodeBatch: (mode: NodeBatchMode) => Promise<void>;
  cancelNodeBatch: () => void;
  addRootNode: () => ClientNodeId;
  addChildNode: (parentClientId: ClientNodeId) => ClientNodeId;
  addSiblingNode: (sourceClientId: ClientNodeId) => ClientNodeId;
  duplicateBranchRoot: (sourceClientId: ClientNodeId) => ClientNodeId;
  addChildNodeAt: (
    parentClientId: ClientNodeId,
    position: { x: number; y: number },
    sourceHandle?: string | null,
  ) => ClientNodeId;
  connectNodes: (
    sourceClientId: ClientNodeId,
    targetClientId: ClientNodeId,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void;
  updateNodePrompt: (clientId: ClientNodeId, prompt: string) => void;
  addNodeReferences: (clientId: ClientNodeId, files: File[]) => Promise<void>;
  addNodeReferenceDataUrl: (clientId: ClientNodeId, dataUrl: string) => void;
  removeNodeReference: (clientId: ClientNodeId, index: number) => void;
  clearNodeReferences: (clientId: ClientNodeId) => void;
  generateNode: (clientId: ClientNodeId) => Promise<void>;
  generateNodeInPlace: (clientId: ClientNodeId) => Promise<void>;
  generateNodeVariation: (clientId: ClientNodeId, sizeOverride?: string) => Promise<void>;
  runGenerateNode: (clientId: ClientNodeId, sizeOverride?: string) => Promise<void>;
  runGenerateNodeInPlace: (
    clientId: ClientNodeId,
    options?: {
      sizeOverride?: string;
      parentServerNodeIdOverride?: string | null;
      suppressToast?: boolean;
    },
  ) => Promise<string | null>;
  deleteNode: (clientId: ClientNodeId) => void;
  deleteNodes: (clientIds: ClientNodeId[]) => void;
  disconnectEdge: (edgeId: string) => void;
  disconnectEdges: (edgeIds: string[]) => void;

  // Sessions (0.06)
  sessions: SessionSummary[];
  activeSessionId: string | null;
  activeSessionGraphVersion: number | null;
  sessionLoading: boolean;
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  createAndSwitchSession: (title?: string) => Promise<void>;
  renameCurrentSession: (title: string) => Promise<void>;
  deleteSessionById: (id: string) => Promise<void>;
  scheduleGraphSave: () => void;
  flushGraphSave: (reason?: GraphSaveReason) => Promise<void>;

  setProvider: (p: Provider) => void;
  setQuality: (q: Quality) => void;
  setSizePreset: (s: SizePreset) => void;
  setCustomSize: (w: number, h: number) => void;
  setFormat: (f: Format) => void;
  setModeration: (m: Moderation) => void;
  setImageModel: (m: ImageModel) => void;
  setReasoningEffort: (e: ReasoningEffort) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setCount: (c: Count) => void;
  setMultimode: (enabled: boolean) => void;
  setMultimodeMaxImages: (c: Count) => void;
  generateMultimode: (sizeOverride?: string) => Promise<void>;
  cancelMultimode: () => void;
  setPromptMode: (m: "auto" | "direct") => void;
  setPrompt: (p: string) => void;
  insertedPrompts: InsertedPrompt[];
  insertPromptToComposer: (prompt: InsertedPromptInput) => void;
  removeInsertedPromptFromComposer: (id: string) => void;
  moveInsertedPromptInComposer: (id: string, direction: "up" | "down") => void;
  setInsertedPromptPlacement: (id: string, placement: InsertedPromptPlacement) => void;
  clearInsertedPrompts: () => void;
  promptBuilderMessages: PromptBuilderMessage[];
  promptBuilderSessions: Record<string, PromptBuilderMessage[]>;
  promptBuilderScope: PromptBuilderScope;
  promptBuilderDraft: string;
  promptBuilderModel: PromptBuilderModel;
  promptBuilderLoading: boolean;
  promptBuilderAttachments: PromptBuilderAttachment[];
  startNewImageSession: () => void;
  activatePromptBuilderForImage: (item: GenerateItem) => void;
  clearPromptBuilderImageScope: () => void;
  setPromptBuilderDraft: (draft: string) => void;
  setPromptBuilderModel: (model: PromptBuilderModel) => void;
  addPromptBuilderAttachments: (files: File[]) => Promise<void>;
  removePromptBuilderAttachment: (id: string) => void;
  clearPromptBuilderAttachments: () => void;
  sendPromptBuilderMessage: (content?: string) => Promise<void>;
  applyPromptBuilderMessageToPrompt: (messageId: string) => void;
  insertPromptBuilderMessageAsBlock: (messageId: string) => void;
  clearPromptBuilderMessages: () => void;
  selectHistory: (item: GenerateItem) => void;
  showHistorySequence: (sequenceId: string) => void;
  markGeneratedResultsSeen: () => void;
  selectHistoryShortcutTarget: (action: GalleryShortcutAction) => void;
  trashHistoryItem: (item: GenerateItem) => Promise<void>;
  trashHistorySequence: (sequenceId: string) => Promise<void>;
  restorePendingTrash: () => Promise<void>;
  clearPendingTrash: () => void;
  permanentlyDeleteHistoryItemByClick: (item: GenerateItem) => Promise<void>;
  permanentlyDeleteHistoryItemByShortcut: (item: GenerateItem) => Promise<void>;
  removeFromHistory: (filename: string) => void;
  addHistoryItem: (item: GenerateItem) => void;
  importLocalImageToHistory: (file: File) => Promise<GenerateItem | null>;
  generate: () => Promise<void>;
  runGenerate: (sizeOverride?: string) => Promise<void>;
  confirmCustomSizeAdjustment: () => Promise<void>;
  cancelCustomSizeAdjustment: () => void;
  hydrateHistory: () => void;
  showToast: (message: string, error?: boolean) => void;
  dismissToast: (id: number) => void;
  errorCard: ErrorCardEntry | null;
  errorCardLog: ErrorCardEntry[];
  showErrorCard: (code: ImaErrorCode, params?: { fallbackMessage?: string }) => void;
  dismissErrorCard: (id?: number) => void;
  getResolvedSize: () => string;

  // Prompt Library (0.23)
  promptLibraryOpen: boolean;
  togglePromptLibrary: () => void;
  setPromptLibraryOpen: (open: boolean) => void;
  promptLibrary: { prompts: import("../lib/api").PromptItem[]; folders: import("../lib/api").PromptFolder[] };
  promptLibraryLoading: boolean;
  loadPromptLibrary: () => Promise<void>;
  savePromptToLibrary: (payload: { name?: string; text: string; tags?: string[]; folderId?: string; mode?: "auto" | "direct" }) => Promise<void>;
  deletePromptFromLibrary: (id: string) => Promise<void>;
  togglePromptFavorite: (id: string) => Promise<void>;
  importPromptsToLibrary: (files: File[]) => Promise<void>;
  galleryFavorites: Set<string>;
  toggleGalleryFavorite: (filename: string) => Promise<void>;
  browserId: string;

  // Canvas Mode (0.24)
  canvasOpen: boolean;
  canvasZoom: number;
  canvasPanX: number;
  canvasPanY: number;
  canvasExportBackground: CanvasExportBackground;
  canvasExportMatteColor: HexColor;
  openCanvas: () => void;
  closeCanvas: () => void;
  setCanvasZoom: (zoom: number) => void;
  resetCanvasZoom: () => void;
  setCanvasPan: (x: number, y: number) => void;
  resetCanvasPan: () => void;
  setCanvasExportBackground: (mode: CanvasExportBackground) => void;
  setCanvasExportMatteColor: (color: HexColor) => void;
};

function formatSize(w: number, h: number): string {
  return `${w}x${h}`;
}

function normalizeCount(value: number): Count {
  return Math.min(8, Math.max(1, Math.trunc(value || 1)));
}

const SIZE_PRESET_VALUES = new Set<SizePreset>([
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1360x1024",
  "1024x1360",
  "1824x1024",
  "1024x1824",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "3840x2160",
  "2160x3840",
  "auto",
  "custom",
]);

function parseMetadataSize(size?: string | null): { preset?: SizePreset; w?: number; h?: number } {
  if (typeof size !== "string") return {};
  if (SIZE_PRESET_VALUES.has(size as SizePreset)) return { preset: size as SizePreset };
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return {};
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return {};
  return { preset: "custom", w, h };
}

function isQuality(value: unknown): value is Quality {
  return value === "low" || value === "medium" || value === "high";
}

function isFormat(value: unknown): value is Format {
  return value === "png" || value === "jpeg" || value === "webp";
}

function isModeration(value: unknown): value is Moderation {
  return value === "low" || value === "auto";
}

function isProvider(value: unknown): value is Provider {
  return value === "oauth" || value === "api";
}

function isPromptMode(value: unknown): value is "auto" | "direct" {
  return value === "auto" || value === "direct";
}

function isSizePreset(value: unknown): value is SizePreset {
  return typeof value === "string" && SIZE_PRESET_VALUES.has(value as SizePreset);
}

function normalizeInsertedPrompt(value: unknown): InsertedPrompt | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.text !== "string"
  ) {
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    text: item.text,
    placement: item.placement === "after" ? "after" : "before",
  };
}

function normalizeInsertedPromptArray(value: unknown): InsertedPrompt[] | null {
  if (!Array.isArray(value)) return null;
  const prompts = value.map(normalizeInsertedPrompt);
  return prompts.every((item): item is InsertedPrompt => item !== null) ? prompts : null;
}

function cloneInsertedPrompts(prompts: InsertedPrompt[]): InsertedPrompt[] {
  return prompts.map((prompt) => ({ ...prompt }));
}

function getHistoryComposerPrompt(item: GenerateItem): string {
  if (typeof item.composerPrompt === "string") return item.composerPrompt;
  return item.userPrompt ?? item.prompt ?? "";
}

type GenerationDefaults = Partial<{
  provider: Provider;
  quality: Quality;
  sizePreset: SizePreset;
  customW: number;
  customH: number;
  format: Format;
  moderation: Moderation;
  count: Count;
  multimode: boolean;
  multimodeMaxImages: Count;
  promptMode: "auto" | "direct";
  prompt: string;
  insertedPrompts: InsertedPrompt[];
}>;

function loadGenerationDefaults(): GenerationDefaults {
  try {
    const raw = localStorage.getItem(GENERATION_DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: GenerationDefaults = {};
    if (isProvider(parsed.provider)) out.provider = parsed.provider;
    if (isQuality(parsed.quality)) out.quality = parsed.quality;
    if (isSizePreset(parsed.sizePreset)) out.sizePreset = parsed.sizePreset;
    if (typeof parsed.customW === "number" && Number.isFinite(parsed.customW)) {
      out.customW = parseRequestedCustomSide(parsed.customW, 1920);
    }
    if (typeof parsed.customH === "number" && Number.isFinite(parsed.customH)) {
      out.customH = parseRequestedCustomSide(parsed.customH, 1088);
    }
    if (isFormat(parsed.format)) out.format = parsed.format;
    if (isModeration(parsed.moderation)) out.moderation = parsed.moderation;
    if (typeof parsed.count === "number") out.count = normalizeCount(parsed.count);
    if (typeof parsed.multimode === "boolean") out.multimode = parsed.multimode;
    if (typeof parsed.multimodeMaxImages === "number") {
      out.multimodeMaxImages = normalizeCount(parsed.multimodeMaxImages);
    }
    if (isPromptMode(parsed.promptMode)) out.promptMode = parsed.promptMode;
    if (typeof parsed.prompt === "string") out.prompt = parsed.prompt;
    const insertedPrompts = normalizeInsertedPromptArray(parsed.insertedPrompts);
    if (insertedPrompts) {
      out.insertedPrompts = insertedPrompts;
    }
    return out;
  } catch {
    return {};
  }
}

function saveGenerationDefaultsPatch(patch: GenerationDefaults): void {
  try {
    const current = loadGenerationDefaults();
    localStorage.setItem(
      GENERATION_DEFAULTS_STORAGE_KEY,
      JSON.stringify({ ...current, ...patch }),
    );
  } catch {}
}

function applyMetadataToState(
  state: AppState,
  metadata: EmbeddedGenerationMetadata,
): Partial<AppState> {
  const patch: Partial<AppState> = {};
  const prompt = metadata.userPrompt || metadata.prompt;
  if (typeof prompt === "string") patch.prompt = prompt;
  if (isQuality(metadata.quality)) patch.quality = metadata.quality;
  if (isFormat(metadata.format)) patch.format = metadata.format;
  if (isModeration(metadata.moderation)) patch.moderation = metadata.moderation;
  if (metadata.promptMode === "auto" || metadata.promptMode === "direct") {
    patch.promptMode = metadata.promptMode;
  }
  if (metadata.model && isImageModel(metadata.model)) {
    patch.imageModel = metadata.model;
  }
  const size = parseMetadataSize(metadata.size);
  if (size.preset) patch.sizePreset = size.preset;
  if (size.preset === "custom" && size.w && size.h) {
    patch.customW = parseRequestedCustomSide(size.w, state.customW);
    patch.customH = parseRequestedCustomSide(size.h, state.customH);
  }
  return patch;
}

function getCustomSizeConfirmation(
  state: AppState,
  continuation: NonNullable<CustomSizeConfirmState>["continuation"],
): CustomSizeConfirmState {
  if (state.sizePreset !== "custom") return null;
  const result = normalizeCustomSizePairDetailed(
    state.customW,
    state.customH,
    state.customW,
    state.customH,
  );
  if (!result.adjusted) return null;
  return {
    requestedW: result.requestedW,
    requestedH: result.requestedH,
    adjustedW: result.w,
    adjustedH: result.h,
    reasons: result.reasons,
    continuation,
  };
}

const storedGenerationDefaults = loadGenerationDefaults();

export const useAppStore = create<AppState>((set, get) => ({
  provider: storedGenerationDefaults.provider ?? "oauth",
  quality: storedGenerationDefaults.quality ?? "medium",
  sizePreset: storedGenerationDefaults.sizePreset ?? "1024x1024",
  customW: storedGenerationDefaults.customW ?? 1920,
  customH: storedGenerationDefaults.customH ?? 1088,
  format: storedGenerationDefaults.format ?? "png",
  moderation: storedGenerationDefaults.moderation ?? "low",
  count: storedGenerationDefaults.count ?? 1,
  multimode: storedGenerationDefaults.multimode ?? false,
  multimodeMaxImages: storedGenerationDefaults.multimodeMaxImages ?? 4,
  multimodeSequences: {},
  multimodeAbortControllers: {},
  multimodePreviewFlightId: null,
  promptMode: storedGenerationDefaults.promptMode ?? "auto",
  prompt: "",
  insertedPrompts: [],
  promptBuilderMessages: [],
  promptBuilderSessions: initialPromptBuilderSessions,
  promptBuilderScope: PROMPT_BUILDER_DRAFT_SCOPE,
  promptBuilderDraft: "",
  promptBuilderModel: "gpt-5.5",
  promptBuilderLoading: false,
  promptBuilderAttachments: [],
  referenceImages: [],
  canvasReferenceImage: null,

  // Prompt Library state (0.23)
  promptLibraryOpen: false,
  promptLibrary: { prompts: [], folders: [] },
  promptLibraryLoading: false,
  galleryFavorites: new Set(),
  browserId: getBrowserId(),

  // Canvas Mode state (0.24)
  canvasOpen: false,
  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,
  canvasExportBackground: loadCanvasExportBackground().mode,
  canvasExportMatteColor: loadCanvasExportBackground().matteColor,

  addReferences: async (files) => {
    const allowed = MAX_REFERENCE_IMAGES - get().referenceImages.length;
    const toAdd = files.slice(0, Math.max(0, allowed));
    const heicSkipped = toAdd.filter(isHeic);
    const usable = toAdd.filter((f) => !isHeic(f));
    const results = await Promise.all(
      usable.map(async (f) => {
        try {
          return await compressToBase64(f, {
            preserveTransparency: hasAlphaChannel(f),
          });
        } catch (err) {
          console.warn("[addReferences] compress failed", err);
          return null;
        }
      }),
    );
    const valid = results.filter((x): x is string => !!x);
    set((s) => ({
      referenceImages: [...s.referenceImages, ...valid].slice(0, MAX_REFERENCE_IMAGES),
    }));
    if (heicSkipped.length > 0) {
      get().showToast(t("toast.refHeicUnsupported"), true);
    }
    const failedCount = usable.length - valid.length;
    if (failedCount > 0) {
      get().showToast(t("toast.refTooLarge"), true);
    }
    if (files.length > allowed) {
      get().showToast(t("toast.refLimitExceeded"), true);
    }
  },
  addReferenceDataUrl: (dataUrl) => {
    set((s) =>
      s.referenceImages.length >= MAX_REFERENCE_IMAGES
        ? s
        : { referenceImages: [...s.referenceImages, dataUrl] },
    );
  },
  metadataRestore: null,
  readDroppedImageMetadata: async (file, targetNodeId = null) => {
    if (!file.type.startsWith("image/")) return false;
    let dataUrl = "";
    try {
      dataUrl = await readFileAsDataURL(file);
      const result = await readImageMetadata({ filename: file.name, dataUrl });
      if (!result.metadata) return false;
      set({
        metadataRestore: {
          filename: file.name,
          image: dataUrl,
          metadata: result.metadata,
          source: result.source ?? "xmp",
          targetNodeId,
        },
      });
      return true;
    } catch {
      get().showToast(t("metadata.readFailed"), true);
      return false;
    }
  },
  applyMetadataRestore: () => {
    const pending = get().metadataRestore;
    if (!pending) return;
    const patch = applyMetadataToState(get(), pending.metadata);
    if (patch.imageModel) saveImageModel(patch.imageModel);
    if (pending.targetNodeId && typeof patch.prompt === "string") {
      const prompt = patch.prompt;
      set({
        ...patch,
        metadataRestore: null,
        graphNodes: get().graphNodes.map((n) =>
          n.id === pending.targetNodeId
            ? { ...n, data: { ...n.data, prompt } }
            : n,
        ),
      });
      get().scheduleGraphSave();
    } else {
      set({ ...patch, metadataRestore: null });
    }
    get().showToast(t("metadata.applied"));
  },
  cancelMetadataRestore: () => set({ metadataRestore: null }),
  addMetadataRestoreAsReference: () => {
    const pending = get().metadataRestore;
    if (!pending) return;
    if (pending.targetNodeId) {
      get().addNodeReferenceDataUrl(pending.targetNodeId, pending.image);
    } else {
      get().addReferenceDataUrl(pending.image);
    }
    set({ metadataRestore: null });
  },
  removeReference: (index) => {
    set((s) => ({
      referenceImages: s.referenceImages.filter((_, i) => i !== index),
      canvasReferenceImage:
        s.referenceImages[index] === s.canvasReferenceImage ? null : s.canvasReferenceImage,
    }));
  },
  clearReferences: () => set({ referenceImages: [], canvasReferenceImage: null }),
  attachCanvasVersionReference: async (item) => {
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(
        item.image,
        item.filename || "canvas-version-reference.png",
      );
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      throw new Error("canvas_reference_attach_failed");
    }
    set((s) => {
      const withoutPrevious = s.canvasReferenceImage
        ? s.referenceImages.filter((ref) => ref !== s.canvasReferenceImage)
        : s.referenceImages;
      const withoutDuplicate = withoutPrevious.filter((ref) => ref !== dataUrl);
      return {
        canvasReferenceImage: dataUrl,
        referenceImages: [dataUrl, ...withoutDuplicate].slice(0, MAX_REFERENCE_IMAGES),
      };
    });
    get().showToast(t("canvas.version.usingAsReference"));
  },
  useCurrentAsReference: async () => {
    const cur = get().currentImage;
    if (!cur) {
      get().showToast(t("toast.noCurrentImageForRef"), true);
      return;
    }
    if (get().referenceImages.length >= MAX_REFERENCE_IMAGES) {
      get().showToast(t("toast.refSlotFull"), true);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(cur.image, cur.filename || "current-reference.png");
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      return;
    }
    set((s) => ({
      referenceImages: [...s.referenceImages, dataUrl].slice(0, MAX_REFERENCE_IMAGES),
    }));
    get().showToast(t("toast.addedCurrentAsRef"));
  },
  useImageAsReference: async (item) => {
    if (get().referenceImages.length >= MAX_REFERENCE_IMAGES) {
      get().showToast(t("toast.refSlotFull"), true);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(item.image, item.filename || "canvas-reference.png");
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      return;
    }
    set((s) => ({
      referenceImages: [...s.referenceImages, dataUrl].slice(0, MAX_REFERENCE_IMAGES),
    }));
    get().showToast(t("toast.addedCurrentAsRef"));
  },
  activeGenerations: 0,
  unseenGeneratedCount: 0,
  inFlight: [],
  cancelInFlightJob: async (requestId) => {
    if (!requestId) return;
    set((s) => {
      const next = s.inFlight.map((job) =>
        job.id === requestId ? { ...job, phase: "canceling" } : job,
      );
      saveInFlight(next);
      return { inFlight: next };
    });
    try {
      await cancelInflight(requestId);
      get().startInFlightPolling();
    } catch {
      get().showToast(t("toast.cancelFailed"), true);
    }
  },
  showInFlightJob: (requestId) => {
    const state = get();
    const job = state.inFlight.find((item) => item.id === requestId);
    if (!job) return;
    if (job.kind === "node") return;
    if (job.kind === "multimode" && state.multimodeSequences[requestId]) {
      set({
        multimodePreviewFlightId: requestId,
        canvasOpen: false,
      });
      return;
    }
    const scope = job.promptBuilderScope ?? PROMPT_BUILDER_DRAFT_SCOPE;
    const restoredPrompt = job.composerPrompt ?? state.prompt;
    const restoredInsertedPrompts = normalizeInsertedPromptArray(job.composerInsertedPrompts) ?? state.insertedPrompts;
    saveGenerationDefaultsPatch({
      prompt: restoredPrompt,
      insertedPrompts: restoredInsertedPrompts,
    });
    saveSelectedFilename(null);
    set({
      currentImage: null,
      multimodePreviewFlightId: null,
      canvasOpen: false,
      prompt: restoredPrompt,
      insertedPrompts: restoredInsertedPrompts,
      promptBuilderScope: scope,
      promptBuilderMessages: getPromptBuilderSessionMessages(state.promptBuilderSessions, scope),
      promptBuilderAttachments: [],
    });
  },
  startInFlightPolling: () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __ima2InflightTimer?: number };
    if (w.__ima2InflightTimer) return;
    const tick = async () => {
      const cur = get().inFlight;
      // Polling backoff: when there are no local jobs to track AND no active
      // generations counter, stop the interval entirely. Polling is restarted
      // from generation entry points (startGeneration / reconcileInflight).
      if (cur.length === 0 && get().activeGenerations === 0) {
        if (w.__ima2InflightTimer) {
          clearInterval(w.__ima2InflightTimer);
          w.__ima2InflightTimer = undefined;
        }
        return;
      }
      let scopedActiveServerIds = new Set<string>();
      // Merge server-side phase info so the spinner label reflects real progress
      try {
        const scopes = getInflightQueryScopes(get());
        const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
        scopedActiveServerIds = new Set(jobs.map((j) => j.requestId));
        const byId = new Map(jobs.map((j) => [j.requestId, j] as const));
        const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
        const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
        let changed = false;
        const now0 = Date.now();
        const GRACE_MS = 5000;
        const nextInflight: typeof cur = [];
        for (const f of get().inFlight) {
          // Out-of-scope entries (different kind/session) must not be dropped
          // based on this tick's byId — the server wasn't asked about them.
          if (!matchesInflightScope(f, scopes)) {
            nextInflight.push(f);
            continue;
          }
          const terminal = terminalById.get(f.id);
          if (terminal) {
            changed = true;
            if (terminal.status === "error") {
              terminalErrors.push(terminalJobError(terminal));
            }
            continue;
          }
          // If server no longer knows this job and enough time has passed,
          // drop it locally so the spinner does not linger after completion.
          if (!byId.has(f.id) && now0 - f.startedAt > GRACE_MS) {
            changed = true;
            continue;
          }
          const p = byId.get(f.id);
          if (p) {
            const serverJob = toPersistedInFlightJob(p);
            const nextJob = {
              ...f,
              phase: serverJob.phase,
              sessionId: serverJob.sessionId,
              parentNodeId: serverJob.parentNodeId,
              clientNodeId: serverJob.clientNodeId,
              kind: serverJob.kind,
            };
            if (
              nextJob.phase !== f.phase ||
              nextJob.sessionId !== f.sessionId ||
              nextJob.parentNodeId !== f.parentNodeId ||
              nextJob.clientNodeId !== f.clientNodeId ||
              nextJob.kind !== f.kind
            ) {
              changed = true;
            }
            nextInflight.push(nextJob);
          } else {
            nextInflight.push(f);
          }
        }
        // Re-add active jobs that only the server knows about. This covers
        // reload/abort races where localStorage lost requestIds while the
        // backend kept streaming.
        const nextIds = new Set(nextInflight.map((f) => f.id));
        for (const j of jobs) {
          if (!nextIds.has(j.requestId)) {
            nextInflight.push(toPersistedInFlightJob(j));
            changed = true;
          }
        }
        if (changed) {
          saveInFlight(nextInflight);
          set({ inFlight: nextInflight, activeGenerations: nextInflight.length });
        }
        for (const err of terminalErrors) {
          handleError(err, get());
        }
      } catch {}
      try {
        const lastKnown = get().history.reduce(
          (max, it) => (it.createdAt && it.createdAt > max ? it.createdAt : max),
          0,
        );
        const { items } = await getHistory({ limit: HISTORY_LIMIT, since: lastKnown });
        const arr: GenerateItem[] = items.map(mapHistoryItem);
        if (arr.length > 0) {
          set((s) => {
            const seen = new Set(s.history.map(historyKey));
            const fresh = arr.filter((item) => {
              const key = historyKey(item);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (fresh.length === 0) return {};
            const nextCurrent = s.currentImage ?? fresh[0];
            if (!s.currentImage && fresh[0]?.filename) {
              saveSelectedFilename(fresh[0].filename);
            }
            return {
              history: retainHistoryItems(
                [...fresh, ...s.history],
                Math.max(HISTORY_LIMIT, s.history.length + fresh.length),
              ),
              currentImage: nextCurrent,
              loadedHistoryRetainLimit: Math.max(
                s.loadedHistoryRetainLimit,
                s.history.length + fresh.length,
              ),
            };
          });
        }
        // Prune strategy: TTL-based only. Do not attempt to correlate
        // history items with inFlight entries — backend ordering may differ
        // from local generation order under concurrency. Matching by prompt
        // is also unreliable when the same prompt is queued twice.
        const now = Date.now();
        const remaining = get().inFlight.filter(
          (f) => scopedActiveServerIds.has(f.id) || now - f.startedAt < INFLIGHT_TTL_MS,
        );
        if (remaining.length !== get().inFlight.length) {
          saveInFlight(remaining);
          set({ inFlight: remaining, activeGenerations: remaining.length });
        }
      } catch {}
    };
    w.__ima2InflightTimer = window.setInterval(tick, 1500) as unknown as number;
  },
  reconcileInflight: async () => {
    try {
      const scopes = getInflightQueryScopes(get());
      const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
      const serverById = new Map(jobs.map((j) => [j.requestId, j] as const));
      const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
      const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
      const now = Date.now();
      const currentLocal = get().inFlight;
      const local = currentLocal.length > 0 ? currentLocal : loadInFlight();
      // Keep local entries that are either still known to the server,
      // or started very recently (<10s — request may be in-flight before
      // /api/inflight registered). Keep out-of-scope entries because this
      // request only asked the server about the current mode/session.
      const merged = local.flatMap((f) => {
        const serverJob = serverById.get(f.id);
        if (serverJob) {
          const restored = toPersistedInFlightJob(serverJob);
          return [{ ...f, ...restored, prompt: f.prompt || restored.prompt }];
        }
        if (!matchesInflightScope(f, scopes)) return [f];
        const terminal = terminalById.get(f.id);
        if (terminal) {
          if (terminal.status === "error") {
            terminalErrors.push(terminalJobError(terminal));
          }
          return [];
        }
        return now - f.startedAt < 10_000 ? [f] : [];
      });
      // Bring in server-only jobs (started from another tab / process)
      const localIds = new Set(merged.map((f) => f.id));
      for (const j of jobs) {
        if (!localIds.has(j.requestId)) {
          merged.push(toPersistedInFlightJob(j));
        }
      }
      saveInFlight(merged);
      set({ inFlight: merged, activeGenerations: merged.length });
      for (const err of terminalErrors) {
        handleError(err, get());
      }
      if (merged.length > 0) get().startInFlightPolling();
    } catch {
      // Silent — endpoint may not exist on older servers.
    }
  },
  syncFromStorage: () => {
    // Triggered by `storage` events (another tab changed localStorage).
    const nextInflight = loadInFlight();
    const nextSelected = loadSelectedFilename();
    const nextImageModel = loadImageModel();
    set((s) => {
      const matched = nextSelected
        ? s.history.find((h) => h.filename === nextSelected) ?? null
        : null;
      const normalized = matched
        ? resolveVisibleShortcutCurrent(s.history, matched)
        : null;
      const visibleFallback = getVisibleGalleryItems(s.history)[0] ?? null;
      const currentImage = s.currentImage?.canvasVersion
        ? resolveVisibleShortcutCurrent(s.history, s.currentImage) ?? visibleFallback
        : s.currentImage;
      return {
        inFlight: nextInflight,
        activeGenerations: nextInflight.length,
        imageModel: nextImageModel,
        currentImage:
          nextSelected && currentImage?.filename !== nextSelected
            ? normalized ?? currentImage
            : currentImage,
      };
    });
    if (nextInflight.length > 0) get().startInFlightPolling();
  },
  currentImage: null,
  applyMergedCanvasImage: (item) => {
    set((s) => ({
      history: item.filename
        ? s.history.some((h) => h.filename === item.filename)
          ? s.history.map((h) => (h.filename === item.filename ? item : h))
          : retainHistoryItems([item, ...s.history], s.loadedHistoryRetainLimit + 1)
        : s.history,
      loadedHistoryRetainLimit: Math.max(
        s.loadedHistoryRetainLimit,
        Math.min(s.history.length + 1, s.loadedHistoryRetainLimit + 1),
      ),
    }));
  },
  addGeneratedHistoryItem: async (item) => {
    await addHistory(item, set, get);
  },
  history: [],
  historyNextCursor: null,
  historyLoadingOlder: false,
  favoriteHistoryNextCursor: null,
  favoriteHistoryLoadingOlder: false,
  loadedHistoryRetainLimit: HISTORY_LIMIT,
  loadOlderHistory: async () => {
    const cursor = get().historyNextCursor;
    if (!cursor || get().historyLoadingOlder) return;
    set({ historyLoadingOlder: true });
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, cursor });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const seen = new Set(s.history.map((item) => item.filename ?? item.image));
        const appended = incoming.filter((item) => {
          const key = item.filename ?? item.image;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          history: [...s.history, ...appended],
          historyNextCursor: res.nextCursor,
          historyLoadingOlder: false,
          loadedHistoryRetainLimit: Math.max(
            s.loadedHistoryRetainLimit,
            s.history.length + appended.length,
          ),
        };
      });
    } catch {
      set({ historyLoadingOlder: false });
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  loadFavoriteHistory: async () => {
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, favoritesOnly: true });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const history = mergeHistoryItems(s.history, incoming);
        return {
          history,
          favoriteHistoryNextCursor: res.nextCursor,
          loadedHistoryRetainLimit: Math.max(s.loadedHistoryRetainLimit, history.length),
          galleryFavorites: new Set([
            ...Array.from(s.galleryFavorites),
            ...incoming.filter((item) => item.filename).map((item) => item.filename!),
          ]),
        };
      });
    } catch {
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  loadOlderFavoriteHistory: async () => {
    const cursor = get().favoriteHistoryNextCursor;
    if (!cursor || get().favoriteHistoryLoadingOlder) return;
    set({ favoriteHistoryLoadingOlder: true });
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, cursor, favoritesOnly: true });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const history = mergeHistoryItems(s.history, incoming);
        return {
          history,
          favoriteHistoryNextCursor: res.nextCursor,
          favoriteHistoryLoadingOlder: false,
          loadedHistoryRetainLimit: Math.max(s.loadedHistoryRetainLimit, history.length),
          galleryFavorites: new Set([
            ...Array.from(s.galleryFavorites),
            ...incoming.filter((item) => item.filename).map((item) => item.filename!),
          ]),
        };
      });
    } catch {
      set({ favoriteHistoryLoadingOlder: false });
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  trashPending: null,
  toast: null,
  toastLog: [],
  customSizeConfirm: null,
  errorCard: null,
  errorCardLog: [],
  rightPanelOpen: loadRightPanelOpen(),
  toggleRightPanel: () =>
    set((s) => {
      const next = !s.rightPanelOpen;
      try {
        localStorage.setItem(RIGHT_PANEL_OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return { rightPanelOpen: next };
    }),
  leftSidebarOpen: loadLeftSidebarOpen(),
  toggleLeftSidebar: () =>
    set((s) => {
      const next = !s.leftSidebarOpen;
      try {
        localStorage.setItem(LEFT_SIDEBAR_OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return { leftSidebarOpen: next };
    }),
  composeSheetOpen: false,
  composeSheetTab: "prompt",
  openComposeSheet: (tab = "prompt") => set({ composeSheetOpen: true, composeSheetTab: tab }),
  setComposeSheetTab: (tab) => set({ composeSheetTab: tab }),
  closeComposeSheet: () => set({ composeSheetOpen: false }),
  galleryOpen: false,
  openGallery: () =>
    set((s) => ({ galleryOpen: true, galleryScope: s.galleryDefaultScope })),
  closeGallery: () => set({ galleryOpen: false }),
  galleryScope: loadGalleryScope(GALLERY_SCOPE_STORAGE_KEY),
  galleryDefaultScope: loadGalleryScope(GALLERY_DEFAULT_SCOPE_STORAGE_KEY),
  setGalleryScope: (scope) => {
    try {
      localStorage.setItem(GALLERY_SCOPE_STORAGE_KEY, scope);
    } catch {}
    set({ galleryScope: scope });
  },
  setGalleryDefaultScope: (scope) => {
    try {
      localStorage.setItem(GALLERY_DEFAULT_SCOPE_STORAGE_KEY, scope);
      localStorage.setItem(GALLERY_SCOPE_STORAGE_KEY, scope);
    } catch {}
    set({ galleryDefaultScope: scope, galleryScope: scope });
  },

  imageModel: loadImageModel(),
  reasoningEffort: loadReasoningEffort(),
  webSearchEnabled: loadWebSearchEnabled(),

  settingsOpen: false,
  activeSettingsSection: "account",
  openSettings: (section = "account") =>
    set({ settingsOpen: true, activeSettingsSection: section }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () =>
    set((s) => ({
      settingsOpen: !s.settingsOpen,
      activeSettingsSection: s.settingsOpen ? s.activeSettingsSection : "account",
    })),
  setActiveSettingsSection: (section) => set({ activeSettingsSection: section }),

  uiMode: loadUIMode(),
  setUIMode: (m) => {
    const next =
      m === "card-news" && !ENABLE_CARD_NEWS_MODE ? "classic" :
        m === "node" && !ENABLE_NODE_MODE ? "classic" :
          m;
    try { localStorage.setItem(UI_MODE_STORAGE_KEY, next); } catch {}
    set({ uiMode: next });
  },

  theme: loadThemePreference(),
  resolvedTheme: resolveThemePreference(loadThemePreference()),
  themeFamily: loadThemeFamily(),
  historyStripLayout: loadHistoryStripLayout(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    set({ theme, resolvedTheme: resolveThemePreference(theme) });
  },
  setThemeFamily: (family) => {
    try {
      localStorage.setItem(THEME_FAMILY_STORAGE_KEY, family);
    } catch {}
    set({ themeFamily: family });
  },
  setHistoryStripLayout: (layout) => {
    try {
      localStorage.setItem(HISTORY_STRIP_LAYOUT_STORAGE_KEY, layout);
    } catch {}
    set({ historyStripLayout: layout });
  },
  syncThemeFromStorage: () => {
    const theme = loadThemePreference();
    set({ theme, resolvedTheme: resolveThemePreference(theme) });
  },
  syncThemeFamilyFromStorage: () => {
    set({ themeFamily: loadThemeFamily() });
  },
  refreshResolvedTheme: () => {
    set((s) => ({ resolvedTheme: resolveThemePreference(s.theme) }));
  },

  locale: loadLocale(),
  setLocale: (l) => {
    saveLocale(l);
    set({ locale: l });
  },

  graphNodes: [],
  graphEdges: [],
  setGraphNodes: (graphNodes) => {
    set({ graphNodes: deriveParentServerNodeIds(graphNodes, get().graphEdges) });
    get().scheduleGraphSave();
  },
  setGraphEdges: (graphEdges) => {
    set({ graphEdges, graphNodes: deriveParentServerNodeIds(get().graphNodes, graphEdges) });
    get().scheduleGraphSave();
  },
  disconnectEdge: (edgeId) => {
    get().disconnectEdges([edgeId]);
  },
  disconnectEdges: (edgeIds) => {
    const edgeIdSet = new Set(edgeIds);
    if (edgeIdSet.size === 0) return;
    const removedEdges = get().graphEdges.filter((edge) => edgeIdSet.has(edge.id));
    if (removedEdges.length === 0) return;
    const nextEdges = get().graphEdges.filter((edge) => !edgeIdSet.has(edge.id));
    const removedTargets = new Set(removedEdges.map((edge) => edge.target));
    const nextNodes = get().graphNodes.map((node) => {
      if (!removedTargets.has(node.id)) return node;
      const remainingIncoming = nextEdges.find((edge) => edge.target === node.id);
      const remainingParent = remainingIncoming
        ? get().graphNodes.find((candidate) => candidate.id === remainingIncoming.source)
        : null;
      return {
        ...node,
        data: {
          ...node.data,
          parentServerNodeId: remainingParent?.data.serverNodeId ?? null,
        },
      };
    });
    set({ graphNodes: deriveParentServerNodeIds(nextNodes, nextEdges), graphEdges: nextEdges });
    get().scheduleGraphSave();
    void get().flushGraphSave("edge-disconnect");
    get().showToast(t("edge.disconnected"));
  },
  nodeSelectionMode: false,
  nodeBatchRunning: false,
  nodeBatchStopping: false,
  toggleNodeSelectionMode: () => {
    const next = !get().nodeSelectionMode;
    set({
      nodeSelectionMode: next,
      ...(next ? {} : { graphNodes: applySelectedNodeIds(get().graphNodes, []) }),
    });
  },
  selectAllGraphNodes: () => {
    set({ graphNodes: applySelectedNodeIds(get().graphNodes, get().graphNodes.map((n) => n.id)) });
  },
  selectNodeGraph: (clientId, additive) => {
    set({
      graphNodes: applyComponentSelection(get().graphNodes, get().graphEdges, clientId, additive),
    });
  },
  clearNodeSelection: () => {
    set({ graphNodes: applySelectedNodeIds(get().graphNodes, []) });
  },
  cancelNodeBatch: () => {
    if (!get().nodeBatchRunning) return;
    set({ nodeBatchStopping: true });
    get().showToast(t("nodeBatch.stopQueued"));
  },

  sessions: [],
  activeSessionId: null,
  activeSessionGraphVersion: null,
  sessionLoading: false,

  async loadSessions() {
    try {
      const { sessions } = await apiListSessions();
      set({ sessions });
      const current = get().activeSessionId;
      if (!current) {
        const savedId = loadActiveSessionId();
        const savedExists = savedId ? sessions.some((s) => s.id === savedId) : false;
        if (savedId && savedExists) {
          await get().switchSession(savedId);
        } else {
          await get().createAndSwitchSession(t("session.firstGraph"));
        }
      }
    } catch (err) {
      console.warn("[sessions] load failed:", err);
    }
  },

  async switchSession(id) {
    set({ sessionLoading: true });
    await get().flushGraphSave("switch-session");
    try {
      const { session } = await apiGetSession(id);
      const { graphNodes, graphEdges, graphVersion } = mapSessionToGraph(session);
      set({
        activeSessionId: id,
        activeSessionGraphVersion: graphVersion,
        graphNodes,
        graphEdges,
        sessionLoading: false,
      });
      saveActiveSessionId(id);
      // Serialize reconcile and recovery so the two async writers don't race.
      // reconcileGraphPending already calls recoverGraphNodesFromHistory at the
      // end, but we await it explicitly here so any subsequent tick sees the
      // recovered state.
      await get().reconcileGraphPending().catch(() => {});
    } catch (err) {
      console.warn("[sessions] switch failed:", err);
      set({ sessionLoading: false });
      get().showToast(t("toast.sessionLoadFailed"), true);
    }
  },

  async reconcileGraphPending() {
    const sid = get().activeSessionId;
    if (!sid) return;
    const pendingNodes = get().graphNodes.filter(
      (n) => n.data?.pendingRequestId && (n.data.status === "pending" || n.data.status === "reconciling"),
    );
    if (pendingNodes.length > 0) {
      let jobs: Array<{ requestId: string; phase?: string }> = [];
      try {
        const res = await getInflight({ kind: "node", sessionId: sid });
        jobs = res.jobs;
      } catch {
        // If inflight cannot be queried, skip pending transition but still
        // attempt orphan recovery below.
        jobs = [];
      }
      const byId = new Map(jobs.map((j) => [j.requestId, j.phase] as const));
      const now = Date.now();
      const GRACE_MS = 10_000;
      const next = get().graphNodes.map((n) => {
        const reqId = n.data?.pendingRequestId;
        if (!reqId) return n;
        if (n.data.status !== "pending" && n.data.status !== "reconciling") return n;
        if (byId.has(reqId)) {
          const phase = byId.get(reqId) ?? null;
          return {
            ...n,
            data: { ...n.data, status: "reconciling" as const, pendingPhase: phase },
          };
        }
        // Not in-flight anymore. Apply B grace window if we know when it started —
        // the server may have just finished and the response is still en route.
        const startedAt = n.data.pendingStartedAt ?? 0;
        if (startedAt && now - startedAt < GRACE_MS) {
          return {
            ...n,
            data: { ...n.data, status: "reconciling" as const },
          };
        }
        // Image may have landed, or job was lost.
        const hasAsset = !!n.data.imageUrl || !!n.data.serverNodeId;
        return {
          ...n,
          data: {
            ...n.data,
            pendingRequestId: null,
            pendingPhase: null,
            pendingStartedAt: null,
            partialImageUrl: null,
            status: hasAsset ? ("ready" as const) : ("stale" as const),
            error: hasAsset ? undefined : t("session.assetAbortedError"),
          },
        };
      });
      set({ graphNodes: next });
    }
    // Always attempt orphan recovery: covers A-sanitized empty nodes and
    // cross-session completions that never landed in this graph.
    await recoverGraphNodesFromHistory(get, set).catch(() => {});
  },

  async createAndSwitchSession(title?: string) {
    if (title == null) title = t("session.untitled");
    try {
      const { session } = await apiCreateSession(title);
      set({
        sessions: [session as SessionSummary, ...get().sessions],
        activeSessionId: session.id,
        activeSessionGraphVersion: session.graphVersion,
        graphNodes: [],
        graphEdges: [],
      });
      saveActiveSessionId(session.id);
    } catch (err) {
      console.warn("[sessions] create failed:", err);
      get().showToast(t("toast.sessionCreateFailed"), true);
    }
  },

  async renameCurrentSession(title) {
    const id = get().activeSessionId;
    if (!id) return;
    try {
      await apiRenameSession(id, title);
      set({
        sessions: get().sessions.map((s) =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
        ),
      });
    } catch (err) {
      get().showToast(t("toast.sessionRenameFailed"), true);
    }
  },

  async deleteSessionById(id) {
    try {
      await apiDeleteSession(id);
      const remaining = get().sessions.filter((s) => s.id !== id);
      set({ sessions: remaining });
      if (get().activeSessionId === id) {
        set({
          activeSessionId: null,
          activeSessionGraphVersion: null,
          graphNodes: [],
          graphEdges: [],
        });
        saveActiveSessionId(null);
        if (remaining.length > 0) {
          await get().switchSession(remaining[0].id);
        } else {
          await get().createAndSwitchSession(t("session.firstGraph"));
        }
      }
    } catch (err) {
      get().showToast(t("toast.sessionDeleteFailed"), true);
    }
  },

  scheduleGraphSave() {
    scheduleGraphSaveImpl(get, set);
  },

  async flushGraphSave(reason = "manual") {
    await flushGraphSaveImpl(get, set, reason);
  },

  addRootNode: () => {
    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextRootPosition(get().graphNodes),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: null,
          prompt: "",
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
      };
    set({ graphNodes: [...get().graphNodes, node] });
    get().scheduleGraphSave();
    return clientId;
  },

  addChildNode: (parentClientId) => {
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return parentClientId;
    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextChildPosition(parent, get().graphNodes, get().graphEdges),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: parent.data.serverNodeId,
          prompt: "",
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, DEFAULT_CHILD_SOURCE_HANDLE, DEFAULT_CHILD_TARGET_HANDLE),
      source: parentClientId,
      target: clientId,
      sourceHandle: DEFAULT_CHILD_SOURCE_HANDLE,
      targetHandle: DEFAULT_CHILD_TARGET_HANDLE,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  addSiblingNode: (sourceClientId) => {
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return sourceClientId;

    const incomingEdge = get().graphEdges.find((e) => e.target === sourceClientId);
    if (!incomingEdge) {
      const clientId = newClientNodeId();
      const node: GraphNode = {
        id: clientId,
        type: "imageNode",
        position: getNextRootPosition(get().graphNodes),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: null,
          prompt: source.data.prompt,
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
      };
      set({ graphNodes: [...get().graphNodes, node] });
      get().scheduleGraphSave();
      return clientId;
    }

    const parentClientId = incomingEdge.source;
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return sourceClientId;

    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextChildPosition(parent, get().graphNodes, get().graphEdges),
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: source.data.parentServerNodeId,
        prompt: source.data.prompt,
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, DEFAULT_CHILD_SOURCE_HANDLE, DEFAULT_CHILD_TARGET_HANDLE),
      source: parentClientId,
      target: clientId,
      sourceHandle: DEFAULT_CHILD_SOURCE_HANDLE,
      targetHandle: DEFAULT_CHILD_TARGET_HANDLE,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  updateNodePrompt: (clientId, prompt) => {
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId ? { ...n, data: { ...n.data, prompt } } : n,
      ),
    });
    get().scheduleGraphSave();
  },

  addNodeReferences: async (clientId, files) => {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    const currentRefs = node.data.referenceImages ?? [];
    const allowed = MAX_REFERENCE_IMAGES - currentRefs.length;
    if (allowed <= 0) {
      get().showToast(t("toast.refLimitExceeded"), true);
      return;
    }
    const toAdd = files.slice(0, Math.max(0, allowed));
    const heicSkipped = toAdd.filter(isHeic);
    const usable = toAdd.filter((f) => !isHeic(f));
    const results = await Promise.all(
      usable.map(async (f) => {
        try {
          return await compressToBase64(f, {
            preserveTransparency: hasAlphaChannel(f),
          });
        } catch (err) {
          console.warn("[addNodeReferences] compress failed", err);
          return null;
        }
      }),
    );
    const valid = results.filter((x): x is string => !!x);
    if (valid.length > 0) {
      const sessionId = get().activeSessionId;
      set({
        graphNodes: get().graphNodes.map((n) =>
          {
            if (n.id !== clientId) return n;
            const refs = [
              ...(n.data.referenceImages ?? []),
              ...valid,
            ].slice(0, MAX_REFERENCE_IMAGES);
            saveNodeRefs(sessionId, clientId, refs);
            return {
                ...n,
                data: {
                  ...n.data,
                  referenceImages: refs,
                },
              };
          },
        ),
      });
      get().scheduleGraphSave();
    }
    if (heicSkipped.length > 0) {
      get().showToast(t("toast.refHeicUnsupported"), true);
    }
    const failedCount = usable.length - valid.length;
    if (failedCount > 0) {
      get().showToast(t("toast.refTooLarge"), true);
    }
    if (files.length > allowed) {
      get().showToast(t("toast.refLimitExceeded"), true);
    }
  },

  addNodeReferenceDataUrl: (clientId, dataUrl) => {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    set({
      graphNodes: get().graphNodes.map((n) => {
        if (n.id !== clientId) return n;
        const refs = n.data.referenceImages ?? [];
        if (refs.length >= MAX_REFERENCE_IMAGES) return n;
        const nextRefs = [...refs, dataUrl];
        saveNodeRefs(get().activeSessionId, clientId, nextRefs);
        return {
          ...n,
          data: {
            ...n.data,
            referenceImages: nextRefs,
          },
        };
      }),
    });
    get().scheduleGraphSave();
  },

  removeNodeReference: (clientId, index) => {
    set({
      graphNodes: get().graphNodes.map((n) => {
        if (n.id !== clientId) return n;
        const refs = (n.data.referenceImages ?? []).filter((_, i) => i !== index);
        saveNodeRefs(get().activeSessionId, clientId, refs);
        return {
              ...n,
              data: {
                ...n.data,
                referenceImages: refs,
              },
            };
      }),
    });
    get().scheduleGraphSave();
  },

  clearNodeReferences: (clientId) => {
    clearStoredNodeRefs(get().activeSessionId, clientId);
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId
          ? {
              ...n,
              data: {
                ...n.data,
                referenceImages: undefined,
              },
            }
          : n,
      ),
    });
    get().scheduleGraphSave();
  },

  duplicateBranchRoot: (sourceClientId) => {
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return sourceClientId;
    const clientId = newClientNodeId();
    const rootSiblings = get().graphNodes.filter((n) => !n.data.parentServerNodeId).length;
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: { x: source.position.x + 420, y: source.position.y + 40 },
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: null,
        prompt: source.data.prompt,
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    // no parent edge — becomes a new branch root at root layer
    void rootSiblings;
    set({ graphNodes: [...get().graphNodes, node] });
    get().scheduleGraphSave();

    // Pre-seed the source image as a node-local draft reference. Keeping this
    // local prevents hidden classic references from influencing node mode.
    if (source.data.imageUrl) {
      const sourceUrl = source.data.imageUrl;
      (async () => {
        try {
          const dataUrl = await compressReferenceSource(sourceUrl, "node-reference.png");
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      referenceImages: [dataUrl],
                    },
                  }
                : n,
            ),
          });
        } catch {
          // non-fatal
        }
      })();
    }
    return clientId;
  },

  async generateNode(clientId) {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    const { prompt } = node.data;
    if (!prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    const pending = getCustomSizeConfirmation(get(), { kind: "node", clientId });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    await get().runGenerateNode(clientId);
  },

  async generateNodeInPlace(clientId) {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    if (!node.data.prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    const pending = getCustomSizeConfirmation(get(), { kind: "node-in-place", clientId });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    await get().runGenerateNodeInPlace(clientId);
  },

  async generateNodeVariation(clientId, sizeOverride) {
    const source = get().graphNodes.find((n) => n.id === clientId);
    if (!source) return;
    if (!source.data.prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    if (!sizeOverride) {
      const pending = getCustomSizeConfirmation(get(), { kind: "node-variation", clientId });
      if (pending) {
        set({ customSizeConfirm: pending });
        return;
      }
    }
    const targetClientId = get().addSiblingNode(clientId);
    await get().runGenerateNodeInPlace(targetClientId, { sizeOverride });
  },

  async runGenerateNode(clientId, sizeOverride) {
    const requestedNode = get().graphNodes.find((n) => n.id === clientId);
    const targetClientId = requestedNode?.data.status === "ready"
      ? get().addSiblingNode(clientId)
      : clientId;
    await get().runGenerateNodeInPlace(targetClientId, { sizeOverride });
  },

  async runGenerateNodeInPlace(clientId, options = {}) {
    if (nodeGenerationLocks.has(clientId)) return null;
    nodeGenerationLocks.add(clientId);
    const beforeRepair = get().graphNodes;
    const repairedNodes = deriveParentServerNodeIds(beforeRepair, get().graphEdges);
    if (repairedNodes.some((n, i) => n.data.parentServerNodeId !== beforeRepair[i]?.data.parentServerNodeId)) {
      set({ graphNodes: repairedNodes });
    }
    const node = repairedNodes.find((n) => n.id === clientId);
    if (!node) {
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    const { prompt, parentServerNodeId } = node.data;
    if (!prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    const nodeRefs = node.data.referenceImages ?? [];
    const s = get();
    const size = options.sizeOverride ?? s.getResolvedSize();
    const effectiveParentServerNodeId =
      options.parentServerNodeIdOverride !== undefined
        ? options.parentServerNodeIdOverride
        : parentServerNodeId;
    const incoming = get().graphEdges.find((edge) => edge.target === clientId);
    if (incoming && !effectiveParentServerNodeId) {
      get().showToast(t("node.parentImageRequired"), true);
      nodeGenerationLocks.delete(clientId);
      return null;
    }

    // Capture request session so a later session switch does not corrupt graph B.
    const requestSessionId = s.activeSessionId;
    // mark pending — request-unique flightId so retries on the same node don't collide.
    const startedAt = Date.now();
    const randSuffix = Math.random().toString(36).slice(2, 6);
    const flightId = `fn_${clientId}_${startedAt}_${randSuffix}`;
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      {
        id: flightId,
        prompt,
        startedAt,
        kind: "node",
        sessionId: requestSessionId,
        clientNodeId: clientId,
      },
    ];
    saveInFlight(nextInFlight);
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId
          ? {
              ...n,
              data: {
                ...n.data,
                status: "pending",
                pendingRequestId: flightId,
                recoveryRequestId: flightId,
                pendingPhase: "queued",
                pendingStartedAt: startedAt,
                partialImageUrl: null,
                error: undefined,
                size,
              },
            }
          : n,
      ),
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
    });
    get().startInFlightPolling();

    let graphMutated = true; // pending set above already mutated the graph if same-session

    try {
      const res = await postNodeGenerateStream({
        parentNodeId: effectiveParentServerNodeId,
        prompt,
        quality: s.quality,
        size,
        format: s.format,
        moderation: s.moderation,
        model: s.imageModel,
        reasoningEffort: s.reasoningEffort,
        requestId: flightId,
        sessionId: requestSessionId,
        clientNodeId: clientId,
        contextMode: "parent-plus-refs",
        searchMode: s.webSearchEnabled ? "on" : "off",
        webSearchEnabled: s.webSearchEnabled,
        ...(nodeRefs.length
          ? { references: nodeRefs.map(stripDataUrlPrefix) }
          : {}),
      }, {
        onPartial: (partial) => {
          if (get().activeSessionId !== requestSessionId) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: "pending",
                      partialImageUrl: partial.image,
                      pendingPhase: "partial",
                    },
                  }
                : n,
            ),
          });
        },
        onPhase: (phase) => {
          if (get().activeSessionId !== requestSessionId) return;
          if (!phase.phase) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      pendingPhase: phase.phase ?? n.data.pendingPhase,
                    },
                  }
                : n,
            ),
          });
        },
      });
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) => {
            if (n.id !== clientId) return n;
            const nextData = { ...n.data };
            delete nextData.partialImageUrl;
            return {
              ...n,
              data: {
                ...nextData,
                serverNodeId: res.nodeId,
                imageUrl: res.url,
                status: "ready",
                pendingRequestId: null,
                recoveryRequestId: null,
                pendingPhase: null,
                pendingStartedAt: null,
                elapsed: res.elapsed,
                webSearchCalls: res.webSearchCalls,
                model: res.model ?? null,
                size: res.size ?? size,
              },
            };
          }),
        });
        graphMutated = true;
        if (!options.suppressToast) {
          get().showToast(t("toast.nodeCreated", { id: res.nodeId.slice(0, 8), elapsed: res.elapsed }));
        }
      }
      return res.nodeId;
      // cross-session: result will be restored via recoverGraphNodesFromHistory
      // when the user returns to the originating session.
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.nodeCreateFailed");
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === clientId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "error",
                    pendingRequestId: null,
                    pendingPhase: null,
                    pendingStartedAt: null,
                    partialImageUrl: null,
                    error: msg,
                  },
                }
              : n,
          ),
        });
        graphMutated = true;
        handleError(err, get());
      }
      // cross-session: silent — user is on a different graph
      return null;
    } finally {
      // Global state cleanup must always run regardless of active session,
      // otherwise the spinner/counter leaks.
      nodeGenerationLocks.delete(clientId);
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({
        activeGenerations: Math.max(0, get().activeGenerations - 1),
        inFlight: remaining,
      });
      // Persist the graph only if we actually mutated it AND we are still on
      // the originating session.
      if (get().activeSessionId === requestSessionId && graphMutated) {
        get().scheduleGraphSave();
        void get().flushGraphSave("node-complete");
      }
    }
  },

  async runNodeBatch(mode) {
    if (get().nodeBatchRunning) return;
    const selectedIds = getSelectedNodeIds(get().graphNodes);
    if (selectedIds.length === 0) {
      get().showToast(t("nodeBatch.noneSelected"), true);
      return;
    }
    const blocked = validateBatchDependencies(get().graphNodes, get().graphEdges, selectedIds);
    if (blocked.length > 0) {
      get().showToast(t("nodeBatch.parentRequired", { count: blocked.length }), true);
      return;
    }
    const orderedIds = topologicalSortSelected(get().graphNodes, get().graphEdges, selectedIds);
    const selectedSet = new Set(selectedIds);
    const candidates = orderedIds.filter((id) => {
      if (mode === "regenerate-all") return true;
      const node = get().graphNodes.find((n) => n.id === id);
      return node ? !nodeHasImage(node) : false;
    });
    if (candidates.length === 0) {
      get().showToast(t("nodeBatch.nothingToRun"));
      return;
    }

    set({ nodeBatchRunning: true, nodeBatchStopping: false });
    const latestServerNodeIdByClientId = new Map<string, string>();
    let completed = 0;
    try {
      for (const clientId of candidates) {
        if (get().nodeBatchStopping) break;
        const incoming = get().graphEdges.find((e) => e.target === clientId);
        const parentOverride = incoming
          ? latestServerNodeIdByClientId.get(incoming.source)
            ?? get().graphNodes.find((n) => n.id === clientId)?.data.parentServerNodeId
            ?? null
          : null;
        const nodeId = await get().runGenerateNodeInPlace(clientId as ClientNodeId, {
          parentServerNodeIdOverride: parentOverride,
          suppressToast: true,
        });
        if (!nodeId) {
          get().showToast(t("nodeBatch.failed", { done: completed, total: candidates.length }), true);
          break;
        }
        completed += 1;
        latestServerNodeIdByClientId.set(clientId, nodeId);
        const directChildren = getDirectUnselectedChildren(get().graphEdges, clientId, selectedSet);
        const downstream = new Set(getUnselectedDownstreamIds(get().graphEdges, selectedSet));
        set({
          graphNodes: get().graphNodes.map((n) => {
            if (!downstream.has(n.id)) return n;
            return {
              ...n,
              data: {
                ...n.data,
                status: "stale",
                parentServerNodeId: directChildren.includes(n.id)
                  ? nodeId
                  : n.data.parentServerNodeId,
                error: t("nodeBatch.staleBecauseParentChanged"),
              },
            };
          }),
        });
      }
      get().showToast(t("nodeBatch.finished", { done: completed, total: candidates.length }));
      get().scheduleGraphSave();
    } finally {
      set({ nodeBatchRunning: false, nodeBatchStopping: false });
    }
  },

  deleteNode: (clientId) => {
    const doomed = get().graphNodes.find((n) => n.id === clientId);
    const reqId = doomed?.data?.pendingRequestId;
    if (reqId) void cancelInflight(reqId);
    clearStoredNodeRefs(get().activeSessionId, clientId);
    const graphNodes = get().graphNodes.filter((n) => n.id !== clientId);
    const graphEdges = get().graphEdges.filter((e) => e.source !== clientId && e.target !== clientId);
    set({
      graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  deleteNodes: (clientIds) => {
    const set_ = new Set(clientIds);
    for (const clientId of set_) clearStoredNodeRefs(get().activeSessionId, clientId);
    for (const n of get().graphNodes) {
      if (set_.has(n.id) && n.data?.pendingRequestId) {
        void cancelInflight(n.data.pendingRequestId);
      }
    }
    const graphNodes = get().graphNodes.filter((n) => !set_.has(n.id));
    const graphEdges = get().graphEdges.filter((e) => !set_.has(e.source) && !set_.has(e.target));
    set({
      graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  addChildNodeAt: (parentClientId, position, sourceHandle = DEFAULT_CHILD_SOURCE_HANDLE) => {
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return parentClientId;
    const clientId = newClientNodeId();
    const normalizedSourceHandle =
      normalizeNodeHandleId(sourceHandle, "source") ?? DEFAULT_CHILD_SOURCE_HANDLE;
    const targetHandle = getOppositeTargetHandle(normalizedSourceHandle) ?? DEFAULT_CHILD_TARGET_HANDLE;
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position,
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: parent.data.serverNodeId,
        prompt: "",
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, normalizedSourceHandle, targetHandle),
      source: parentClientId,
      target: clientId,
      sourceHandle: normalizedSourceHandle,
      targetHandle,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  connectNodes: (sourceClientId, targetClientId, sourceHandle = null, targetHandle = null) => {
    if (sourceClientId === targetClientId) return;
    const existing = get().graphEdges.find(
      (e) => e.source === sourceClientId && e.target === targetClientId,
    );
    if (existing) return;
    if (wouldCreateMultipleIncomingEdge(get().graphEdges, sourceClientId, targetClientId)) {
      get().showToast(t("edge.parentConflict"), true);
      return;
    }
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return;
    const graphEdges = [
      ...get().graphEdges,
      {
        id: newGraphEdgeId(sourceClientId, targetClientId, sourceHandle, targetHandle),
        source: sourceClientId,
        target: targetClientId,
        sourceHandle,
        targetHandle,
      },
    ];
    set({
      graphNodes: deriveParentServerNodeIds(get().graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  setProvider: (provider) => {
    saveGenerationDefaultsPatch({ provider });
    set({ provider });
  },
  setQuality: (quality) => {
    saveGenerationDefaultsPatch({ quality });
    set({ quality });
  },
  setSizePreset: (sizePreset) => {
    saveGenerationDefaultsPatch({ sizePreset });
    set({ sizePreset });
  },
  setCustomSize: (w, h) =>
    set((state) => {
      const customW = parseRequestedCustomSide(w, state.customW);
      const customH = parseRequestedCustomSide(h, state.customH);
      saveGenerationDefaultsPatch({ customW, customH });
      return { customW, customH };
    }),
  setFormat: (format) => {
    saveGenerationDefaultsPatch({ format });
    set({ format });
  },
  setModeration: (moderation) => {
    saveGenerationDefaultsPatch({ moderation });
    set({ moderation });
  },
  setImageModel: (imageModel) => {
    saveImageModel(imageModel);
    set({ imageModel });
  },
  setReasoningEffort: (reasoningEffort) => {
    saveReasoningEffort(reasoningEffort);
    set({ reasoningEffort });
  },
  setWebSearchEnabled: (webSearchEnabled) => {
    saveWebSearchEnabled(webSearchEnabled);
    set({ webSearchEnabled });
  },
  setCount: (count) => {
    const next = normalizeCount(count);
    saveGenerationDefaultsPatch({ count: next });
    set({ count: next });
  },
  setMultimode: (enabled) => {
    if (enabled && get().uiMode !== "classic") return;
    saveGenerationDefaultsPatch({ multimode: enabled });
    const s = get();
    set({
      multimode: enabled,
      multimodeSequences: enabled ? s.multimodeSequences : {},
      multimodePreviewFlightId: enabled ? s.multimodePreviewFlightId : null,
    });
  },
  setMultimodeMaxImages: (count) => {
    const next = normalizeCount(count);
    saveGenerationDefaultsPatch({ multimodeMaxImages: next });
    set({ multimodeMaxImages: next });
  },
  setPromptMode: (promptMode) => {
    saveGenerationDefaultsPatch({ promptMode });
    set({ promptMode });
  },
  setPrompt: (prompt) => {
    saveGenerationDefaultsPatch({ prompt });
    set({ prompt });
  },
  insertPromptToComposer: (prompt) =>
    set((state) => {
      const exists = state.insertedPrompts.some((item) => item.id === prompt.id);
      const nextPrompt: InsertedPrompt = {
        ...prompt,
        placement: prompt.placement ?? "before",
      };
      const insertedPrompts = exists
        ? state.insertedPrompts
        : [...state.insertedPrompts, nextPrompt];
      saveGenerationDefaultsPatch({ insertedPrompts });
      return {
        insertedPrompts,
      };
    }),
  removeInsertedPromptFromComposer: (id) =>
    set((state) => {
      const insertedPrompts = state.insertedPrompts.filter((prompt) => prompt.id !== id);
      saveGenerationDefaultsPatch({ insertedPrompts });
      return { insertedPrompts };
    }),
  moveInsertedPromptInComposer: (id, direction) =>
    set((state) => {
      const before = state.insertedPrompts.filter((prompt) => prompt.placement !== "after");
      const after = state.insertedPrompts.filter((prompt) => prompt.placement === "after");
      const mainPromptMarker = { kind: "main" as const };
      const visualOrder = [
        ...before.map((prompt) => ({ kind: "prompt" as const, prompt })),
        mainPromptMarker,
        ...after.map((prompt) => ({ kind: "prompt" as const, prompt })),
      ];
      const sourceIndex = visualOrder.findIndex(
        (item) => item.kind === "prompt" && item.prompt.id === id,
      );
      if (sourceIndex < 0) return {};
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
      if (targetIndex < 0 || targetIndex >= visualOrder.length) return {};
      const [moving] = visualOrder.splice(sourceIndex, 1);
      visualOrder.splice(targetIndex, 0, moving);
      const mainIndex = visualOrder.findIndex((item) => item.kind === "main");
      const insertedPrompts = visualOrder
        .filter((item): item is { kind: "prompt"; prompt: InsertedPrompt } => item.kind === "prompt")
        .map((item, visualIndex): InsertedPrompt => ({
          ...item.prompt,
          placement: visualIndex < mainIndex ? "before" : "after",
        }));
      saveGenerationDefaultsPatch({ insertedPrompts });
      return { insertedPrompts };
    }),
  setInsertedPromptPlacement: (id, placement) =>
    set((state) => {
      const insertedPrompts = state.insertedPrompts.map((prompt) =>
        prompt.id === id ? { ...prompt, placement } : prompt,
      );
      saveGenerationDefaultsPatch({ insertedPrompts });
      return { insertedPrompts };
    }),
  clearInsertedPrompts: () => {
    saveGenerationDefaultsPatch({ insertedPrompts: [] });
    set({ insertedPrompts: [] });
  },
  startNewImageSession: () => {
    saveSelectedFilename(null);
    saveGenerationDefaultsPatch({ prompt: "", insertedPrompts: [] });
    set((state) => {
      const promptBuilderSessions = {
        ...state.promptBuilderSessions,
        [PROMPT_BUILDER_DRAFT_SCOPE.id]: [],
      };
      persistPromptBuilderSessions(promptBuilderSessions);
      return {
        currentImage: null,
        canvasOpen: false,
        referenceImages: [],
        canvasReferenceImage: null,
        prompt: "",
        insertedPrompts: [],
        multimodePreviewFlightId: null,
        promptBuilderScope: PROMPT_BUILDER_DRAFT_SCOPE,
        promptBuilderMessages: [],
        promptBuilderDraft: "",
        promptBuilderLoading: false,
        promptBuilderAttachments: [],
        promptBuilderSessions,
        unseenGeneratedCount: 0,
      };
    });
  },
  activatePromptBuilderForImage: (item) => {
    const scope = createPromptBuilderImageScope(item);
    set((state) => ({
      promptBuilderScope: scope,
      promptBuilderMessages: getPromptBuilderSessionMessages(state.promptBuilderSessions, scope),
    }));
  },
  clearPromptBuilderImageScope: () => {
    set((state) => ({
      promptBuilderScope: PROMPT_BUILDER_DRAFT_SCOPE,
      promptBuilderMessages: getPromptBuilderSessionMessages(
        state.promptBuilderSessions,
        PROMPT_BUILDER_DRAFT_SCOPE,
      ),
    }));
  },
  setPromptBuilderDraft: (promptBuilderDraft) => set({ promptBuilderDraft }),
  setPromptBuilderModel: (promptBuilderModel) => set({ promptBuilderModel }),
  addPromptBuilderAttachments: async (files) => {
    const current = get().promptBuilderAttachments;
    const room = Math.max(0, MAX_PROMPT_BUILDER_ATTACHMENTS - current.length);
    if (room === 0) return;
    const next = await Promise.all(files.slice(0, room).map(createPromptBuilderAttachment));
    set((state) => ({
      promptBuilderAttachments: [...state.promptBuilderAttachments, ...next].slice(0, MAX_PROMPT_BUILDER_ATTACHMENTS),
    }));
  },
  removePromptBuilderAttachment: (id) =>
    set((state) => ({
      promptBuilderAttachments: state.promptBuilderAttachments.filter((attachment) => attachment.id !== id),
    })),
  clearPromptBuilderAttachments: () => set({ promptBuilderAttachments: [] }),
  sendPromptBuilderMessage: async (content) => {
    const state = get();
    const attachments = state.promptBuilderAttachments;
    const text = (content ?? state.promptBuilderDraft).trim()
      || (attachments.length > 0 ? t("promptBuilder.attachmentOnlyMessage") : "");
    if (!text || state.promptBuilderLoading) return;
    const model = state.promptBuilderModel;
    const scope = state.promptBuilderScope;
    const scopeImage = findPromptBuilderScopeImage(state, scope);
    const userMessage = createPromptBuilderMessage("user", text, model, attachments);
    const messages = [
      ...getPromptBuilderSessionMessages(state.promptBuilderSessions, scope),
      userMessage,
    ];
    const promptBuilderSessions = {
      ...state.promptBuilderSessions,
      [scope.id]: messages,
    };
    persistPromptBuilderSessions(promptBuilderSessions);
    set({
      promptBuilderDraft: "",
      promptBuilderLoading: true,
      promptBuilderAttachments: [],
      promptBuilderMessages: messages,
      promptBuilderSessions,
    });
    try {
      const response = await postPromptBuilderChat({
        model,
        messages: messages.map(({ role, content: messageContent, attachments: messageAttachments }) => ({
          role,
          content: messageContent,
          attachments: messageAttachments?.map(({ kind, name, mimeType, size, dataUrl, text: attachmentText }) => ({
            kind,
            name,
            mimeType,
            size,
            dataUrl,
            text: attachmentText,
          })),
        })),
        context: {
          currentPrompt: state.prompt,
          insertedPrompts: state.insertedPrompts.map((prompt) => ({
            name: prompt.name,
            text: prompt.text,
          })),
          currentResultPrompt: scopeImage?.revisedPrompt || scopeImage?.userPrompt || scopeImage?.prompt || null,
          settings: {
            imageModel: state.imageModel,
            quality: state.quality,
            size: state.getResolvedSize(),
            format: state.format,
            moderation: state.moderation,
            promptMode: state.promptMode,
            webSearchEnabled: state.webSearchEnabled,
          },
        },
      });
      const assistantMessage = createPromptBuilderMessage(
        "assistant",
        response.message.content,
        response.model as PromptBuilderModel,
      );
      set((current) => {
        const promptBuilderMessages = [
          ...(current.promptBuilderSessions[scope.id] ?? messages),
          assistantMessage,
        ];
        const promptBuilderSessions = {
          ...current.promptBuilderSessions,
          [scope.id]: promptBuilderMessages,
        };
        persistPromptBuilderSessions(promptBuilderSessions);
        return {
          promptBuilderSessions,
          promptBuilderMessages:
            current.promptBuilderScope.id === scope.id
              ? promptBuilderMessages
              : current.promptBuilderMessages,
        };
      });
    } catch (error) {
      console.error("[PromptBuilder] chat failed", error);
      get().showToast(t("promptBuilder.failed"), true);
    } finally {
      set({ promptBuilderLoading: false });
    }
  },
  applyPromptBuilderMessageToPrompt: (messageId) => {
    const message = get().promptBuilderMessages.find((item) => item.id === messageId);
    if (!message || message.role !== "assistant") return;
    const prompt = message.content.trim();
    saveGenerationDefaultsPatch({ prompt });
    set({ prompt });
    get().showToast(t("promptBuilder.applied"));
  },
  insertPromptBuilderMessageAsBlock: (messageId) => {
    const message = get().promptBuilderMessages.find((item) => item.id === messageId);
    if (!message || message.role !== "assistant") return;
    get().insertPromptToComposer({
      id: `builder_${message.id}`,
      name: t("promptBuilder.blockName"),
      text: message.content,
      placement: "after",
    });
    get().showToast(t("promptBuilder.inserted"));
  },
  clearPromptBuilderMessages: () =>
    set((state) => {
      const promptBuilderSessions = {
        ...state.promptBuilderSessions,
        [state.promptBuilderScope.id]: [],
      };
      persistPromptBuilderSessions(promptBuilderSessions);
      return {
        promptBuilderMessages: [],
        promptBuilderSessions,
      };
    }),

  selectHistory: (item) => {
    const history = get().history;
    const target = item.canvasVersion
      ? resolveVisibleShortcutCurrent(history, item) ?? getVisibleGalleryItems(history)[0] ?? null
      : resolveVisibleShortcutCurrent(history, item) ?? item;
    saveSelectedFilename(target?.filename ?? null);
    if (!target) {
      set({ currentImage: null, unseenGeneratedCount: 0, multimodePreviewFlightId: null });
      return;
    }
    const scope = createPromptBuilderImageScope(target);
    const restoredPrompt = getHistoryComposerPrompt(target);
    const restoredInsertedPrompts = normalizeInsertedPromptArray(target.composerInsertedPrompts) ?? [];
    saveGenerationDefaultsPatch({ prompt: restoredPrompt, insertedPrompts: restoredInsertedPrompts });
    set((state) => ({
      currentImage: target,
      unseenGeneratedCount: 0,
      multimodePreviewFlightId: null,
      promptBuilderScope: scope,
      promptBuilderMessages: getPromptBuilderSessionMessages(state.promptBuilderSessions, scope),
      promptBuilderAttachments: [],
      prompt: restoredPrompt,
      insertedPrompts: restoredInsertedPrompts,
    }));
  },

  showHistorySequence: (sequenceId) => {
    const items = get().history
      .filter((item) => item.sequenceId === sequenceId && !item.canvasVersion)
      .sort((a, b) => {
        const ai = a.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
        const bi = b.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      });
    if (items.length === 0) return;
    const previewId = `history:${sequenceId}`;
    const requested = Math.max(
      items.length,
      ...items.map((item) => item.sequenceTotalRequested ?? 0),
    );
    const returned = items.length;
    const status: MultimodeSequenceStatus =
      items[0]?.sequenceStatus === "empty"
        ? "empty"
        : returned >= requested
          ? "complete"
          : "partial";
    saveSelectedFilename(null);
    set((state) => ({
      currentImage: null,
      unseenGeneratedCount: 0,
      canvasOpen: false,
      multimodePreviewFlightId: previewId,
      multimodeSequences: {
        ...state.multimodeSequences,
        [previewId]: {
          sequenceId,
          requestId: previewId,
          requested,
          returned,
          images: items,
          partials: [],
          status,
        },
      },
    }));
  },

  markGeneratedResultsSeen: () => set({ unseenGeneratedCount: 0 }),

  selectHistoryShortcutTarget: (action) => {
    const target = getShortcutTarget(get().history, get().currentImage, action);
    if (!target) return;
    get().selectHistory(target);
  },

  trashHistoryItem: async (item) => {
    const target = item.canvasVersion ? resolveVisibleShortcutCurrent(get().history, item) : item;
    if (!target || target.canvasVersion || !target.filename) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const filename = target.filename;
    const current = get().currentImage;
    const visibleCurrent = current ? resolveVisibleShortcutCurrent(get().history, current) ?? current : null;
    const removingCurrent = visibleCurrent?.filename === filename;
    const replacement = removingCurrent
      ? getNeighborAfterRemoval(get().history, filename)
      : current;
    try {
      await deleteHistoryItem(filename);
      set((s) => {
        const multimodeSequences = removeImageFromMultimodeSequences(s.multimodeSequences, filename);
        const multimodePreviewFlightId =
          s.multimodePreviewFlightId && !multimodeSequences[s.multimodePreviewFlightId]
            ? null
            : s.multimodePreviewFlightId;
        return {
          history: s.history.filter((h) => h.filename !== filename),
          currentImage: replacement,
          multimodePreviewFlightId,
          multimodeSequences,
          trashPending: null,
        };
      });
      if (removingCurrent) saveSelectedFilename(replacement?.filename ?? null);
      get().showToast(t("gallery.movedToSystemTrash", { filename }));
    } catch (err) {
      console.error("[history] trash failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  trashHistorySequence: async (sequenceId) => {
    const targets = get().history.filter((item) =>
      item.sequenceId === sequenceId && !item.canvasVersion && Boolean(item.filename),
    );
    if (targets.length === 0) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const ok = window.confirm(t("history.deleteSequenceConfirm", { count: targets.length }));
    if (!ok) return;
    const filenames = new Set(targets.map((item) => item.filename).filter((filename): filename is string => Boolean(filename)));
    const current = get().currentImage;
    const removingCurrent = Boolean(current?.filename && filenames.has(current.filename));
    const removingPreview =
      get().multimodePreviewFlightId === `history:${sequenceId}` ||
      get().multimodePreviewFlightId === sequenceId;
    try {
      for (const filename of filenames) {
        await deleteHistoryItem(filename);
      }
      set((state) => {
        const nextSequences = { ...state.multimodeSequences };
        delete nextSequences[`history:${sequenceId}`];
        delete nextSequences[sequenceId];
        return {
          history: state.history.filter((item) => !item.filename || !filenames.has(item.filename)),
          currentImage: removingCurrent ? null : state.currentImage,
          multimodePreviewFlightId: removingPreview ? null : state.multimodePreviewFlightId,
          multimodeSequences: nextSequences,
          trashPending: null,
        };
      });
      if (removingCurrent) saveSelectedFilename(null);
      get().showToast(t("history.sequenceDeleted", { count: filenames.size }));
    } catch (err) {
      console.error("[history] sequence trash failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  restorePendingTrash: async () => {
    const pending = get().trashPending;
    if (!pending) return;
    try {
      await restoreHistoryItem(pending.filename, pending.trashId);
      get().addHistoryItem(pending.item);
      set({ trashPending: null });
    } catch (err) {
      console.error("[history] restore failed", err);
      get().showToast(t("gallery.restoreFailed"), true);
    }
  },

  clearPendingTrash: () => set({ trashPending: null }),

  permanentlyDeleteHistoryItemByClick: async (item) => {
    await get().permanentlyDeleteHistoryItemByShortcut(item);
  },

  permanentlyDeleteHistoryItemByShortcut: async (item) => {
    const target = item.canvasVersion ? resolveVisibleShortcutCurrent(get().history, item) : item;
    if (!target || target.canvasVersion || !target.filename) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const filename = target.filename;
    const ok = window.confirm(t("result.permanentDeleteConfirm", { filename }));
    if (!ok) return;
    const current = get().currentImage;
    const visibleCurrent = current ? resolveVisibleShortcutCurrent(get().history, current) ?? current : null;
    const removingCurrent = visibleCurrent?.filename === filename;
    const replacement = removingCurrent
      ? getNeighborAfterRemoval(get().history, filename)
      : current;
    try {
      await permanentlyDeleteHistoryItem(filename);
      set((s) => ({
        history: s.history.filter((h) => h.filename !== filename),
        currentImage: replacement,
        trashPending:
          s.trashPending?.filename === filename ? null : s.trashPending,
      }));
      if (removingCurrent) saveSelectedFilename(replacement?.filename ?? null);
      get().showToast(t("gallery.permanentDeleted", { filename }));
    } catch (err) {
      console.error("[history] permanent delete failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  removeFromHistory: (filename) => {
    const s = get();
    const history = s.history.filter((h) => h.filename !== filename);
    const stillCurrent =
      s.currentImage && s.currentImage.filename === filename ? null : s.currentImage;
    set({ history, currentImage: stillCurrent });
    if (stillCurrent === null) saveSelectedFilename(null);
  },

  addHistoryItem: (item) => {
    const s = get();
    const withDefaults: GenerateItem = {
      ...item,
      createdAt: item.createdAt || Date.now(),
    };
    const existing = findHistoryDuplicate(s.history, withDefaults);
    const merged = preserveHistoryMetadata(withDefaults, existing);
    const historyWithoutDuplicate = withoutHistoryDuplicate(s.history, merged);
    set({
      history: retainHistoryItems([merged, ...historyWithoutDuplicate], s.loadedHistoryRetainLimit + 1),
      loadedHistoryRetainLimit: Math.max(
        s.loadedHistoryRetainLimit,
        Math.min(s.history.length + 1, s.loadedHistoryRetainLimit + 1),
      ),
    });
  },

  importLocalImageToHistory: async (file) => {
    if (!file.type || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      get().showToast(t("toast.localImportInvalid"), true);
      return null;
    }
    try {
      const item = await importLocalImage(file);
      get().addHistoryItem(item);
      const scope = createPromptBuilderImageScope(item);
      set((state) => ({
        currentImage: item,
        unseenGeneratedCount: 0,
        promptBuilderScope: scope,
        promptBuilderMessages: getPromptBuilderSessionMessages(state.promptBuilderSessions, scope),
      }));
      if (item.filename) saveSelectedFilename(item.filename);
      get().showToast(t("toast.localImportSuccess"));
      return item;
    } catch {
      get().showToast(t("toast.localImportFailed"), true);
      return null;
    }
  },

  getResolvedSize: () => {
    const { sizePreset, customW, customH } = get();
    return sizePreset === "custom" ? `${customW}x${customH}` : sizePreset;
  },

  async generate() {
    const s = get();
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    const useMultimode = s.uiMode === "classic" && s.multimode;
    const pending = getCustomSizeConfirmation(s, { kind: useMultimode ? "multimode" : "classic" });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    if (useMultimode) {
      await get().generateMultimode();
      return;
    }
    await get().runGenerate();
  },

  async generateMultimode(sizeOverride) {
    const s = get();
    if (s.uiMode !== "classic") return;
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    const composerPrompt = s.prompt;
    const composerInsertedPrompts = cloneInsertedPrompts(s.insertedPrompts);
    const promptBuilderScope = s.promptBuilderScope;
    const size = sizeOverride ?? s.getResolvedSize();
    const flightId = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const controller = new AbortController();
    const startedAt = Date.now();
    const requested = normalizeCount(s.multimodeMaxImages);
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      {
        id: flightId,
        prompt,
        startedAt,
        kind: "multimode",
        composerPrompt,
        composerInsertedPrompts,
        promptBuilderScope,
      },
    ];
    const initialSequence: MultimodeSequenceState = {
      sequenceId: flightId,
      requestId: flightId,
      requested,
      returned: 0,
      images: [],
      partials: [],
      status: "pending",
    };
    saveInFlight(nextInFlight);
    set({
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
      multimodeAbortControllers: { ...s.multimodeAbortControllers, [flightId]: controller },
      multimodeSequences: { ...s.multimodeSequences, [flightId]: initialSequence },
      multimodePreviewFlightId: flightId,
    });
    get().startInFlightPolling();

    try {
      const res: MultimodeGenerateResponse = await postMultimodeGenerateStream(
        {
          prompt,
          quality: s.quality,
          size,
          format: s.format,
          moderation: s.moderation,
          provider: s.provider,
          maxImages: requested,
          model: s.imageModel,
          reasoningEffort: s.reasoningEffort,
          webSearchEnabled: s.webSearchEnabled,
          requestId: flightId,
          mode: s.promptMode,
          composerPrompt,
          composerInsertedPrompts,
          ...(s.referenceImages.length
            ? { references: s.referenceImages.map(stripDataUrlPrefix) }
            : {}),
        },
        {
          onPartial: (partial) => {
            set((state) => {
              const current = state.multimodeSequences[flightId];
              if (!current) return {};
              return {
                multimodeSequences: {
                  ...state.multimodeSequences,
                  [flightId]: {
                    ...current,
                    partials: [
                      ...current.partials,
                      { image: partial.image, index: partial.index ?? null },
                    ].slice(-requested),
                  },
                },
              };
            });
          },
          onImage: (image) => {
            set((state) => {
              const current = state.multimodeSequences[flightId];
              if (!current) return {};
              const images = mergeMultimodeImages(current.images, [image]);
              if (images.length === current.images.length) return {};
              return {
                multimodeSequences: {
                  ...state.multimodeSequences,
                  [flightId]: {
                    ...current,
                    sequenceId: image.sequenceId ?? current.sequenceId,
                    returned: images.length,
                    images,
                    status: "partial",
                  },
                },
              };
            });
          },
        },
        { signal: controller.signal },
      );

      const items = res.images.map((image) => ({
        ...image,
        prompt,
        composerPrompt,
        composerInsertedPrompts,
        elapsed: Number.parseFloat(res.elapsed),
        provider: res.provider,
        usage: res.usage,
        requestId: image.requestId ?? res.requestId ?? flightId,
        quality: res.quality ?? s.quality,
        size: res.size ?? size,
        model: res.model ?? s.imageModel,
      }));
      for (const item of items) {
        await addHistory(item, set, get);
      }
      set((state) => ({
        multimodeSequences: {
          ...state.multimodeSequences,
          [flightId]: (() => {
            const current = state.multimodeSequences[flightId];
            const images = mergeMultimodeImages(current?.images ?? [], items);
            return {
              sequenceId: res.sequenceId,
              requestId: flightId,
              requested: res.requested,
              returned: images.length,
              images,
              partials: [],
              status: res.status,
              elapsed: res.elapsed,
            };
          })(),
        },
      }));
      const toastKey = res.status === "complete" ? "multimode.complete" : "multimode.partial";
      get().showToast(t(toastKey, { returned: res.returned, requested: res.requested, elapsed: res.elapsed }));
    } catch (err) {
      if ((err as Error).name === "AbortError" || isCanceledGenerationError(err)) {
        set((state) => {
          const current = state.multimodeSequences[flightId];
          if (!current) return {};
          return {
            multimodeSequences: {
              ...state.multimodeSequences,
              [flightId]: {
                ...current,
                status: "canceled",
              },
            },
          };
        });
      } else {
        set((state) => {
          const current = state.multimodeSequences[flightId];
          if (!current) return {};
          return {
            multimodeSequences: {
              ...state.multimodeSequences,
              [flightId]: { ...current, status: "error", error: (err as Error).message },
            },
          };
        });
        handleError(err, get());
      }
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set((state) => {
        const nextControllers = { ...state.multimodeAbortControllers };
        delete nextControllers[flightId];
        let nextPreview = state.multimodePreviewFlightId;
        if (nextPreview === flightId) {
          const finalStatus = state.multimodeSequences[flightId]?.status;
          const isCleanFinish = finalStatus === "complete" || finalStatus === "partial";
          if (!isCleanFinish) {
            const fallbackIds = Object.keys(nextControllers);
            nextPreview = fallbackIds.length > 0
              ? fallbackIds[fallbackIds.length - 1]
              : null;
          }
        }
        return {
          activeGenerations: Math.max(0, state.activeGenerations - 1),
          inFlight: remaining,
          multimodeAbortControllers: nextControllers,
          multimodePreviewFlightId: nextPreview,
        };
      });
    }
  },

  cancelMultimode: () => {
    const flightId = get().multimodePreviewFlightId;
    if (!flightId) return;
    get().multimodeAbortControllers[flightId]?.abort();
    void get().cancelInFlightJob(flightId);
    set((state) => {
      const current = state.multimodeSequences[flightId];
      if (!current) return {};
      return {
        multimodeSequences: {
          ...state.multimodeSequences,
          [flightId]: {
            ...current,
            status: "canceled",
          },
        },
      };
    });
  },

  async runGenerate(sizeOverride) {
    const s = get();
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    const composerPrompt = s.prompt;
    const composerInsertedPrompts = cloneInsertedPrompts(s.insertedPrompts);
    const promptBuilderScope = s.promptBuilderScope;

    const size = sizeOverride ?? s.getResolvedSize();

    const flightId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      {
        id: flightId,
        prompt,
        startedAt,
        composerPrompt,
        composerInsertedPrompts,
        promptBuilderScope,
      },
    ];
    saveInFlight(nextInFlight);
    set({
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
    });
    get().startInFlightPolling();

    try {
      const payload = {
        prompt,
        quality: s.quality,
        size,
        format: s.format,
        moderation: s.moderation,
        provider: s.provider,
        n: s.count,
        model: s.imageModel,
        reasoningEffort: s.reasoningEffort,
        webSearchEnabled: s.webSearchEnabled,
        requestId: flightId,
        mode: s.promptMode,
        composerPrompt,
        composerInsertedPrompts,
        ...(s.referenceImages.length
          ? { references: s.referenceImages.map(stripDataUrlPrefix) }
          : {}),
      };

      const res: GenerateResponse = await postGenerate(payload);

      if (isMultiResponse(res) && res.images.length > 1) {
        for (const img of res.images) {
          const item: GenerateItem = {
            image: img.image,
            filename: img.filename,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality ?? s.quality,
            size: res.size ?? size,
            model: res.model ?? s.imageModel,
          };
          await addHistory(item, set, get);
        }
        get().showToast(t("toast.generatedBatch", { count: res.images.length, elapsed: res.elapsed }));
      } else {
        let item: GenerateItem;
        if (isMultiResponse(res)) {
          const first = res.images[0];
          item = {
            image: first.image,
            filename: first.filename,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality ?? s.quality,
            size: res.size ?? size,
            model: res.model ?? s.imageModel,
          };
        } else {
          item = {
            image: res.image,
            filename: res.filename,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality ?? s.quality,
            size: res.size ?? size,
            model: res.model ?? s.imageModel,
          };
        }
        await addHistory(item, set, get);
        get().showToast(t("toast.generatedSingle", { elapsed: res.elapsed }));
      }
    } catch (err) {
      if (!isCanceledGenerationError(err)) handleError(err, get());
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({
        activeGenerations: Math.max(0, get().activeGenerations - 1),
        inFlight: remaining,
      });
    }
  },

  async confirmCustomSizeAdjustment() {
    const pending = get().customSizeConfirm;
    if (!pending) return;
    const adjustedSize = formatSize(pending.adjustedW, pending.adjustedH);
    set({
      customW: pending.adjustedW,
      customH: pending.adjustedH,
      customSizeConfirm: null,
    });
    if (pending.continuation.kind === "classic") {
      await get().runGenerate(adjustedSize);
      return;
    }
    if (pending.continuation.kind === "multimode") {
      await get().generateMultimode(adjustedSize);
      return;
    }
    if (pending.continuation.kind === "node-in-place") {
      await get().runGenerateNodeInPlace(pending.continuation.clientId, {
        sizeOverride: adjustedSize,
      });
      return;
    }
    if (pending.continuation.kind === "node-variation") {
      await get().generateNodeVariation(pending.continuation.clientId, adjustedSize);
      return;
    }
    await get().runGenerateNode(pending.continuation.clientId, adjustedSize);
  },

  cancelCustomSizeAdjustment: () => set({ customSizeConfirm: null }),

  hydrateHistory() {
    void (async () => {
      try {
        const res = await getHistory({ limit: HISTORY_LIMIT });
        const history: GenerateItem[] = res.items.map(mapHistoryItem);
        const retainedInFlight = get().inFlight.length > 0 ? get().inFlight : loadInFlight();
        const retainDraftPromptBuilderSession = shouldRetainDraftPromptBuilderSession(retainedInFlight);
        saveGenerationDefaultsPatch({ prompt: "", insertedPrompts: [] });
        saveSelectedFilename(null);
        set((state) => {
          const promptBuilderSessions = retainDraftPromptBuilderSession
            ? state.promptBuilderSessions
            : omitPromptBuilderDraftSession(state.promptBuilderSessions);
          if (promptBuilderSessions !== state.promptBuilderSessions) {
            persistPromptBuilderSessions(promptBuilderSessions);
          }
          return {
            history,
            currentImage: null,
            prompt: "",
            insertedPrompts: [],
            historyNextCursor: res.nextCursor,
            loadedHistoryRetainLimit: Math.max(HISTORY_LIMIT, history.length),
            promptBuilderScope: PROMPT_BUILDER_DRAFT_SCOPE,
            promptBuilderMessages: getPromptBuilderSessionMessages(
              promptBuilderSessions,
              PROMPT_BUILDER_DRAFT_SCOPE,
            ),
            promptBuilderSessions,
            promptBuilderAttachments: [],
            multimodePreviewFlightId: null,
          };
        });
      } catch (err) {
        console.warn("[history] load failed:", err);
      }
    })();
  },

  showToast(message, error = false) {
    const createdAt = Date.now();
    const entry = { message, error, id: createdAt + Math.random(), createdAt };
    set((s) => ({ toast: entry, toastLog: [...s.toastLog, entry] }));
  },
  dismissToast(id) {
    set((s) => {
      const toastLog = s.toastLog.filter((toast) => toast.id !== id);
      return {
        toastLog,
        toast: s.toast?.id === id ? toastLog[toastLog.length - 1] ?? null : s.toast,
      };
    });
  },
  showErrorCard(code, params) {
    const createdAt = Date.now();
    const entry = { code, fallbackMessage: params?.fallbackMessage, id: createdAt + Math.random(), createdAt };
    set((s) => ({ errorCard: entry, errorCardLog: [...s.errorCardLog, entry] }));
  },
  dismissErrorCard(id) {
    set((s) => {
      if (id == null) return { errorCard: null, errorCardLog: [] };
      const errorCardLog = s.errorCardLog.filter((card) => card.id !== id);
      return {
        errorCardLog,
        errorCard: s.errorCard?.id === id ? errorCardLog[errorCardLog.length - 1] ?? null : s.errorCard,
      };
    });
  },

  // ── Prompt Library actions (0.23) ──
  togglePromptLibrary() {
    set((s) => ({ promptLibraryOpen: !s.promptLibraryOpen }));
  },
  setPromptLibraryOpen(open) {
    set({ promptLibraryOpen: open });
  },

  async loadPromptLibrary() {
    set({ promptLibraryLoading: true });
    try {
      const data = await getPromptLibrary();
      set({ promptLibrary: { prompts: data.prompts, folders: data.folders }, promptLibraryLoading: false });
    } catch (err) {
      console.error("[PromptLibrary] load failed", err);
      set({ promptLibraryLoading: false });
    }
  },

  async savePromptToLibrary(payload) {
    try {
      await createPrompt(payload);
      await get().loadPromptLibrary();
      get().showToast(t("promptLibrary.saved"));
    } catch (err) {
      console.error("[PromptLibrary] save failed", err);
      get().showToast(t("promptLibrary.saveFailed"), true);
    }
  },

  async deletePromptFromLibrary(id) {
    try {
      await deletePrompt(id);
      await get().loadPromptLibrary();
    } catch (err) {
      console.error("[PromptLibrary] delete failed", err);
    }
  },

  async togglePromptFavorite(id) {
    try {
      await togglePromptFavorite(id);
      await get().loadPromptLibrary();
    } catch (err) {
      console.error("[PromptLibrary] favorite toggle failed", err);
    }
  },

  async importPromptsToLibrary(files) {
    try {
      const prompts: Array<{ name: string; text: string; tags: string[] }> = [];
      for (const file of files) {
        if (!/\.(txt|md|markdown)$/i.test(file.name)) continue;
        const text = await file.text();
        if (!text.trim()) continue;
        const name = file.name.replace(/\.(txt|md|markdown)$/i, "");
        prompts.push({ name: name.trim() || t("promptLibrary.untitled"), text: text.trim(), tags: [] });
      }
      if (prompts.length === 0) {
        get().showToast(t("promptLibrary.importNoValidFiles"), true);
        return;
      }
      const result = await importPromptLibrary({ prompts });
      await get().loadPromptLibrary();
      get().showToast(t("promptLibrary.imported", { count: result.promptsImported }));
    } catch (err) {
      console.error("[PromptLibrary] import failed", err);
      get().showToast(t("promptLibrary.importFailed"), true);
    }
  },

  async toggleGalleryFavorite(filename) {
    try {
      const result = await toggleGalleryFavorite(filename);
      set((s) => {
        const next = new Set(s.galleryFavorites);
        if (result.isFavorite) next.add(filename);
        else next.delete(filename);
        return { galleryFavorites: next };
      });
      // Also update history items in place
      set((s) => ({
        history: s.history.map((h) =>
          h.filename === filename ? { ...h, isFavorite: result.isFavorite } : h,
        ),
      }));
    } catch (err) {
      console.error("[GalleryFavorite] toggle failed", err);
    }
  },

  // Canvas Mode actions (0.24)
  openCanvas: () => set({ canvasOpen: true, canvasZoom: 1, canvasPanX: 0, canvasPanY: 0 }),
  closeCanvas: () => set({ canvasOpen: false }),
  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.5, Math.min(3, zoom)) }),
  resetCanvasZoom: () => set({ canvasZoom: 1, canvasPanX: 0, canvasPanY: 0 }),
  setCanvasPan: (x, y) => {
    const cap = 4000;
    set({
      canvasPanX: Math.max(-cap, Math.min(cap, x)),
      canvasPanY: Math.max(-cap, Math.min(cap, y)),
    });
  },
  resetCanvasPan: () => set({ canvasPanX: 0, canvasPanY: 0 }),
  setCanvasExportBackground: (mode) => {
    set({ canvasExportBackground: mode });
    persistCanvasExportBackground(mode, get().canvasExportMatteColor);
  },
  setCanvasExportMatteColor: (color) => {
    set({ canvasExportMatteColor: color });
    persistCanvasExportBackground(get().canvasExportBackground, color);
  },
}));

// ── Graph autosave (module-level debounce) ──
const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isSavingGraph = false;
let needsGraphSave = false;
let activeGraphSavePromise: Promise<void> | null = null;
let graphSaveSeq = 0;

function getGraphTabId(): string {
  try {
    const existing = sessionStorage.getItem(GRAPH_TAB_ID_KEY);
    if (existing) return existing;
    const next = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(GRAPH_TAB_ID_KEY, next);
    return next;
  } catch {
    return "tab_unavailable";
  }
}

// Sanitize a node's data for PUT /api/sessions/:id/graph payload.
// pending / reconciling states are *transient* — persisting them to disk
// makes reloaded graphs look like aborted work and trips reconcileGraphPending.
// This function is payload-only: the in-memory `graphNodes` is NOT touched.
function sanitizeForSave(d: ImageNodeData): Record<string, unknown> {
  const safe = { ...(d as unknown as Record<string, unknown>) };
  delete safe.referenceImages;
  delete safe.partialImageUrl;
  const shouldSanitize = d.status === "pending" || d.status === "reconciling";
  if (!shouldSanitize) return safe;
  return {
    ...safe,
    status: "empty",
    pendingRequestId: null,
    recoveryRequestId: d.pendingRequestId ?? d.recoveryRequestId ?? null,
    pendingPhase: null,
    pendingStartedAt: null,
    error: undefined,
  };
}

function serializeGraphEdgesForSave(graphEdges: GraphEdge[]): SessionGraphEdge[] {
  return graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: {
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    },
  }));
}

// Recover nodes whose asset lives on disk (via /api/history) but whose
// client-side state was lost (A sanitize, reload, HMR, conflict reload).
// Candidate = node with neither imageUrl nor serverNodeId. Match requestId
// first, then fall back to (sessionId, clientNodeId, createdAt) so stale
// retry assets do not overwrite a newer pending node.
async function recoverGraphNodesFromHistory(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
): Promise<void> {
  const sid = get().activeSessionId;
  if (!sid) return;
  const candidates = get().graphNodes.filter(
    (n) => !n.data.imageUrl && !n.data.serverNodeId,
  );
  if (candidates.length === 0) return;

  let items: Array<{
    url: string;
    createdAt: number;
    size?: string | null;
    sessionId?: string | null;
    nodeId?: string | null;
    clientNodeId?: string | null;
    requestId?: string | null;
  }> = [];
  try {
    const res = await getHistory({ sessionId: sid, limit: HISTORY_LIMIT });
    items = res.items;
  } catch {
    // History fetch failure is non-fatal — leave nodes as they are.
    return;
  }

  let changed = false;
  const next = get().graphNodes.map((n) => {
    if (n.data.imageUrl || n.data.serverNodeId) return n;
    const startedAt = n.data.pendingStartedAt ?? 0;
    const requestKey = n.data.pendingRequestId ?? n.data.recoveryRequestId ?? null;
    const byRequest = requestKey
      ? items.find(
          (h) =>
            (h.sessionId ?? null) === sid &&
            (h.requestId ?? null) === requestKey,
        )
      : null;
    const recovered = byRequest ?? items.find(
      (h) =>
        (h.sessionId ?? null) === sid &&
        (h.clientNodeId ?? null) === n.id &&
        (!startedAt || (h.createdAt ?? 0) >= startedAt),
    );
    if (!recovered) return n;
    changed = true;
    return {
      ...n,
      data: {
        ...n.data,
        status: "ready" as const,
        imageUrl: recovered.url, // canonical — jpeg/webp all covered
        serverNodeId: recovered.nodeId ?? n.data.serverNodeId,
        size: recovered.size ?? n.data.size ?? null,
        pendingRequestId: null,
        recoveryRequestId: null,
        pendingPhase: null,
        pendingStartedAt: null,
        partialImageUrl: null,
        error: undefined,
      },
    };
  });

  if (!changed) return;
  set({ graphNodes: next });
  // Persist the recovered imageUrl so future reloads don't need to re-recover.
  scheduleGraphSaveImpl(get, set, "recovery");
}

async function reloadSessionAfterConflict(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
): Promise<void> {
  const id = get().activeSessionId;
  if (!id) return;
  const { session } = await apiGetSession(id);
  const { graphNodes, graphEdges, graphVersion } = mapSessionToGraph(session);
  set({
    graphNodes,
    graphEdges,
    activeSessionGraphVersion: graphVersion,
  });
  get().showToast(t("toast.sessionReloadedElsewhere"), true);
  // A graph version conflict only proves the client saved against an older
  // version. Reload first, then repair node assets from requestId history.
  await recoverGraphNodesFromHistory(get, set).catch(() => {});
}

async function doSave(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason,
): Promise<GraphSaveResult> {
  const id = get().activeSessionId;
  const graphVersion = get().activeSessionGraphVersion;
  if (!id) return "skipped";
  if (graphVersion == null) return "skipped";
  const { graphNodes, graphEdges } = get();
  const nodes = graphNodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    data: sanitizeForSave(n.data),
  }));
  const edges = serializeGraphEdgesForSave(graphEdges);
  const saveId = `gs_${Date.now().toString(36)}_${++graphSaveSeq}`;
  try {
    const res = await saveSessionGraph(id, graphVersion, nodes, edges, {
      saveId,
      saveReason: reason,
      tabId: getGraphTabId(),
    });
    if (get().activeSessionId !== id) return "skipped";
    pruneNodeRefs(id, get().graphNodes.map((n) => n.id));
    set({ activeSessionGraphVersion: res.graphVersion });
    return "saved";
  } catch (err) {
    if ((err as { status?: number }).status === 409) {
      await reloadSessionAfterConflict(get, set);
      return "conflict";
    }
    console.warn("[sessions] save failed:", err);
    return "failed";
  }
}

async function runGraphSaveQueue(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason,
): Promise<void> {
  if (isSavingGraph) {
    needsGraphSave = true;
    if (activeGraphSavePromise) await activeGraphSavePromise;
    return;
  }

  isSavingGraph = true;
  activeGraphSavePromise = (async () => {
    let nextReason = reason;
    do {
      needsGraphSave = false;
      const result = await doSave(get, set, nextReason);
      if (result === "conflict" || result === "failed") break;
      nextReason = "queued";
    } while (needsGraphSave);
  })().finally(() => {
    isSavingGraph = false;
    activeGraphSavePromise = null;
  });

  await activeGraphSavePromise;
}

function scheduleGraphSaveImpl(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason = "debounced",
) {
  const s = get();
  if (!s.activeSessionId) return;
  if (s.sessionLoading) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runGraphSaveQueue(get, set, reason);
  }, SAVE_DEBOUNCE_MS);
}

async function flushGraphSaveImpl(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason = "manual",
) {
  let shouldSaveNow = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    shouldSaveNow = true;
  }
  if (isSavingGraph) {
    needsGraphSave = true;
    if (activeGraphSavePromise) await activeGraphSavePromise;
    return;
  }
  if (shouldSaveNow) {
    await runGraphSaveQueue(get, set, reason);
  }
}

// Synchronous-ish save on page unload via sendBeacon
// (fetch in beforeunload is not reliable in modern browsers).
export function flushGraphSaveBeacon(get: () => AppState): void {
  const s = get();
  if (!s.activeSessionId) return;
  if (s.activeSessionGraphVersion == null) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const nodes = s.graphNodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    data: sanitizeForSave(n.data),
  }));
  const edges = serializeGraphEdgesForSave(s.graphEdges);
  const url = `/api/sessions/${encodeURIComponent(s.activeSessionId)}/graph`;
  const body = JSON.stringify({ nodes, edges });
  try {
    void fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": String(s.activeSessionGraphVersion),
        "X-Ima2-Graph-Save-Id": `gs_${Date.now().toString(36)}_${++graphSaveSeq}`,
        "X-Ima2-Graph-Save-Reason": "beforeunload",
        "X-Ima2-Tab-Id": getGraphTabId(),
      },
      body,
      keepalive: true,
    });
  } catch {}
}

async function addHistory(
  item: GenerateItem,
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
): Promise<void> {
  const thumb = await compressImage(item.image).catch(() => item.image);
  const url = item.filename ? `/generated/${item.filename}` : item.image;
  const withThumb: GenerateItem = {
    ...item,
    thumb,
    url,
    createdAt: item.createdAt || Date.now(),
  };
  const state = get();
  const existing = findHistoryDuplicate(state.history, withThumb);
  const merged = preserveHistoryMetadata(withThumb, existing);
  const historyWithoutDuplicate = withoutHistoryDuplicate(state.history, merged);
  const history = retainHistoryItems(
    [merged, ...historyWithoutDuplicate],
    state.loadedHistoryRetainLimit + 1,
  );
  const scope = createPromptBuilderImageScope(merged);
  const sourceJob = state.inFlight.find((job) => job.id === merged.requestId);
  const sourceScope = sourceJob?.promptBuilderScope;
  const sourceMessages = sourceScope
    ? getPromptBuilderSessionMessages(state.promptBuilderSessions, sourceScope)
    : [];
  const targetMessages = getPromptBuilderSessionMessages(state.promptBuilderSessions, scope);
  const promptBuilderSessions =
    sourceScope &&
    sourceScope.id !== scope.id &&
    sourceMessages.length > 0 &&
    targetMessages.length === 0
      ? {
          ...state.promptBuilderSessions,
          [scope.id]: sourceMessages,
        }
      : state.promptBuilderSessions;
  if (promptBuilderSessions !== state.promptBuilderSessions) {
    persistPromptBuilderSessions(promptBuilderSessions);
  }
  saveSelectedFilename(merged.filename ?? null);
  set({
    history,
    currentImage: merged,
    promptBuilderScope: scope,
    promptBuilderSessions,
    promptBuilderMessages: getPromptBuilderSessionMessages(promptBuilderSessions, scope),
    promptBuilderAttachments: [],
    loadedHistoryRetainLimit: Math.max(
      state.loadedHistoryRetainLimit,
      Math.min(state.history.length + 1, state.loadedHistoryRetainLimit + 1),
    ),
    unseenGeneratedCount: get().unseenGeneratedCount + 1,
  });
}

export function selectCurrentSessionId(state: AppState): string | null {
  for (const item of state.history) {
    if (item.sessionId) return item.sessionId;
  }
  return null;
}
