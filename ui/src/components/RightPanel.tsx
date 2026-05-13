import { lazy, Suspense, useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { GenerationControlsPanel } from "./GenerationControlsPanel";
import { PromptBuilderPanel } from "./PromptBuilderPanel";
import { ENABLE_NODE_MODE } from "../lib/devMode";

const LazyPromptLibraryPanel = lazy(() =>
  import("./PromptLibraryPanel").then((module) => ({ default: module.PromptLibraryPanel })),
);

export function RightPanel() {
  const open = useAppStore((s) => s.rightPanelOpen);
  const toggle = useAppStore((s) => s.toggleRightPanel);
  const promptLibraryOpen = useAppStore((s) => s.promptLibraryOpen);
  const setPromptLibraryOpen = useAppStore((s) => s.setPromptLibraryOpen);
  const uiModeRaw = useAppStore((s) => s.uiMode);
  const { t } = useI18n();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 800px)").matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 800px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const drawerOpen = isMobile ? open : true;
  const effectiveUiMode = uiModeRaw === "node" && ENABLE_NODE_MODE ? "node" : "classic";
  const usePromptBuilderHome = (effectiveUiMode === "classic" || effectiveUiMode === "node") && !isMobile;
  const showingPromptBuilder = usePromptBuilderHome && !promptLibraryOpen;
  const primaryTabLabel = usePromptBuilderHome ? t("promptBuilder.title") : t("panel.detailSettings");
  const panelLabel = usePromptBuilderHome ? t("promptBuilder.title") : t("panel.detailSettings");

  return (
    <>
      {isMobile && open ? (
        <div
          className="right-panel-backdrop"
          role="button"
          aria-label={t("panel.closeSettings")}
          onClick={toggle}
        />
      ) : null}
      <aside
        className={`right-panel${open ? "" : " collapsed"}${isMobile && drawerOpen ? " drawer-open" : ""}`}
        aria-label={panelLabel}
      >
        {/* Mobile toggle is rendered separately by <MobileSettingsToggle /> from App.tsx
            (HT-2: lifted out of the transformed <aside> to avoid Safari fixed-descendant bugs). */}
        {!isMobile && (
          <button
            type="button"
            className="right-panel-toggle"
            aria-expanded={open}
            aria-controls="right-panel-body"
            onClick={toggle}
            title={open ? t("panel.toggleHide") : t("panel.toggleShow")}
          >
            {open ? ">" : "<"}
          </button>
        )}
        <div
          id="right-panel-body"
          className={`right-panel-body${showingPromptBuilder ? " right-panel-body--builder" : ""}`}
          hidden={!open}
        >
          <div className="right-panel-tabs" role="tablist" aria-label={t("panel.detailSettings")}>
            <button
              type="button"
              role="tab"
              aria-selected={!promptLibraryOpen}
              className={`right-panel-tabs__button${promptLibraryOpen ? "" : " active"}`}
              onClick={() => setPromptLibraryOpen(false)}
            >
              {primaryTabLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={promptLibraryOpen}
              className={`right-panel-tabs__button${promptLibraryOpen ? " active" : ""}`}
              onClick={() => setPromptLibraryOpen(true)}
            >
              {t("promptLibrary.title")}
            </button>
          </div>
          {promptLibraryOpen ? (
            <Suspense fallback={<div className="prompt-library-panel__loading">{t("common.loading")}</div>}>
              <LazyPromptLibraryPanel variant="embedded" />
            </Suspense>
          ) : usePromptBuilderHome ? (
            <div className="right-panel-builder-stack">
              <PromptBuilderPanel variant="sidebar" />
              <GenerationControlsPanel variant="sidebar" />
            </div>
          ) : (
            <GenerationControlsPanel />
          )}
        </div>
      </aside>
    </>
  );
}
