import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useI18n } from "../i18n";
import { useAppStore, type PromptBuilderAttachment, type PromptBuilderModel } from "../store/useAppStore";
import { extractPromptBuilderFinalPrompts, type PromptBuilderFinalPromptBlock } from "../lib/promptBuilderStructuredOutput";
import type { GenerateItem } from "../types";

const PROMPT_BUILDER_MODELS: PromptBuilderModel[] = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"];

type PromptBuilderPanelProps = {
  variant?: "panel" | "sidebar";
};

function formatScopeImageName(imageKey: string): string {
  const trimmed = imageKey.split(/[\\/]/).pop() ?? imageKey;
  if (trimmed.length <= 32) return trimmed;
  return `${trimmed.slice(0, 14)}...${trimmed.slice(-12)}`;
}

function getPromptBuilderImageKey(item: GenerateItem | null | undefined): string | null {
  return item?.filename ?? item?.url ?? item?.image ?? null;
}

function getScopeImage(scope: ReturnType<typeof useAppStore.getState>["promptBuilderScope"], currentImage: GenerateItem | null, history: GenerateItem[]): GenerateItem | null {
  if (scope.kind !== "image") return null;
  const currentKey = getPromptBuilderImageKey(currentImage);
  if (currentKey === scope.imageKey) return currentImage;
  return history.find((item) => getPromptBuilderImageKey(item) === scope.imageKey) ?? null;
}

function attachmentIcon(attachment: PromptBuilderAttachment): string {
  if (attachment.kind === "image") return "IMG";
  if (attachment.kind === "text") return "TXT";
  return "FILE";
}

function getStructuredPromptTitle(t: ReturnType<typeof useI18n>["t"], prompt: PromptBuilderFinalPromptBlock): string {
  return prompt.language === "ko"
    ? t("promptBuilder.finalKoreanPrompt")
    : t("promptBuilder.finalEnglishPrompt");
}

