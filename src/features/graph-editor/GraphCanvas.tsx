import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { OutputRuntimeSnapshot } from "../output-runtime/outputRuntime";
import {
  toFlowEdges,
  toFlowNodes,
  type FlowNodeRuntime,
} from "./flowAdapter";
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
  registerEditorTransition?: (runner: (action: () => void) => void) => void;
};

export function GraphCanvas({
  outputRuntime,
  registerEditorTransition,
}: GraphCanvasProps) {
  const { state, dispatch } = useDocumentContext();
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, FlowNodeRuntime>
  >({});
  const nodeEditorModalRef = useRef<NodeEditorModalHandle | null>(null);
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
    () =>
      toFlowNodes(
        state.document,
        state.workspace,
        outputRuntime.diagnostics,
        state.selectedNodeId,
        nodeRuntimeById,
      ),
    [
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
    <div style={{ width: "100%", minHeight: 520, flex: 1 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        viewport={state.document.viewport}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() =>
          runEditorTransition(() => {
            dispatch({ type: "select-node", nodeId: null });
            dispatch({ type: "open-node-editor", nodeId: null });
          })
        }
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
