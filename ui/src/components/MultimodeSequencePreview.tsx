import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import type { GenerateItem } from "../types";

function getSequenceSlotImage(images: GenerateItem[], slotIndex: number): GenerateItem | undefined {
  const indexed = images.find((image) => image.sequenceIndex === slotIndex + 1);
  if (indexed) return indexed;
  if (images.some((image) => image.sequenceIndex != null)) return undefined;
  return images[slotIndex];
}

function getSequenceSlotPartial(
  partials: Array<{ image: string; index?: number | null }>,
  slotIndex: number,
): { image: string; index?: number | null } | undefined {
  return partials.find((item) =>
    item.index === slotIndex ||
    item.index === slotIndex + 1 ||
    item.index == null,
  );
}

export function MultimodeSequencePreview() {
  const sequence = useAppStore((s) => {
    const id = s.multimodePreviewFlightId;
    return id ? s.multimodeSequences[id] ?? null : null;
  });
  const cancelMultimode = useAppStore((s) => s.cancelMultimode);
  const activeGenerations = useAppStore((s) => s.activeGenerations);
  const selectHistory = useAppStore((s) => s.selectHistory);
  const trashHistoryItem = useAppStore((s) => s.trashHistoryItem);
  const currentImage = useAppStore((s) => s.currentImage);
  const { t } = useI18n();

  const handleSlotClick = (image: GenerateItem) => {
    selectHistory(image);
  };

  if (!sequence) return null;

  const slots = Array.from({ length: sequence.requested }, (_, index) => {
    const image = getSequenceSlotImage(sequence.images, index);
    const partial = getSequenceSlotPartial(sequence.partials, index);
    return { index, image, partial };
  });

  return (
    <section className="multimode-sequence" aria-live="polite">
      <div className="multimode-sequence__header">
        <div>
          <div className="multimode-sequence__title">{t("multimode.sequenceTitle")}</div>
          <div className="multimode-sequence__meta">
            {t("multimode.sequenceProgress", {
              returned: sequence.returned,
              requested: sequence.requested,
            })}
          </div>
        </div>
        {activeGenerations > 0 ? (
          <button type="button" className="secondary-btn" onClick={cancelMultimode}>
            {t("multimode.cancel")}
          </button>
        ) : null}
      </div>
      <div className={`multimode-sequence__grid count-${Math.min(sequence.requested, 4)}`}>
        {slots.map(({ index, image, partial }) => {
          const isActive =
            image && currentImage?.filename && image.filename === currentImage.filename;
          return (
            <article
              key={image?.filename ?? index}
              className={`multimode-sequence__slot${image ? " done" : ""}${isActive ? " active" : ""}`}
              onClick={image ? () => handleSlotClick(image) : undefined}
              role={image ? "button" : undefined}
              tabIndex={image ? 0 : undefined}
              onKeyDown={
                image
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSlotClick(image);
                      }
                    }
                  : undefined
              }
            >
              <div className="multimode-sequence__badge">
                {t("multimode.stageLabel", { index: index + 1 })}
              </div>
              {image ? (
                <>
                  <img src={image.url ?? image.image} alt={t("canvas.resultAlt")} />
                  <button
                    type="button"
                    className="multimode-sequence__delete"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void trashHistoryItem(image);
                    }}
                    aria-label={t("multimode.deleteImageAria", { index: index + 1 })}
                    title={t("multimode.deleteImageAria", { index: index + 1 })}
                  >
                    ×
                  </button>
                </>
              ) : partial ? (
                <img src={partial.image} alt={t("multimode.partialAlt")} />
              ) : (
                <div className="multimode-sequence__empty">
                  {sequence.status === "error"
                    ? t("multimode.error")
                    : sequence.status === "empty"
                      ? t("multimode.empty")
                      : sequence.status === "canceled"
                        ? t("multimode.canceled")
                        : t("multimode.generating")}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
