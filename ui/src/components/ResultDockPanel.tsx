import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { getImageModelShortLabel } from "../lib/imageModels";
import { ResultActions } from "./ResultActions";

type ResultDockPanelProps = {
  variant?: "stage" | "compact";
};

function formatQualityAlias(quality: string | null | undefined): string | null {
  if (quality === "low") return "l";
  if (quality === "medium") return "m";
  if (quality === "high") return "h";
  return quality ?? null;
}

function formatSizeAlias(size: string | null | undefined): string | null {
  if (!size) return null;
  const square = size.match(/^(\d+)x\1$/);
  if (square) return `${square[1]}sq`;
  return size.replace("x", "x");
}

export function ResultDockPanel({ variant = "stage" }: ResultDockPanelProps) {
  const currentImage = useAppStore((s) => s.currentImage);
  const quality = useAppStore((s) => s.quality);
  const getResolvedSize = useAppStore((s) => s.getResolvedSize);
  const showToast = useAppStore((s) => s.showToast);
  const { t } = useI18n();

  const copyPrompt = (): void => {
    if (!currentImage?.prompt) return;
    void navigator.clipboard.writeText(currentImage.prompt);
    showToast(t("toast.promptCopied"));
  };

  if (!currentImage) {
    return (
      <aside className={`result-dock result-dock--${variant} result-dock--empty`} aria-label={t("result.currentResult")}>
        <span className="section-title">{t("result.currentResult")}</span>
        <p>{t("result.noResult")}</p>
      </aside>
    );
  }

  const meta = [
    currentImage.elapsed != null ? `${currentImage.elapsed}s` : null,
    currentImage.usage ? t("canvas.tokens", { n: currentImage.usage.total_tokens ?? "?" }) : null,
    formatQualityAlias(currentImage.quality ?? quality),
    formatSizeAlias(currentImage.size ?? getResolvedSize()),
    getImageModelShortLabel(currentImage.model),
    currentImage.provider ?? null,
  ].filter((value): value is string => Boolean(value));

  return (
    <aside className={`result-dock result-dock--${variant}`} aria-label={t("result.currentResult")}>
      <div className="result-dock__header">
        <span className="section-title">{t("result.currentResult")}</span>
        {meta.length > 0 ? <span className="result-dock__meta">{meta.join(" / ")}</span> : null}
      </div>
      <ResultActions imageOverride={currentImage} />
      {currentImage.prompt ? (
        <button type="button" className="result-dock__prompt" onClick={copyPrompt}>
          <span>{t("result.promptUsed")}</span>
          <span>{currentImage.prompt}</span>
        </button>
      ) : null}
    </aside>
  );
}
