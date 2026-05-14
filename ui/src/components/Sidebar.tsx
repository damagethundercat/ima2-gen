import { UIModeSwitch } from "./UIModeSwitch";
import { InFlightList } from "./InFlightList";
import { SessionPicker } from "./SessionPicker";
import { SettingsButton } from "./SettingsButton";
import { ImageModelSelect } from "./ImageModelSelect";
import { SidebarHistory } from "./SidebarHistory";
import { CardNewsComposer } from "./card-news/CardNewsComposer";
import { useAppStore } from "../store/useAppStore";
import { ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import { useI18n } from "../i18n";

export function SidebarStack() {
  const { t } = useI18n();
  const uiModeRaw = useAppStore((s) => s.uiMode);
  const referenceImages = useAppStore((s) => s.referenceImages);
  const clearReferences = useAppStore((s) => s.clearReferences);
  const uiMode =
    uiModeRaw === "card-news" && ENABLE_CARD_NEWS_MODE ? "card-news" :
      uiModeRaw === "node" && ENABLE_NODE_MODE ? "node" :
        "classic";

  return (
    <>
      <div className="logo">
        <div className="logo-mark" aria-hidden="true" />
        <div className="logo-copy">
          <div className="logo-title">ima2-gen</div>
          <div className="logo-subtitle">gpt-image-2 studio</div>
        </div>
        <div className="logo-actions">
          <PromptLibraryButton />
          <ImageModelSelect variant="sidebar" />
          <SettingsButton />
        </div>
      </div>
      <UIModeSwitch />
      {uiMode === "classic" ? (
        <>
          <NewImageSessionButton />
          <SidebarHistory />
          <InFlightList />
        </>
      ) : uiMode === "card-news" ? (
        <>
          <CardNewsComposer />
        </>
      ) : (
        <>
          <SessionPicker />
          <SidebarHistory />
          {referenceImages.length > 0 ? (
            <div className="node-mode-ref-warning" role="status">
              <strong>{t("node.classicRefsParkedTitle")}</strong>
              <span>{t("node.classicRefsParkedBody")}</span>
              <button type="button" onClick={clearReferences}>
                {t("node.clearParkedRefs")}
              </button>
            </div>
          ) : null}
          <InFlightList />
        </>
      )}
    </>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const toggleLeftSidebar = useAppStore((s) => s.toggleLeftSidebar);

  return (
    <aside className={`sidebar${leftSidebarOpen ? "" : " collapsed"}`}>
      <button
        type="button"
        className="left-sidebar-toggle"
        aria-expanded={leftSidebarOpen}
        aria-controls="left-sidebar-body"
        onClick={toggleLeftSidebar}
        title={leftSidebarOpen ? t("panel.toggleLeftHide") : t("panel.toggleLeftShow")}
      >
        {leftSidebarOpen ? "<" : ">"}
      </button>
      <div id="left-sidebar-body" className="sidebar__scroll" hidden={!leftSidebarOpen}>
        <SidebarStack />
      </div>
    </aside>
  );
}

function NewImageSessionButton() {
  const { t } = useI18n();
  const startNewImageSession = useAppStore((s) => s.startNewImageSession);
  const currentImage = useAppStore((s) => s.currentImage);
  const multimodePreviewFlightId = useAppStore((s) => s.multimodePreviewFlightId);
  const isActive = currentImage === null && multimodePreviewFlightId === null;

  return (
    <button
      type="button"
      className={`sidebar-new-session${isActive ? " active" : ""}`}
      onClick={startNewImageSession}
      title={t("history.newImageSessionTitle")}
      aria-label={t("history.newImageSessionTitle")}
    >
      <span aria-hidden="true">+</span>
    </button>
  );
}

function PromptLibraryButton() {
  const { t } = useI18n();
  const setPromptLibraryOpen = useAppStore((s) => s.setPromptLibraryOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const openPromptLibrary = () => {
    if (!rightPanelOpen) toggleRightPanel();
    setPromptLibraryOpen(true);
  };

  return (
    <button
      type="button"
      className="settings-button"
      onClick={openPromptLibrary}
      title={t("promptLibrary.title")}
      aria-label={t("promptLibrary.title")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
