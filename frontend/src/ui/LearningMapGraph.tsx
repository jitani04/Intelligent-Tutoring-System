import { CSSProperties, memo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, CheckCircle2, Circle, LockKeyhole, Scan } from "lucide-react";
import type { LearningMapStatus, LearningPathNode } from "../types";

const STATUS_LABELS: Record<LearningMapStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  needs_review: "Review",
  mastered: "Mastered",
};

function StatusIcon({ status, locked }: { status: LearningMapStatus; locked: boolean }) {
  if (locked) return <LockKeyhole size={12} strokeWidth={2} />;
  if (status === "mastered") return <CheckCircle2 size={12} strokeWidth={2} />;
  if (status === "needs_review") return <AlertTriangle size={12} strokeWidth={2} />;
  if (status === "in_progress") return <Circle size={12} strokeWidth={2.5} />;
  return <Circle size={12} strokeWidth={1.8} />;
}

interface LearningNodeData extends Record<string, unknown> {
  node: LearningPathNode;
  selected: boolean;
  editing: boolean;
  onSelect: (id: string) => void;
}

interface RootNodeData extends Record<string, unknown> {
  subject: string;
}

const LearningNodeCard = memo(function LearningNodeCard({
  data,
}: NodeProps<Node<LearningNodeData>>) {
  const { node, selected, editing, onSelect } = data;
  return (
    <div
      className={[
        "lmg-node",
        `lmg-node-${node.status}`,
        node.locked ? "lmg-node-locked" : "",
        selected ? "lmg-node-selected" : "",
        editing ? "lmg-node-editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(node.id)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="lmg-handle" />
      <div className="lmg-node-header">
        <span className="lmg-node-title">{node.topic}</span>
        <span
          className={[
            "lmg-node-chip",
            node.locked ? "lmg-node-chip-locked" : `lmg-node-chip-${node.status}`,
          ].join(" ")}
        >
          <StatusIcon status={node.status} locked={node.locked} />
          {node.locked ? "Prereq" : STATUS_LABELS[node.status]}
        </span>
      </div>
      {node.mastery !== null && (
        <div className="lmg-mastery-bar">
          <div className="lmg-mastery-fill" style={{ width: `${Math.round(node.mastery * 100)}%` }} />
        </div>
      )}
      {node.subtopics.slice(0, 3).map((sub, i) => (
        <span key={sub} className="lmg-subtopic" style={{ "--i": i } as CSSProperties}>
          {sub}
        </span>
      ))}
      <Handle type="source" position={Position.Right} isConnectable={false} className="lmg-handle" />
    </div>
  );
});

const RootCard = memo(function RootCard({ data }: NodeProps<Node<RootNodeData>>) {
  return (
    <div className="lmg-root">
      {data.subject}
      <Handle type="source" position={Position.Right} isConnectable={false} className="lmg-handle" />
    </div>
  );
});

const nodeTypes = { learningNode: LearningNodeCard, root: RootCard };

const NODE_W = 230;
const NODE_H = 130;
const H_GAP = 90;
const V_GAP = 20;

function computeLayout(nodes: LearningPathNode[]): Map<string, { x: number; y: number }> {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const depthCache = new Map<string, number>();

  function getDepth(id: string, visiting = new Set<string>()): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = idToNode.get(id);
    if (!node || node.prerequisiteIds.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = Math.max(...node.prerequisiteIds.map((pid) => getDepth(pid, new Set(visiting)))) + 1;
    depthCache.set(id, d);
    return d;
  }

  for (const node of nodes) getDepth(node.id);

  const cols = new Map<number, LearningPathNode[]>();
  for (const node of nodes) {
    const col = depthCache.get(node.id) ?? 0;
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col)!.push(node);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, colNodes] of cols.entries()) {
    const totalH = colNodes.length * NODE_H + (colNodes.length - 1) * V_GAP;
    colNodes.forEach((node, row) => {
      positions.set(node.id, {
        x: col * (NODE_W + H_GAP),
        y: row * (NODE_H + V_GAP) - totalH / 2,
      });
    });
  }

  return positions;
}

function buildFlowElements(
  nodes: LearningPathNode[],
  selectedNodeId: string | null,
  editingMap: boolean,
  onSelectNode: (id: string | null) => void,
  subject: string,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const positions = computeLayout(nodes);
  const nodesWithNoPrereqs = nodes.filter((n) => n.prerequisiteIds.length === 0);

  const rfNodes: Node[] = [
    {
      id: "__root__",
      position: { x: -(NODE_W + H_GAP), y: 0 },
      data: { subject } as RootNodeData,
      type: "root",
      draggable: false,
    },
    ...nodes.map((node) => ({
      id: node.id,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        node,
        selected: selectedNodeId === node.id,
        editing: editingMap,
        onSelect: onSelectNode,
      } as LearningNodeData,
      type: "learningNode",
    })),
  ];

  const edgeStyle = { stroke: "rgba(115,147,179,0.4)", strokeWidth: 1.8 };
  const markerEnd = {
    type: MarkerType.ArrowClosed,
    color: "rgba(115,147,179,0.4)",
    width: 14,
    height: 14,
  };

  const rfEdges: Edge[] = [
    ...nodesWithNoPrereqs.map((n) => ({
      id: `__root__->${n.id}`,
      source: "__root__",
      target: n.id,
      type: "smoothstep",
      style: edgeStyle,
      markerEnd,
    })),
    ...nodes.flatMap((n) =>
      n.prerequisiteIds.map((prereqId) => ({
        id: `${prereqId}->${n.id}`,
        source: prereqId,
        target: n.id,
        type: "smoothstep",
        style: edgeStyle,
        markerEnd,
      }))
    ),
  ];

  return { rfNodes, rfEdges };
}

function FitViewPanel() {
  const { fitView } = useReactFlow();
  return (
    <Panel position="bottom-right">
      <button
        aria-label="Fit graph to view"
        className="mindmap-fit-btn"
        onClick={() => void fitView({ padding: 0.08, minZoom: 0.5, duration: 400 })}
        type="button"
      >
        <Scan size={15} strokeWidth={2} />
      </button>
    </Panel>
  );
}

export interface LearningMapGraphProps {
  subject: string;
  nodes: LearningPathNode[];
  editingMap: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export function LearningMapGraph({
  subject,
  nodes,
  editingMap,
  selectedNodeId,
  onSelectNode,
}: LearningMapGraphProps) {
  const buildElements = useCallback(
    () => buildFlowElements(nodes, selectedNodeId, editingMap, onSelectNode, subject),
    [nodes, selectedNodeId, editingMap, onSelectNode, subject],
  );

  const { rfNodes: initialNodes, rfEdges: initialEdges } = buildElements();
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const { rfNodes, rfEdges } = buildElements();
    setFlowNodes(rfNodes);
    setFlowEdges(rfEdges);
  }, [buildElements, setFlowNodes, setFlowEdges]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.08, minZoom: 0.5 }}
      minZoom={0.15}
      maxZoom={2}
      onPaneClick={() => onSelectNode(null)}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.1}
        color="rgba(115,147,179,0.1)"
      />
      <FitViewPanel />
    </ReactFlow>
  );
}
