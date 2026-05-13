import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { OptionGroup } from "./OptionGroup";
import { SizePicker } from "./SizePicker";
import { CountPicker } from "./CountPicker";
import { CostEstimate } from "./CostEstimate";
import { ResultDockPanel } from "./ResultDockPanel";
import type { Format, Moderation, Quality } from "../types";

const FORMAT_ITEMS = [
  { value: "png" as const, label: "PNG" },
  { value: "jpeg" as const, label: "JPEG" },
  { value: "webp" as const, label: "WebP" },
];

type GenerationControlsPanelProps = {
  variant?: "panel" | "compact" | "sidebar";
};

export function GenerationControlsPanel({ variant = "panel" }: GenerationControlsPanelProps) {
  const { t } = useI18n();
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const getResolvedSize = useAppStore((s) => s.getResolvedSize);
  const format = useAppStore((s) => s.format);
  const setFormat = useAppStore((s) => s.setFormat);
  const moderation = useAppStore((s) => s.moderation);
  const setModeration = useAppStore((s) => s.setModeration);
  const multimode = useAppStore((s) => s.multimode);
  const setMultimode = useAppStore((s) => s.setMultimode);
  const multimodeMaxImages = useAppStore((s) => s.multimodeMaxImages);
  const promptMode = useAppStore((s) => s.promptMode);
  const setPromptMode = useAppStore((s) => s.setPromptMode);
  const count = useAppStore((s) => s.count);
  const uiMode = useAppStore((s) => s.uiMode);
  const showMultimodeControls = uiMode === "classic";
  const isDirectMode = promptMode === "direct";
  const isCompact = variant === "compact";
  const isSidebar = variant === "sidebar";
  const isCondensed = isCompact || isSidebar;
  const qualityItems = [
    { value: "low" as const, label: t("quality.lowLabel"), sub: t("quality.lowSub") },
    { value: "medium" as const, label: t("quality.mediumLabel"), sub: t("quality.mediumSub") },
    { value: "high" as const, label: t("quality.highLabel"), sub: t("quality.highSub") },
  ];
  const moderationItems = [
    { value: "auto" as const, label: t("moderation.autoLabel"), sub: t("moderation.autoSub") },
    {
      value: "low" as const,
      label: t("moderation.lowLabel"),
      sub: t("moderation.lowSub"),
      color: "var(--amber)",
    },
  ];
  const countLabel = multimode
    ? t("multimode.composerBadge", { count: multimodeMaxImages })
    : `${t("count.title")} ${count}`;
  const summaryText = `${quality} / ${getResolvedSize()} / ${format.toUpperCase()} / ${countLabel}`;
  const condensedClassName = isSidebar
    ? "generation-controls generation-controls--sidebar"
    : "generation-controls generation-controls--compact";

  const controls = (
    <>
      <div className="generation-controls__section">
        <OptionGroup<Quality>
          title={t("quality.title")}
          items={qualityItems}
          value={quality}
          onChange={setQuality}
        />
      </div>
      <div className="generation-controls__section generation-controls__section--wide">
        <SizePicker />
      </div>
      <div className="generation-controls__section">
        <OptionGroup<Format>
          title={t("format.title")}
          items={FORMAT_ITEMS}
          value={format}
          onChange={setFormat}
        />
      </div>
      <div className="generation-controls__section generation-controls__section--wide">
        <OptionGroup<Moderation>
          title={t("moderation.title")}
          items={moderationItems}
          value={moderation}
          onChange={setModeration}
        />
        <p className="option-help">
          {t("moderation.explain")}
        </p>
      </div>
      {showMultimodeControls && (
        <div className="generation-controls__section option-group prompt-mode-toggle">
          <button
            type="button"
            className={`prompt-mode-toggle__button${isDirectMode ? " active" : ""}`}
            aria-pressed={isDirectMode}
            title={t("prompt.directModeTitle")}
            onClick={() => setPromptMode(isDirectMode ? "auto" : "direct")}
          >
            <span>{t("prompt.directModeToggle")}</span>
            <span>{isDirectMode ? t("prompt.directModeActive") : t("prompt.directModeInactive")}</span>
          </button>
        </div>
      )}
      {showMultimodeControls && (
        <div className="generation-controls__section generation-controls__section--full option-group multimode-toggle">
          <button
            type="button"
            className={`multimode-toggle__button${multimode ? " active" : ""}`}
            aria-pressed={multimode}
            title={t("multimode.tooltip")}
            onClick={() => setMultimode(!multimode)}
          >
            <span>{t("multimode.label")}</span>
            <span>{t("multimode.shortHint")}</span>
          </button>
        </div>
      )}
      <div className="generation-controls__section">
        <CountPicker />
      </div>
      {!isCondensed ? <CostEstimate /> : null}
    </>
  );

  if (isCompact || isSidebar) {
    return (
      <details className={condensedClassName} open={isSidebar}>
        <summary className="generation-controls__summary">
          <span className="section-title">{t("panel.detailSettings")}</span>
          <span className="generation-controls__summary-meta">{summaryText}</span>
          <CostEstimate />
        </summary>
        <div className={isSidebar ? "generation-controls__sidebar-body" : "generation-controls__compact-body"}>
          <div className={isSidebar ? "generation-controls__sidebar-layout" : "generation-controls__compact-layout"}>
            <ResultDockPanel variant="compact" />
            <div className="generation-controls__settings-grid">
              {controls}
            </div>
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="generation-controls generation-controls--panel right-panel-settings" role="tabpanel">
      {controls}
    </div>
  );
}
