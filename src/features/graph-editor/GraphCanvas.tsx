import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
  useReactFlow,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { OutputRuntimeSnapshot } from "../output-runtime/outputRuntime";
import { useI18n } from "../i18n/I18nContext";
import {
  toFlowEdges,
  toFlowNodes,
  type FlowNodeRuntime,
} from "./flowAdapter";
import { createNode, type NodePlacementRequest } from "./nodeFactory";
import { DeletableEdge } from "./edges/DeletableEdge";
import {
  NodeEditorModal,
  type NodeEditorModalHandle,
} from "./NodeEditorModal";
import { QueryNode } from "./nodes/QueryNode";

const nodeTypes = {
  queryNode: QueryNode,
};

const edgeTypes = {
  deletableEdge: DeletableEdge,
};

type GraphCanvasProps = {
  outputRuntime: OutputRuntimeSnapshot;
  pendingNodePlacement?: NodePlacementRequest | null;
  onClearPendingNodePlacement?: () => void;
  registerEditorTransition?: (runner: (action: () => void) => void) => void;
};

export function GraphCanvas({
  outputRuntime,
  pendingNodePlacement = null,
  onClearPendingNodePlacement,
  registerEditorTransition,
}: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasContent
        outputRuntime={outputRuntime}
        pendingNodePlacement={pendingNodePlacement}
        onClearPendingNodePlacement={onClearPendingNodePlacement}
        registerEditorTransition={registerEditorTransition}
      />
    </ReactFlowProvider>
  );
}

