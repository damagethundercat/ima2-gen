import { lazy, Suspense, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { useIsMobile } from "../hooks/useIsMobile";
import { PromptComposer } from "./PromptComposer";
import { GenerateButton } from "./GenerateButton";
import { InFlightList } from "./InFlightList";
import { GenerationControlsPanel } from "./GenerationControlsPanel";
import { ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import type { ComposeSheetTab } from "../store/useAppStore";

const LazyPromptLibraryPanel = lazy(() =>
  import("./PromptLibraryPanel").then((module) => ({ default: module.PromptLibraryPanel })),
);

const SHEET_TABS: ComposeSheetTab[] = ["prompt", "controls", "library"];

export function MobileComposeSheet() {
  const { t } = useI18n();
  const open = useAppStore((s) => s.composeSheetOpen);
  const activeTab = useAppStore((s) => s.composeSheetTab);
  const setActiveTab = useAppStore((s) => s.setComposeSheetTab);
  const close = useAppStore((s) => s.closeComposeSheet);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const uiModeRaw = useAppStore((s) => s.uiMode);
  const uiMode =
    uiModeRaw === "card-news" && ENABLE_CARD_NEWS_MODE ? "card-news" :
      uiModeRaw === "node" && ENABLE_NODE_MODE ? "node" :
        "classic";
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!isMobile || settingsOpen || uiMode !== "classic") return null;

  return (
    <>
      {open ? (
        <div
          className="compose-sheet-backdrop"
          role="button"
          aria-label={t("sheet.close")}
          onClick={close}
        />
      ) : null}
      <section
        id="mobile-generate-sheet"
        className={`compose-sheet${open ? " compose-sheet--open" : ""}`}
        role="dialog"
        aria-modal={open ? "true" : "false"}
        aria-label={t("sheet.generate")}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="compose-sheet__handle"
          onClick={close}
          aria-label={t("sheet.close")}
        />
        <div className="mobile-sheet-tabs" role="tablist" aria-label={t("sheet.generate")}>
          {SHEET_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`mobile-sheet-tabs__button${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`sheet.tabs.${tab}`)}
            </button>
          ))}
        </div>
        <div className="compose-sheet__body">
          {activeTab === "prompt" ? (
            <div className="compose-sheet__panel compose-sheet__panel--prompt" role="tabpanel">
              <PromptComposer />
              <GenerateButton />
              <InFlightList />
            </div>
          ) : activeTab === "controls" ? (
            <div className="compose-sheet__panel compose-sheet__panel--controls" role="tabpanel">
              <GenerationControlsPanel />
            </div>
          ) : (
            <div className="compose-sheet__panel compose-sheet__panel--library" role="tabpanel">
              <Suspense fallback={<div className="prompt-library-panel__loading">{t("common.loading")}</div>}>
                <LazyPromptLibraryPanel
                  variant="embedded"
                  forceOpen
                  onRequestClose={() => setActiveTab("prompt")}
                />
              </Suspense>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
