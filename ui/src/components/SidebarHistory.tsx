import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import type { GenerateItem } from "../types";

function getHistoryItemKey(item: GenerateItem): string {
  return item.filename ?? item.url ?? item.image;
}

type SidebarHistoryEntry =
  | { type: "image"; key: string; item: GenerateItem }
  | { type: "sequence"; key: string; sequenceId: string; items: GenerateItem[] };

const SIDEBAR_HISTORY_RENDER_LIMIT = 72;

function compareSequenceItems(a: GenerateItem, b: GenerateItem): number {
  const ai = a.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  const bi = b.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

function getSequenceThumbSlotCount(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  return 4;
}

function groupSidebarHistoryEntries(history: GenerateItem[]): SidebarHistoryEntry[] {
  const seenImages = new Set<string>();
  const sequences = new Map<string, Extract<SidebarHistoryEntry, { type: "sequence" }>>();
  const entries: SidebarHistoryEntry[] = [];
  for (const item of history) {
    if (item.canvasVersion) continue;
    if (item.sequenceId) {
      const key = `sequence:${item.sequenceId}`;
      let entry = sequences.get(item.sequenceId);
      if (!entry) {
        entry = { type: "sequence", key, sequenceId: item.sequenceId, items: [] };
        sequences.set(item.sequenceId, entry);
        entries.push(entry);
      }
      entry.items.push(item);
      continue;
    }
    const key = getHistoryItemKey(item);
    if (seenImages.has(key)) continue;
    seenImages.add(key);
    entries.push({ type: "image", key, item });
  }
  for (const entry of sequences.values()) {
    entry.items.sort(compareSequenceItems);
  }
  return entries;
}

export function SidebarHistory() {
  const history = useAppStore((s) => s.history);
  const currentImage = useAppStore((s) => s.currentImage);
  const selectHistory = useAppStore((s) => s.selectHistory);
  const showHistorySequence = useAppStore((s) => s.showHistorySequence);
  const trashHistoryItem = useAppStore((s) => s.trashHistoryItem);
  const trashHistorySequence = useAppStore((s) => s.trashHistorySequence);
  const multimodePreviewFlightId = useAppStore((s) => s.multimodePreviewFlightId);
  const openGallery = useAppStore((s) => s.openGallery);
  const thumbRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ima2.sidebarHistoryCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const { t } = useI18n();
  const activeKey = multimodePreviewFlightId?.startsWith("history:")
    ? `sequence:${multimodePreviewFlightId.slice("history:".length)}`
    : currentImage?.sequenceId
      ? `sequence:${currentImage.sequenceId}`
      : currentImage
        ? getHistoryItemKey(currentImage)
        : null;
  const visibleHistory = useMemo(
    () => groupSidebarHistoryEntries(history).slice(0, SIDEBAR_HISTORY_RENDER_LIMIT),
    [history],
  );

  useEffect(() => {
    if (!activeKey || collapsed) return;
    thumbRefs.current[activeKey]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey, collapsed, visibleHistory]);

  useEffect(() => {
    try {
      localStorage.setItem("ima2.sidebarHistoryCollapsed", collapsed ? "1" : "0");
    } catch {
      // Non-critical; private browsing or storage restrictions should not break the UI.
    }
  }, [collapsed]);

  return (
    <section
      className={`sidebar-history${collapsed ? " sidebar-history--collapsed" : ""}`}
      aria-label={t("history.recentTitle")}
    >
      <div className="sidebar-history__header">
        <span className="section-title">{t("history.recentTitle")}</span>
        <div className="sidebar-history__actions">
          <button
            type="button"
            className="sidebar-history__toggle"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? t("history.expandRecent") : t("history.collapseRecent")}
            aria-expanded={!collapsed}
          >
            {collapsed ? t("history.expandRecentShort") : t("history.collapseRecentShort")}
          </button>
        </div>
      </div>
      {collapsed ? null : (
        <div className="sidebar-history__grid">
          <button
            type="button"
            className="sidebar-history__gallery-card"
            onClick={openGallery}
            aria-label={t("history.galleryCard")}
            title={t("history.openGalleryTitle")}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          {visibleHistory.length === 0 ? (
            <button
              type="button"
              className="sidebar-history__empty"
              onClick={openGallery}
            >
              {t("history.emptyRecent")}
            </button>
          ) : null}
          {visibleHistory.map((entry) => {
            const active = activeKey === entry.key;
            if (entry.type === "sequence") {
              return (
                <div
                  key={entry.key}
                  className="sidebar-history__item"
                >
                  <button
                    ref={(node) => {
                      thumbRefs.current[entry.key] = node;
                    }}
                    type="button"
                    className={`sidebar-history__sequence${active ? " active" : ""}`}
                    onClick={() => showHistorySequence(entry.sequenceId)}
                    aria-label={t("history.selectRecent")}
                  >
                    <span
                      className={`sidebar-history__sequence-grid count-${getSequenceThumbSlotCount(entry.items.length)}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: getSequenceThumbSlotCount(entry.items.length) }).map(
                        (_, index) => {
                          const item = entry.items[index];
                          return item ? (
                            <img
                              key={getHistoryItemKey(item)}
                              src={item.thumb || item.url || item.image}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span
                              key={`sequence-placeholder-${entry.sequenceId}-${index}`}
                              className="sidebar-history__sequence-placeholder"
                            />
                          );
                        },
                      )}
                    </span>
                    <span className="sidebar-history__sequence-badge">
                      {entry.items.length}장
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-history__delete"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void trashHistorySequence(entry.sequenceId);
                    }}
                    aria-label={t("history.deleteSequenceAria", { count: entry.items.length })}
                    title={t("history.deleteSequenceAria", { count: entry.items.length })}
                  >
                    ×
                  </button>
                </div>
              );
            }
            return (
              <div
                key={entry.key}
                className="sidebar-history__item"
              >
                <button
                  ref={(node) => {
                    thumbRefs.current[entry.key] = node;
                  }}
                  type="button"
                  className={`sidebar-history__thumb${active ? " active" : ""}`}
                  onClick={() => selectHistory(entry.item)}
                  aria-label={t("history.selectRecent")}
                >
                  <img
                    src={entry.item.thumb || entry.item.url || entry.item.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <button
                  type="button"
                  className="sidebar-history__delete"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void trashHistoryItem(entry.item);
                  }}
                  aria-label={t("history.deleteImageAria")}
                  title={t("history.deleteImageAria")}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