function GraphCanvasContent({
  outputRuntime,
  pendingNodePlacement = null,
  onClearPendingNodePlacement,
  registerEditorTransition,
}: GraphCanvasProps) {
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();
  const { screenToFlowPosition } = useReactFlow();
  const [previewPosition, setPreviewPosition] =
    useState<{ x: number; y: number } | null>(null);
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, FlowNodeRuntime>
  >({});
  const nodeEditorModalRef = useRef<NodeEditorModalHandle | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const editedNode =
    state.document.nodes.find((node) => node.id === state.editorNodeId) ?? null;

  useEffect(() => {
    const liveNodeIds = new Set(state.document.nodes.map((node) => node.id));

    setNodeRuntimeById((current) => {
      const nextEntries = Object.entries(current).filter(([nodeId]) =>
        liveNodeIds.has(nodeId),
      );

      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [state.document.nodes]);

  const nodes = useMemo(
    () => {
      const flowNodes = toFlowNodes(
        state.document,
        state.workspace,
        outputRuntime.diagnostics,
        state.selectedNodeId,
        nodeRuntimeById,
        (nodeId) => dispatch({ type: "delete-node", nodeId }),
      );

      return flowNodes;
    },
    [
      dispatch,
      nodeRuntimeById,
      outputRuntime.diagnostics,
      state.document,
      state.selectedNodeId,
      state.workspace,
    ],
  );
  const edges = useMemo(
    () =>
      toFlowEdges(state.document, (edgeId) =>
        dispatch({ type: "delete-edge", edgeId }),
      ),
    [dispatch, state.document],
  );
  const editedOutputRuntime = useMemo(() => {
    if (!editedNode || editedNode.kind !== "output") {
      return null;
    }

    return {
      compileResult: outputRuntime.resultsByOutputId[editedNode.id] ?? null,
      listenerStatus: outputRuntime.listenerStatusByOutputId[editedNode.id] ?? null,
    };
  }, [editedNode, outputRuntime.listenerStatusByOutputId, outputRuntime.resultsByOutputId]);

  const runEditorTransition = useCallback(
    (action: () => void) => {
      if (editedNode && nodeEditorModalRef.current) {
        nodeEditorModalRef.current.requestClose(action);
        return;
      }

      action();
    },
    [editedNode],
  );

  useLayoutEffect(() => {
    if (!registerEditorTransition) {
      return;
    }

    registerEditorTransition(runEditorTransition);
  }, [registerEditorTransition, runEditorTransition]);

  useEffect(() => {
    if (!pendingNodePlacement || !onClearPendingNodePlacement) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClearPendingNodePlacement();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClearPendingNodePlacement, pendingNodePlacement]);

  useEffect(() => {
    if (!pendingNodePlacement) {
      setPreviewPosition(null);
    }
  }, [pendingNodePlacement]);

  const onConnect = (connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    ) {
      return;
    }

    dispatch({
      type: "upsert-edge",
      edge: {
        id: `edge-${connection.source}-${connection.target}-${connection.targetHandle}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      },
    });
  };

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (editedNode?.id === node.id) {
      return;
    }

    runEditorTransition(() => {
      dispatch({ type: "select-node", nodeId: node.id });
      dispatch({ type: "open-node-editor", nodeId: node.id });
    });
  };

  const onPaneClick = (event: MouseEvent | ReactMouseEvent) => {
    if (pendingNodePlacement) {
      const node = createNode(
        pendingNodePlacement.kind,
        state.document.nodes.length,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );

      runEditorTransition(() => {
        dispatch({ type: "add-node", node });
        dispatch({ type: "select-node", nodeId: node.id });
        dispatch({ type: "open-node-editor", nodeId: node.id });
        onClearPendingNodePlacement?.();
      });
      return;
    }

    runEditorTransition(() => {
      dispatch({ type: "select-node", nodeId: null });
      dispatch({ type: "open-node-editor", nodeId: null });
    });
  };

  const getPreviewFramePosition = (event: MouseEvent | ReactMouseEvent) => {
    const frameRect = canvasFrameRef.current?.getBoundingClientRect();

    if (!frameRect) {
      return null;
    }

    return {
      x: event.clientX - frameRect.left,
      y: event.clientY - frameRect.top,
    };
  };

  const onPaneMouseMove = (event: MouseEvent | ReactMouseEvent) => {
    if (!pendingNodePlacement) {
      return;
    }

    setPreviewPosition(getPreviewFramePosition(event));
  };

  const onPaneMouseLeave = () => {
    setPreviewPosition(null);
  };

  const onNodesChange = (changes: NodeChange[]) => {
    let runtimeChanged = false;
    const runtimeUpdates: Record<string, FlowNodeRuntime> = {};

    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) {
        runtimeChanged = true;
        runtimeUpdates[change.id] = {
          ...(runtimeUpdates[change.id] ?? nodeRuntimeById[change.id]),
          measured: change.dimensions,
        };
      }

      if (change.type === "position" && change.position) {
        dispatch({
          type: "set-node-position",
          nodeId: change.id,
          position: change.position,
        });
      }
    }

    if (!runtimeChanged) {
      return;
    }

    setNodeRuntimeById((current) => ({
      ...current,
      ...runtimeUpdates,
    }));
  };

  return (
    <div
      ref={canvasFrameRef}
      className={`graph-canvas-frame${pendingNodePlacement ? " is-placing-node" : ""}`}
    >
      {pendingNodePlacement ? (
        <div className="node-placement-hint" role="status">
          {t("nodePlacement.hint", { label: pendingNodePlacement.label })}
        </div>
      ) : null}
      {pendingNodePlacement && previewPosition ? (
        <div
          className="node-placement-preview"
          style={{
            transform: `translate(${previewPosition.x}px, ${previewPosition.y}px) translate(-50%, -50%)`,
          }}
        >
          <QueryNode
            id="pending-node-preview"
            data={{
              node: createNode(
                pendingNodePlacement.kind,
                state.document.nodes.length,
                { x: 0, y: 0 },
                "pending-node-preview",
              ),
              diagnostics: [],
              workspace: state.workspace,
              isPreview: true,
            }}
            selected={false}
            dragging={false}
          />
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        viewport={state.document.viewport}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onPaneMouseMove={onPaneMouseMove}
        onPaneMouseLeave={onPaneMouseLeave}
        onNodesChange={onNodesChange}
        onViewportChange={(viewport) => dispatch({ type: "set-viewport", viewport })}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
      {editedNode ? (
        <NodeEditorModal
          ref={nodeEditorModalRef}
          node={editedNode}
          outputRuntime={editedOutputRuntime}
          onClose={() => dispatch({ type: "open-node-editor", nodeId: null })}
          onSave={(node) => {
            dispatch({ type: "replace-node", node });
            dispatch({ type: "open-node-editor", nodeId: null });
          }}
        />
      ) : null}
    </div>
  );
}
