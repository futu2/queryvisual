import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { Diagnostic } from "../../domain/diagnostics/types";
import { toFlowEdges, toFlowNodes } from "./flowAdapter";
import { QueryNode } from "./nodes/QueryNode";

const nodeTypes = {
  queryNode: QueryNode,
};

export function GraphCanvas({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const { state, dispatch } = useDocumentContext();
  const nodes = toFlowNodes(
    state.document,
    diagnostics,
    state.selectedNodeId,
  );
  const edges = toFlowEdges(state.document);

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
        onNodeDragStop={(_, node) =>
          dispatch({
            type: "set-node-position",
            nodeId: node.id,
            position: node.position,
          })
        }
        onViewportChange={(viewport) => dispatch({ type: "set-viewport", viewport })}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}
