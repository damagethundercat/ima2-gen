import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { ResultActions } from "./ResultActions";
import { MultimodeSequencePreview } from "./MultimodeSequencePreview";
import { useI18n } from "../i18n";
import { isEditableTarget } from "../lib/domEvents";
import { getImageModelShortLabel } from "../lib/imageModels";
import type { GenerateItem } from "../types";

const LazyCanvasModeWorkspace = lazy(() =>
  import("./canvas-mode").then((module) => ({
    default: module.CanvasModeWorkspace,
  })),
);

const EMPTY_HALFTONE_COLUMNS = 52;
const EMPTY_HALFTONE_ROWS = 24;
const EMPTY_HALFTONE_MIN_SIZE = 0.65;
const EMPTY_HALFTONE_SIZE_RANGE = 4.3;
const EMPTY_HALFTONE_FRAME_MS = 80;
const VIEWER_MIN_ZOOM = 1;
const VIEWER_MAX_ZOOM = 5;
const VIEWER_ZOOM_STEP = 0.22;

type EmptyHalftonePoint = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
};

function dotFieldIntensity(x: number, y: number): number {
  const fields = [
    { x: 0.24, y: 0.30, rx: 0.24, ry: 0.22, weight: 0.60 },
    { x: 0.54, y: 0.52, rx: 0.32, ry: 0.25, weight: 0.94 },
    { x: 0.79, y: 0.35, rx: 0.23, ry: 0.21, weight: 0.58 },
    { x: 0.42, y: 0.77, rx: 0.25, ry: 0.18, weight: 0.44 },
  ];

  return Math.max(
    ...fields.map((field) => {
      const dx = (x - field.x) / field.rx;
      const dy = (y - field.y) / field.ry;
      return field.weight * Math.exp(-(dx * dx + dy * dy));
    }),
  );
}

function dotWavePhase(x: number, y: number): number {
  const diagonalBand = Math.sin((x * 1.7 + y * 0.9) * Math.PI * 2);
  const radialBand = Math.sin((Math.hypot(x - 0.52, y - 0.52) * 3.8 - x * 0.42) * Math.PI * 2);
  const lowFrequencyBand = Math.sin((x * 0.72 - y * 1.15 + 0.2) * Math.PI * 2);
  return (diagonalBand * 0.42 + radialBand * 0.42 + lowFrequencyBand * 0.16 + 1) / 2;
}

const EMPTY_HALFTONE_POINTS: EmptyHalftonePoint[] = Array.from(
  { length: EMPTY_HALFTONE_ROWS * EMPTY_HALFTONE_COLUMNS },
  (_, index) => {
    const row = Math.floor(index / EMPTY_HALFTONE_COLUMNS);
    const col = index % EMPTY_HALFTONE_COLUMNS;
    const x = col / (EMPTY_HALFTONE_COLUMNS - 1);
    const y = row / (EMPTY_HALFTONE_ROWS - 1);
    const grain = (Math.sin((col + 1) * 12.9898 + (row + 1) * 78.233) + 1) / 2;
    const wavePhase = dotWavePhase(x, y);
    const intensity = Math.max(
      0,
      Math.min(1, dotFieldIntensity(x, y) + (grain - 0.5) * 0.08),
    );
    return {
      x,
      y,
      size: EMPTY_HALFTONE_MIN_SIZE + intensity * EMPTY_HALFTONE_SIZE_RANGE,
      alpha: 0.025 + intensity * 0.53,
      phase: wavePhase,
    };
  },
);

