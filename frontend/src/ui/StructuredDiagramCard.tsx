import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, Maximize2, X } from "lucide-react";

import type { StructuredDiagramData, StructuredDiagramNode, StructuredDiagramStep } from "../types";

interface Props {
  diagram: StructuredDiagramData;
  onSave?: (diagram: StructuredDiagramData) => void;
  saved?: boolean;
}

const ACTION_BTN_BASE =
  "inline-flex cursor-pointer items-center gap-[0.3rem] whitespace-nowrap rounded-[5px] border px-2 py-[0.2rem] text-[0.72rem] font-semibold transition-colors";

function HeaderText({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <div className="structured-diagram-title-block">
      <h3>{diagram.title}</h3>
      {(diagram.subtitle || diagram.emphasis) && (
        <p>
          {diagram.subtitle}
          {diagram.subtitle && diagram.emphasis ? " " : ""}
          {diagram.emphasis && <strong>{diagram.emphasis}</strong>}
        </p>
      )}
    </div>
  );
}

function FooterCallout({ diagram }: { diagram: StructuredDiagramData }) {
  if (!diagram.footer_title && !diagram.footer_text && !diagram.footer_order?.length) return null;
  return (
    <div className="structured-diagram-footer">
      {diagram.footer_title && <div className="structured-diagram-footer-title">{diagram.footer_title}</div>}
      {diagram.footer_text && <div className="structured-diagram-footer-text">{diagram.footer_text}</div>}
      {diagram.footer_order?.length ? (
        <div className="structured-diagram-footer-order">
          {diagram.footer_order.map((item, index) => (
            <span key={`${item}-${index}`}>
              {index > 0 && <span className="structured-diagram-order-arrow">-&gt;</span>}
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinearDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const items = diagram.items?.length ? diagram.items : ["A", "B", "C"];
  const isLinkedList = diagram.template === "linked_list";
  return (
    <div className="structured-linear">
      <div className="structured-linear-main">
        <div className="structured-side structured-side-left">
          {diagram.left_action && <div className="structured-action structured-action-left">{diagram.left_action}</div>}
          {diagram.left_note && <div className="structured-side-note">{diagram.left_note}</div>}
        </div>

        <div className="structured-items-wrap">
          <div className="structured-pointer-row">
            <div className="structured-pointer structured-pointer-front">
              {diagram.front_label && <span>{diagram.front_label}</span>}
              {diagram.front_label && <i />}
            </div>
            <div className="structured-pointer structured-pointer-rear">
              {diagram.rear_label && <span>{diagram.rear_label}</span>}
              {diagram.rear_label && <i />}
            </div>
          </div>
          <div className={isLinkedList ? "structured-items structured-items-linked" : "structured-items"}>
            {items.map((item, index) => (
              <div className="structured-item-with-link" key={`${item}-${index}`}>
                <div className="structured-item">{item}</div>
                {isLinkedList && index < items.length - 1 && <div className="structured-link">-&gt;</div>}
              </div>
            ))}
          </div>
          {diagram.direction_label && (
            <div className="structured-direction">
              <div className="structured-direction-line" />
              <span>{diagram.direction_label}</span>
            </div>
          )}
        </div>

        <div className="structured-side structured-side-right">
          {diagram.right_action && <div className="structured-action structured-action-right">{diagram.right_action}</div>}
          {diagram.right_note && <div className="structured-side-note structured-side-note-right">{diagram.right_note}</div>}
        </div>
      </div>
    </div>
  );
}

function StackDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const items = diagram.items?.length ? [...diagram.items].reverse() : ["Top", "...", "Base"];
  return (
    <div className="structured-stack">
      <div className="structured-stack-actions">
        {diagram.left_action && <div className="structured-action structured-action-left">{diagram.left_action}</div>}
        {diagram.right_action && <div className="structured-action structured-action-right">{diagram.right_action}</div>}
      </div>
      <div className="structured-stack-box">
        {items.map((item, index) => (
          <div className="structured-stack-item" key={`${item}-${index}`}>{item}</div>
        ))}
      </div>
      {(diagram.front_label || diagram.direction_label) && (
        <div className="structured-stack-note">
          {[diagram.front_label, diagram.direction_label].filter(Boolean).join(" - ")}
        </div>
      )}
    </div>
  );
}

function StepsDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const steps: StructuredDiagramStep[] = diagram.steps?.length
    ? diagram.steps
    : (diagram.items ?? []).map((label) => ({ label }));
  return (
    <div className="structured-steps">
      {steps.map((step, index) => (
        <div className="structured-step" key={`${step.label}-${index}`}>
          <div className="structured-step-index">{index + 1}</div>
          <div>
            <div className="structured-step-label">{step.label}</div>
            {step.detail && <div className="structured-step-detail">{step.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TreeDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const nodes: StructuredDiagramNode[] = diagram.nodes?.length
    ? diagram.nodes
    : (diagram.items ?? []).map((label, index) => ({ id: `node-${index}`, label, parent_id: index === 0 ? undefined : "node-0" }));
  const root = nodes.find((node) => !node.parent_id) ?? nodes[0];
  const children = nodes.filter((node) => node.parent_id === root?.id);
  const grandchildren = nodes.filter((node) => children.some((child) => child.id === node.parent_id));

  return (
    <div className="structured-tree">
      {root && <div className="structured-tree-node structured-tree-root">{root.label}</div>}
      {children.length > 0 && (
        <div className="structured-tree-children">
          {children.map((child) => (
            <div className="structured-tree-branch" key={child.id}>
              <div className="structured-tree-line" />
              <div className="structured-tree-node">{child.label}</div>
              {grandchildren.filter((node) => node.parent_id === child.id).map((node) => (
                <div className="structured-tree-leaf" key={node.id}>{node.label}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StructuredDiagramBody({ diagram }: { diagram: StructuredDiagramData }) {
  if (diagram.template === "stack") return <StackDiagram diagram={diagram} />;
  if (diagram.template === "tree" || diagram.template === "concept_map") return <TreeDiagram diagram={diagram} />;
  if (diagram.template === "cycle" || diagram.template === "timeline" || diagram.template === "comparison") {
    return <StepsDiagram diagram={diagram} />;
  }
  return <LinearDiagram diagram={diagram} />;
}

function StructuredDiagramSurface({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <div className="structured-diagram-surface">
      <HeaderText diagram={diagram} />
      <StructuredDiagramBody diagram={diagram} />
      <FooterCallout diagram={diagram} />
    </div>
  );
}

export function StructuredDiagramCard({ diagram, onSave, saved }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const saveButtonClasses = [
    ACTION_BTN_BASE,
    saved
      ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
      : "border-[var(--panel-border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ].join(" ");
  const fullscreenButtonClasses = [
    ACTION_BTN_BASE,
    "flex-shrink-0 border-[var(--panel-border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ].join(" ");

  return (
    <div className="structured-diagram-card">
      <div className="structured-diagram-toolbar">
        <span>{diagram.template.replaceAll("_", " ")}</span>
        <div className="inline-flex flex-shrink-0 items-center gap-[0.35rem]">
          {onSave && (
            <button
              className={saveButtonClasses}
              onClick={() => onSave(diagram)}
              title={saved ? "Saved to notes" : "Save to notes"}
              type="button"
            >
              {saved ? <BookmarkCheck size={14} strokeWidth={2} /> : <Bookmark size={14} strokeWidth={2} />}
              {saved ? "Saved" : "Save"}
            </button>
          )}
          <button
            className={fullscreenButtonClasses}
            onClick={() => setFullscreen(true)}
            title="Open full screen"
            type="button"
          >
            <Maximize2 size={14} strokeWidth={2} />
            Full screen
          </button>
        </div>
      </div>
      <StructuredDiagramSurface diagram={diagram} />

      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.6)] p-6"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-b-[var(--panel-border)] px-4 py-[0.7rem]">
              <span className="text-[0.875rem] font-bold text-[var(--text-main)]">{diagram.title}</span>
              <button
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--panel-border)] bg-transparent text-[0.85rem] text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-main)]"
                onClick={() => setFullscreen(false)}
                title="Close"
                type="button"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="structured-diagram-fullscreen">
              <StructuredDiagramSurface diagram={diagram} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
