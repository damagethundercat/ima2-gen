import { config as runtimeConfigDefault } from "../config.js";
import { DEFAULT_IMAGE_QUALITY, VALID_IMAGE_QUALITIES } from "./oauthNormalize.js";
import type { AppConfig } from "./runtimeContext.js";

type CapabilitySource = "local" | "server";

const MAX_GENERATED_IMAGES = 8;
const AGENT_COMMANDS = [
  "skill",
  "capabilities",
  "defaults",
  "gen",
  "edit",
  "multimode",
  "node generate",
  "inflight ls",
  "providers",
  "oauth status",
];

function toArray<T>(value: Iterable<T> | T[] | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return [...value];
  return Array.from(value);
}

export function buildIma2Capabilities({
  appConfig = runtimeConfigDefault,
  packageVersion,
  source,
  server = null,
}: {
  appConfig?: AppConfig;
  packageVersion: string;
  source: CapabilitySource;
  server?: string | null;
}) {
  return {
    ok: true,
    name: "ima2",
    source,
    server,
    version: packageVersion,
    commands: AGENT_COMMANDS,
    defaults: {
      oauth: {
        model: appConfig.imageModels.default,
        reasoningEffort: appConfig.imageModels.reasoningEffort,
      },
      api: {
        model: appConfig.apiProvider.defaultImageModel,
        reasoningEffort: appConfig.apiProvider.defaultReasoningEffort,
        size: appConfig.apiProvider.defaultSize,
        webSearchEnabled: appConfig.apiProvider.allowWebSearch,
      },
    },
    valid: {
      imageModels: {
        supported: toArray(appConfig.imageModels.valid),
        unsupported: toArray(appConfig.imageModels.unsupported),
      },
      reasoningEfforts: toArray(appConfig.imageModels.validReasoningEfforts),
      quality: toArray(VALID_IMAGE_QUALITIES),
    },
    defaultsMeta: {
      quality: DEFAULT_IMAGE_QUALITY,
    },
    limits: {
      maxRefCount: appConfig.limits.maxRefCount,
      maxGeneratedImages: MAX_GENERATED_IMAGES,
      maxParallel: {
        value: appConfig.limits.maxParallel,
        enforced: false,
        note: "advisory client-side queue guidance only; server-side semaphore is not enforced",
      },
    },
    guidance: {
      highQuality: "Use --quality high for requests where output fidelity matters.",
      parallelGeneration: "Run multiple ima2 gen commands as separate queued jobs; no --parallel flag is required.",
      i2i: "Use --ref for reference generation, or ima2 edit <file> --prompt \"<text>\" for image edits.",
      defaults: "Use ima2 defaults set model/reasoning for persistent defaults; request flags remain per-call overrides.",
    },
  };
}
