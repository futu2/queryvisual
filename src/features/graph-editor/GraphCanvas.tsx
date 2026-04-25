import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { Diagnostic } from "../../domain/diagnostics/types";
import {
  toFlowEdges,
  toFlowNodes,
  type FlowNodeRuntime,
} from "./flowAdapter";
import { QueryNode } from "./nodes/QueryNode";

const nodeTypes = {
  queryNode: QueryNode,
};

export function GraphCanvas({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const { state, dispatch } = useDocumentContext();
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, FlowNodeRuntime>
  >({});

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
        diagnostics,
        state.selectedNodeId,
        nodeRuntimeById,
      ),
    [diagnostics, nodeRuntimeById, state.document, state.selectedNodeId],
  );
  const edges = useMemo(() => toFlowEdges(state.document), [state.document]);

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
    dispatch({ type: "select-node", nodeId: node.id });
    dispatch({ type: "open-node-editor", nodeId: node.id });
    if (node.data.node.kind === "output") {
      dispatch({ type: "set-active-output", nodeId: node.id });
    }
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
        viewport={state.document.viewport}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          dispatch({ type: "select-node", nodeId: null });
          dispatch({ type: "open-node-editor", nodeId: null });
        }}
        onNodesChange={onNodesChange}
        onViewportChange={(viewport) => dispatch({ type: "set-viewport", viewport })}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}