function drawEmptyHalftone(canvas: HTMLCanvasElement, time: number, reducedMotion: boolean): void {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const t = time * 0.00062;
  for (const point of EMPTY_HALFTONE_POINTS) {
    const wave = reducedMotion
      ? 0.56
      : (Math.sin(t + point.phase * Math.PI * 2) + 1) / 2;
    const cluster = 0.54 + Math.pow(wave, 1.65) * 0.62;
    const radius = Math.max(0.45, point.size * cluster * 0.5);
    const alpha = Math.min(0.72, point.alpha * (0.26 + wave * 0.72));
    ctx.beginPath();
    ctx.arc(point.x * cssWidth, point.y * cssHeight, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(245, 247, 250, ${alpha.toFixed(3)})`;
    ctx.fill();
  }
}

function EmptyHalftoneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frame = 0;
    let lastDraw = -EMPTY_HALFTONE_FRAME_MS;
    const render = (time: number) => {
      if (time - lastDraw >= EMPTY_HALFTONE_FRAME_MS) {
        drawEmptyHalftone(canvas, time, reducedMotion);
        lastDraw = time;
      }
      if (!reducedMotion) {
        frame = window.requestAnimationFrame(render);
      }
    };
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="canvas__empty-canvas" aria-hidden="true" />;
}

function formatQualityAlias(quality: string | null | undefined): string | null {
  if (quality === "low") return "l";
  if (quality === "medium") return "m";
  if (quality === "high") return "h";
  return quality ?? null;
}

function formatSizeAlias(size: string | null | undefined): string | null {
  if (!size) return null;
  const square = size.match(/^(\d+)x\1$/);
  if (square) return `${square[1]}²`;
  return size.replace("x", "×");
}

function getClassicImageSrc(image: GenerateItem): string {
  const src = image.url ?? image.image;
  if (!image.canvasVersion || !image.canvasMergedAt || src.startsWith("data:")) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}canvasMergedAt=${image.canvasMergedAt}`;
}

function clampViewerZoom(value: number): number {
  return Math.min(VIEWER_MAX_ZOOM, Math.max(VIEWER_MIN_ZOOM, value));
}

export function Canvas() {
  const currentImage = useAppStore((s) => s.currentImage);
  const importLocalImageToHistory = useAppStore((s) => s.importLocalImageToHistory);
  const multimodeSequence = useAppStore((s) => {
    const id = s.multimodePreviewFlightId;
    return id ? s.multimodeSequences[id] ?? null : null;
  });
  const selectHistoryShortcutTarget = useAppStore((s) => s.selectHistoryShortcutTarget);
  const trashHistoryItem = useAppStore((s) => s.trashHistoryItem);
  const permanentlyDeleteHistoryItemByShortcut = useAppStore(
    (s) => s.permanentlyDeleteHistoryItemByShortcut,
  );
  const markGeneratedResultsSeen = useAppStore((s) => s.markGeneratedResultsSeen);
  const activeGenerations = useAppStore((s) => s.activeGenerations);
  const quality = useAppStore((s) => s.quality);
  const getResolvedSize = useAppStore((s) => s.getResolvedSize);
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const showToast = useAppStore((s) => s.showToast);
  const { t } = useI18n();
  const [dropActive, setDropActive] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [viewerDrag, setViewerDrag] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const copyPrompt = (): void => {
    if (!currentImage?.prompt) return;
    void navigator.clipboard.writeText(currentImage.prompt);
    showToast(t("toast.promptCopied"));
  };

  const handleViewerKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!currentImage) return;
      if (event.target !== event.currentTarget) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) {
        void permanentlyDeleteHistoryItemByShortcut(currentImage);
        return;
      }
      void trashHistoryItem(currentImage);
      return;
    }

    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) return;
    if (event.target !== event.currentTarget) return;
    if (isEditableTarget(event.target)) return;

    event.preventDefault();
    if (event.key === "ArrowLeft") selectHistoryShortcutTarget("previous");
    else if (event.key === "ArrowRight") selectHistoryShortcutTarget("next");
    else if (event.key === "Home") selectHistoryShortcutTarget("first");
    else if (event.key === "End") selectHistoryShortcutTarget("last");
  };

  const handleViewerMouseDown = (event: MouseEvent<HTMLElement>): void => {
    if (isEditableTarget(event.target)) return;
    markGeneratedResultsSeen();
    event.currentTarget.focus();
  };

  const resetViewerTransform = useCallback(() => {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
    setViewerDrag(null);
  }, []);

  const changeViewerZoom = useCallback((delta: number) => {
    setViewerZoom((current) => {
      const next = clampViewerZoom(current + delta);
      if (next <= 1) {
        setViewerPan({ x: 0, y: 0 });
        return 1;
      }
      return Number(next.toFixed(2));
    });
  }, []);

  const handleViewerWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    changeViewerZoom(event.deltaY < 0 ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP);
  };

  const handleViewerDoubleClick = (): void => {
    if (viewerZoom > 1) {
      resetViewerTransform();
      return;
    }
    setViewerZoom(2);
  };

  const handleViewerPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (viewerZoom <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setViewerDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: viewerPan.x,
      baseY: viewerPan.y,
    });
  };

  const handleViewerPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!viewerDrag || viewerDrag.pointerId !== event.pointerId) return;
    setViewerPan({
      x: viewerDrag.baseX + event.clientX - viewerDrag.startX,
      y: viewerDrag.baseY + event.clientY - viewerDrag.startY,
    });
  };

  const handleViewerPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (!viewerDrag || viewerDrag.pointerId !== event.pointerId) return;
    setViewerDrag(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleCenterDragOver = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDropActive((prev) => (prev ? prev : true));
  }, []);

  const handleCenterDragLeave = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropActive(false);
  }, []);

  const handleCenterDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>): Promise<void> => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
      setDropActive(false);
      const files = Array.from(event.dataTransfer.files).filter((file) =>
        /^image\/(png|jpeg|webp)$/.test(file.type),
      );
      if (files.length === 0) return;
      await importLocalImageToHistory(files[0]);
    },
    [importLocalImageToHistory],
  );

  const imageKey = currentImage
    ? `${currentImage.filename ?? currentImage.url ?? currentImage.image}:${currentImage.canvasMergedAt ?? ""}`
    : "";

  useEffect(() => {
    resetViewerTransform();
  }, [imageKey, resetViewerTransform]);

  if (canvasOpen && currentImage) {
    return (
      <Suspense fallback={<main className="canvas canvas--mode-open" aria-busy="true" />}>
        <LazyCanvasModeWorkspace currentImage={currentImage} />
      </Suspense>
    );
  }

  const displayQuality = formatQualityAlias(currentImage?.quality ?? quality);
  const displaySize = formatSizeAlias(currentImage?.size ?? getResolvedSize());
  const displayModel = getImageModelShortLabel(currentImage?.model);
  const imageSrc = currentImage ? getClassicImageSrc(currentImage) : null;

  return (
    <main
      className={`canvas${dropActive ? " canvas--drop-active" : ""}`}
      onDragOver={handleCenterDragOver}
      onDragLeave={handleCenterDragLeave}
      onDrop={handleCenterDrop}
    >
      {dropActive ? (
        <div className="canvas__drop-overlay" aria-hidden>
          <span className="canvas__drop-hint">{t("canvas.drop.hint")}</span>
        </div>
      ) : null}
      <div className={`progress-bar${activeGenerations > 0 ? " active" : ""}`} />
      {multimodeSequence ? (
        <MultimodeSequencePreview />
      ) : currentImage && imageSrc ? (
        <div
          className="result-container visible"
          tabIndex={0}
          onMouseDown={handleViewerMouseDown}
          onKeyDown={handleViewerKeyDown}
          aria-label={t("canvas.imageViewerAria")}
        >
          <div
            className={`canvas-annotation-frame${viewerZoom > 1 ? " canvas-annotation-frame--zoomed" : ""}`}
            onWheel={handleViewerWheel}
            onDoubleClick={handleViewerDoubleClick}
            onPointerDown={handleViewerPointerDown}
            onPointerMove={handleViewerPointerMove}
            onPointerUp={handleViewerPointerUp}
            onPointerCancel={handleViewerPointerUp}
          >
            <img
              className="result-img"
              key={imageKey}
              src={imageSrc}
              alt={t("canvas.resultAlt")}
              style={{
                transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
              }}
            />
            <div
              className="viewer-controls"
              aria-label={t("viewer.controls")}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="viewer-control-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  changeViewerZoom(-VIEWER_ZOOM_STEP);
                }}
                disabled={viewerZoom <= 1}
                aria-label={t("viewer.zoomOut")}
              >
                -
              </button>
              <button
                type="button"
                className="viewer-control-btn viewer-control-btn--label"
                onClick={(event) => {
                  event.stopPropagation();
                  resetViewerTransform();
                }}
                aria-label={t("viewer.reset")}
              >
                {Math.round(viewerZoom * 100)}%
              </button>
              <button
                type="button"
                className="viewer-control-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  changeViewerZoom(VIEWER_ZOOM_STEP);
                }}
                disabled={viewerZoom >= VIEWER_MAX_ZOOM}
                aria-label={t("viewer.zoomIn")}
              >
                +
              </button>
            </div>
          </div>
          <div className="result-meta">
            {[
              currentImage.elapsed != null ? `${currentImage.elapsed}s` : null,
              currentImage.usage
                ? t("canvas.tokens", { n: currentImage.usage.total_tokens ?? "?" })
                : null,
              displayQuality,
              displaySize,
              displayModel,
              currentImage.provider ?? null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" · ")}
          </div>
          <ResultActions />
          {currentImage.prompt ? (
            <div className="result-prompt" onClick={copyPrompt}>
              {currentImage.prompt}
            </div>
          ) : null}
        </div>
      ) : !currentImage ? (
        <div className="canvas__empty-state" aria-hidden="true">
          <div className="canvas__empty-dot-field">
            <EmptyHalftoneCanvas />
          </div>
        </div>
      ) : null}
    </main>
  );
}
