import { lazy, Suspense, useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { GenerationControlsPanel } from "./GenerationControlsPanel";

const LazyPromptLibraryPanel = lazy(() =>
  import("./PromptLibraryPanel").then((module) => ({ default: module.PromptLibraryPanel })),
);

export function RightPanel() {
  const open = useAppStore((s) => s.rightPanelOpen);
  const toggle = useAppStore((s) => s.toggleRightPanel);
  const promptLibraryOpen = useAppStore((s) => s.promptLibraryOpen);
  const togglePromptLibrary = useAppStore((s) => s.togglePromptLibrary);
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
        aria-label={t("panel.detailSettings")}
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
          className="right-panel-body"
          hidden={!open}
        >
          <div className="right-panel-tabs" role="tablist" aria-label={t("panel.detailSettings")}>
            <button
              type="button"
              role="tab"
              aria-selected={!promptLibraryOpen}
              className={`right-panel-tabs__button${promptLibraryOpen ? "" : " active"}`}
              onClick={() => {
                if (promptLibraryOpen) togglePromptLibrary();
              }}
            >
              {t("panel.detailSettings")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={promptLibraryOpen}
              className={`right-panel-tabs__button${promptLibraryOpen ? " active" : ""}`}
              onClick={() => {
                if (!promptLibraryOpen) togglePromptLibrary();
              }}
            >
              {t("promptLibrary.title")}
            </button>
          </div>
          {promptLibraryOpen ? (
            <Suspense fallback={<div className="prompt-library-panel__loading">{t("common.loading")}</div>}>
              <LazyPromptLibraryPanel variant="embedded" />
            </Suspense>
          ) : (
            <GenerationControlsPanel />
          )}
        </div>
      </aside>
    </>
  );
}
