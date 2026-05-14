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
          <div className="logo-title">ima2-genX</div>
          <div className="logo-subtitle">gpt-image-2 studio</div>
        </div>
        <div className="logo-actions">
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