export function PromptBuilderPanel({ variant = "panel" }: PromptBuilderPanelProps) {
  const { t } = useI18n();
  const messages = useAppStore((s) => s.promptBuilderMessages);
  const scope = useAppStore((s) => s.promptBuilderScope);
  const draft = useAppStore((s) => s.promptBuilderDraft);
  const model = useAppStore((s) => s.promptBuilderModel);
  const loading = useAppStore((s) => s.promptBuilderLoading);
  const attachments = useAppStore((s) => s.promptBuilderAttachments);
  const currentImage = useAppStore((s) => s.currentImage);
  const history = useAppStore((s) => s.history);
  const setDraft = useAppStore((s) => s.setPromptBuilderDraft);
  const setModel = useAppStore((s) => s.setPromptBuilderModel);
  const sendMessage = useAppStore((s) => s.sendPromptBuilderMessage);
  const addAttachments = useAppStore((s) => s.addPromptBuilderAttachments);
  const removeAttachment = useAppStore((s) => s.removePromptBuilderAttachment);
  const clearScopeImage = useAppStore((s) => s.clearPromptBuilderImageScope);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const insertPromptToComposer = useAppStore((s) => s.insertPromptToComposer);
  const showToast = useAppStore((s) => s.showToast);
  const applyToPrompt = useAppStore((s) => s.applyPromptBuilderMessageToPrompt);
  const insertAsBlock = useAppStore((s) => s.insertPromptBuilderMessageAsBlock);
  const clearMessages = useAppStore((s) => s.clearPromptBuilderMessages);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  const submit = () => {
    if ((!draft.trim() && attachments.length === 0) || loading) return;
    void sendMessage();
  };
  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;
    void addAttachments(files);
  };
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    handleFiles(files);
  };
  const applyStructuredPrompt = (prompt: PromptBuilderFinalPromptBlock) => {
    setPrompt(prompt.text);
    showToast(t("promptBuilder.applied"));
  };
  const insertStructuredPrompt = (messageId: string, prompt: PromptBuilderFinalPromptBlock) => {
    insertPromptToComposer({
      id: `builder_${messageId}_${prompt.language}`,
      name: getStructuredPromptTitle(t, prompt),
      text: prompt.text,
      placement: "after",
    });
    showToast(t("promptBuilder.inserted"));
  };
  const scopeImage = getScopeImage(scope, currentImage, history);
  const scopeLabel = scope.kind === "draft"
    ? t("promptBuilder.scopeDraft")
    : t("promptBuilder.scopeImage", {
        name: formatScopeImageName(scope.imageKey) || t("promptBuilder.scopeImageFallback"),
      });

  return (
    <section className={`prompt-builder prompt-builder--${variant}`} aria-label={t("promptBuilder.title")}>
      <div className="prompt-builder__header">
        <div>
          <span className="section-title">{t("promptBuilder.title")}</span>
          {scopeImage ? (
            <div className="prompt-builder__scope-card">
              <img
                className="prompt-builder__scope-thumb"
                src={scopeImage.thumb || scopeImage.url || scopeImage.image}
                alt=""
              />
              <span className="prompt-builder__scope-name">{scopeLabel}</span>
              <button
                type="button"
                className="prompt-builder__scope-remove"
                onClick={clearScopeImage}
                aria-label={t("promptBuilder.removeScopeImage")}
                title={t("promptBuilder.removeScopeImage")}
              >
                ×
              </button>
            </div>
          ) : (
            <span className="prompt-builder__scope">{scopeLabel}</span>
          )}
        </div>
        <div className="prompt-builder__header-actions">
          <div
            className="prompt-builder__model-picker"
            onBlur={(event) => {
              const nextFocus = event.relatedTarget;
              if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return;
              setModelMenuOpen(false);
            }}
          >
            <button
              type="button"
              className="prompt-builder__model-trigger"
              aria-label={t("promptBuilder.model")}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setModelMenuOpen(false);
                }
              }}
            >
              <span>{model}</span>
              <svg
                className="prompt-builder__model-chevron"
                viewBox="0 0 12 12"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {modelMenuOpen && (
              <div className="prompt-builder__model-menu" role="listbox" aria-label={t("promptBuilder.model")}>
                {PROMPT_BUILDER_MODELS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={item === model}
                    className={`prompt-builder__model-option${item === model ? " active" : ""}`}
                    onClick={() => {
                      setModel(item);
                      setModelMenuOpen(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={messagesRef} className="prompt-builder__messages">
        {messages.length === 0 && (
          <div className="prompt-builder__empty">
            {t("promptBuilder.empty")}
          </div>
        )}
        {messages.map((message) => {
          const structuredOutput = message.role === "assistant"
            ? extractPromptBuilderFinalPrompts(message.content)
            : null;
          return (
            <article
              key={message.id}
              className={`prompt-builder__message prompt-builder__message--${message.role}`}
            >
              <div className="prompt-builder__message-role">
                {message.role === "user" ? t("promptBuilder.user") : t("promptBuilder.assistant")}
              </div>
              {structuredOutput ? (
                <div className="prompt-builder__structured-prompts">
                  {structuredOutput.summary ? (
                    <p className="prompt-builder__structured-summary">{structuredOutput.summary}</p>
                  ) : null}
                  {structuredOutput.prompts.map((prompt) => (
                    <section
                      key={`${message.id}-${prompt.language}`}
                      className="prompt-builder__structured-card"
                      aria-label={getStructuredPromptTitle(t, prompt)}
                    >
                      <div className="prompt-builder__structured-card-header">
                        <strong>{getStructuredPromptTitle(t, prompt)}</strong>
                        <span>{prompt.language.toUpperCase()}</span>
                      </div>
                      <p>{prompt.text}</p>
                      <div className="prompt-builder__structured-actions">
                        <button type="button" onClick={() => applyStructuredPrompt(prompt)}>
                          {t("promptBuilder.applyToPrompt")}
                        </button>
                        <button type="button" onClick={() => insertStructuredPrompt(message.id, prompt)}>
                          {t("promptBuilder.insertAsBlock")}
                        </button>
                      </div>
                    </section>
                  ))}
                  {structuredOutput.notes ? (
                    <p className="prompt-builder__structured-notes">{structuredOutput.notes}</p>
                  ) : null}
                </div>
              ) : (
                <p>{message.content}</p>
              )}
              {message.attachments && message.attachments.length > 0 ? (
                <div className="prompt-builder__message-attachments">
                  {message.attachments.map((attachment) => (
                    <span key={attachment.id} className="prompt-builder__message-attachment">
                      {attachment.kind === "image" && attachment.dataUrl ? (
                        <img src={attachment.dataUrl} alt="" />
                      ) : (
                        <span>{attachmentIcon(attachment)}</span>
                      )}
                      <em>{attachment.name}</em>
                    </span>
                  ))}
                </div>
              ) : null}
              {message.role === "assistant" && (
                <div className="prompt-builder__message-actions">
                  <button type="button" onClick={() => applyToPrompt(message.id)}>
                    {t("promptBuilder.applyToPrompt")}
                  </button>
                  <button type="button" onClick={() => insertAsBlock(message.id)}>
                    {t("promptBuilder.insertAsBlock")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {loading && (
          <div className="prompt-builder__thinking">
            {t("promptBuilder.thinking")}
          </div>
        )}
      </div>

      <div className="prompt-builder__composer">
        {attachments.length > 0 ? (
          <div className="prompt-builder__attachments">
            {attachments.map((attachment) => (
              <span key={attachment.id} className="prompt-builder__attachment">
                {attachment.kind === "image" && attachment.dataUrl ? (
                  <img src={attachment.dataUrl} alt="" />
                ) : (
                  <span>{attachmentIcon(attachment)}</span>
                )}
                <em>{attachment.name}</em>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={t("promptBuilder.removeAttachment", { name: attachment.name })}
                  title={t("promptBuilder.removeAttachment", { name: attachment.name })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          value={draft}
          placeholder={t("promptBuilder.placeholder")}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            handleFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <div className="prompt-builder__composer-actions">
          <button
            type="button"
            className="prompt-builder__attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            aria-label={t("promptBuilder.attach")}
            title={t("promptBuilder.attach")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button type="button" className="prompt-builder__clear" onClick={clearMessages} disabled={messages.length === 0 || loading}>
            {t("promptBuilder.clear")}
          </button>
          <button type="button" className="prompt-builder__send" onClick={submit} disabled={(!draft.trim() && attachments.length === 0) || loading}>
            {loading ? t("promptBuilder.sending") : t("promptBuilder.send")}
          </button>
        </div>
      </div>
    </section>
  );
}
