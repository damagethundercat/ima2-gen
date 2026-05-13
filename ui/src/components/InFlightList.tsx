import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";

function truncate(s: string, max = 28) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

export function InFlightList() {
  const inFlight = useAppStore((s) => s.inFlight);
  const cancelInFlightJob = useAppStore((s) => s.cancelInFlightJob);
  const showInFlightJob = useAppStore((s) => s.showInFlightJob);
  const { t } = useI18n();

  const phaseLabels: Record<string, string> = {
    queued: t("inflight.queued"),
    streaming: t("inflight.streaming"),
    decoding: t("inflight.decoding"),
    canceling: t("inflight.canceling"),
  };

  if (inFlight.length === 0) return null;

  return (
    <ul className="in-flight-list">
      {inFlight.map((f) => {
        const phaseLabel = f.phase ? phaseLabels[f.phase] ?? f.phase : t("inflight.queued");
        const fullPrompt = f.prompt.trim().replace(/\s+/g, " ");
        const promptLabel = fullPrompt || t("inflight.noPrompt");
        return (
          <li
            key={f.id}
            className="in-flight-item"
            data-phase={f.phase ?? "queued"}
            title={promptLabel}
          >
            <button
              type="button"
              className="in-flight-open"
              onClick={() => showInFlightJob(f.id)}
              aria-label={`${phaseLabel}: ${promptLabel}`}
            >
              <span className="in-flight-prompt">{truncate(f.prompt)}</span>
              <span className="in-flight-phase">{phaseLabel}</span>
              <span className="in-flight-spinner" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="in-flight-cancel"
              onClick={() => void cancelInFlightJob(f.id)}
              disabled={f.phase === "canceling"}
              aria-label={t("inflight.cancelAria", { prompt: promptLabel })}
              title={t("common.cancel")}
            >
              x
            </button>
          </li>
        );
      })}
    </ul>
  );
}
