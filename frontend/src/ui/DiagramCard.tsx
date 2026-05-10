import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DiagramData } from "../types";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw }))
);

interface Props {
  diagram: DiagramData;
}

interface ExcalidrawViewportApi {
  refresh: () => void;
  // Excalidraw's imperative API type is not re-exported from the package root.
  // This view-only wrapper only needs the viewport helpers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollToContent: (...args: any[]) => void;
}

export function DiagramCard({ diagram }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const excalidrawApiRef = useRef<ExcalidrawViewportApi | null>(null);

  const initialData = useMemo(() => ({
    elements: diagram.elements,
    appState: {
      viewBackgroundColor: "transparent",
      theme: "light" as const,
      zenModeEnabled: true,
    },
  }), [diagram]);

  const fitScene = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    api.refresh();
    api.scrollToContent(diagram.elements, {
      fitToViewport: true,
      viewportZoomFactor: fullscreen ? 0.95 : 0.88,
      animate: false,
      minZoom: 0.1,
      maxZoom: 2,
    });
  }, [diagram.elements, fullscreen]);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        fitScene();
      });
    });

    function handleResize() {
      fitScene();
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener("resize", handleResize);
    };
  }, [fitScene]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const canvas = (
    <Suspense fallback={<div className="diagram-loading">Rendering diagram…</div>}>
      <Excalidraw
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api;
          fitScene();
        }}
        initialData={initialData}
        viewModeEnabled
        zenModeEnabled
        gridModeEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </Suspense>
  );

  return (
    <div className="diagram-card">
      <div className="diagram-card-header">
        {diagram.title && <span className="diagram-card-title">{diagram.title}</span>}
        <button
          className="diagram-fullscreen-btn"
          onClick={() => setFullscreen(true)}
          title="Open full screen"
          type="button"
        >
          <svg fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
          Full screen
        </button>
      </div>
      <div className="diagram-canvas">{canvas}</div>

      {fullscreen && createPortal(
        <div className="diagram-overlay" onClick={() => setFullscreen(false)}>
          <div className="diagram-overlay-inner" onClick={(e) => e.stopPropagation()}>
            <div className="diagram-overlay-header">
              <span className="diagram-overlay-title">{diagram.title}</span>
              <button
                className="diagram-overlay-close"
                onClick={() => setFullscreen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="diagram-overlay-canvas">{canvas}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
