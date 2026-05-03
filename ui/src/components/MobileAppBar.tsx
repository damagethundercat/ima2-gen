import { useAppStore } from "../store/useAppStore";
import { ImageModelSelect } from "./ImageModelSelect";
import { useI18n } from "../i18n";
import { useIsMobile } from "../hooks/useIsMobile";
import { ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";

export function MobileAppBar() {
  const { t } = useI18n();
  const openComposeSheet = useAppStore((s) => s.openComposeSheet);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const uiModeRaw = useAppStore((s) => s.uiMode);
  const uiMode =
    uiModeRaw === "card-news" && ENABLE_CARD_NEWS_MODE ? "card-news" :
      uiModeRaw === "node" && ENABLE_NODE_MODE ? "node" :
        "classic";
  const isMobile = useIsMobile();

  if (!isMobile || settingsOpen || uiMode !== "classic") return null;

  return (
    <header className="mobile-app-bar" role="banner">
      <div className="mobile-app-bar__brand">
        <div className="logo-mark" aria-hidden="true" />
        <div className="mobile-app-bar__brand-copy">
          <span className="mobile-app-bar__title">ima2-gen</span>
          <span className="mobile-app-bar__mode">{t("appBar.modeImage")}</span>
        </div>
      </div>
      <div className="mobile-app-bar__actions">
        <ImageModelSelect variant="sidebar" />
        <button
          type="button"
          className="mobile-app-bar__icon-button"
          onClick={() => openComposeSheet("library")}
          aria-label={t("promptLibrary.title")}
          title={t("promptLibrary.title")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className="mobile-app-bar__icon-button"
          onClick={() => openComposeSheet("controls")}
          aria-label={t("appBar.controls")}
          title={t("appBar.controls")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          type="button"
          className="mobile-app-bar__generate"
          onClick={() => openComposeSheet("prompt")}
          aria-label={t("appBar.generateAria")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
          </svg>
          <span>{t("appBar.generate")}</span>
        </button>
      </div>
    </header>
  );
}
