import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DiagramData } from "../types";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw }))
);

interface Props {
  diagram: DiagramData;
}

export function DiagramCard({ diagram }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  const initialData = useMemo(() => ({
    elements: diagram.elements,
    appState: {
      viewBackgroundColor: "transparent",
      theme: "light" as const,
    },
    scrollToContent: true,
  }), [diagram]);

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
        initialData={initialData}
        viewModeEnabled
        zenModeEnabled={false}
        gridModeEnabled={false}
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
