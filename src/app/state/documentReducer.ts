import { createSampleDocument } from "../../domain/document/sample";
import type {
  GraphDocument,
  GraphEdge,
  GraphNode,
} from "../../domain/document/types";

export interface EditorState {
  document: GraphDocument;
  selectedNodeId: string | null;
  editorNodeId: string | null;
  activeOutputId: string | null;
}

export type EditorAction =
  | { type: "replace-document"; document: GraphDocument }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | {
      type: "set-node-position";
      nodeId: string;
      position: GraphNode["position"];
    }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null }
  | { type: "set-active-output"; nodeId: string | null };

function assertNever(action: never): never {
  throw new Error(`Unknown action: ${JSON.stringify(action)}`);
}

function firstOutputId(document: GraphDocument) {
  return document.nodes.find((node) => node.kind === "output")?.id ?? null;
}

function isOutputNodeId(document: GraphDocument, nodeId: string) {
  return document.nodes.some(
    (node) => node.id === nodeId && node.kind === "output",
  );
}

function sameTargetHandle(edge: GraphEdge, candidate: GraphEdge) {
  return (
    edge.target === candidate.target &&
    edge.targetHandle === candidate.targetHandle
  );
}

export function createInitialEditorState(
  document: GraphDocument = createSampleDocument(),
): EditorState {
  return {
    document,
    selectedNodeId: null,
    editorNodeId: null,
    activeOutputId: firstOutputId(document),
  };
}

export function documentReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "replace-document":
      return createInitialEditorState(action.document);
    case "add-node":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: [...state.document.nodes, action.node],
        },
      };
    case "replace-node":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map((node) =>
            node.id === action.node.id ? action.node : node,
          ),
        },
      };
    case "upsert-edge":
      return {
        ...state,
        document: {
          ...state.document,
          edges: [
            ...state.document.edges.filter(
              (edge) =>
                edge.id !== action.edge.id &&
                !sameTargetHandle(edge, action.edge),
            ),
            action.edge,
          ],
        },
      };
    case "set-node-position":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map((node) =>
            node.id === action.nodeId
              ? { ...node, position: action.position }
              : node,
          ),
        },
      };
    case "set-viewport":
      if (
        state.document.viewport.x === action.viewport.x &&
        state.document.viewport.y === action.viewport.y &&
        state.document.viewport.zoom === action.viewport.zoom
      ) {
        return state;
      }

      return {
        ...state,
        document: {
          ...state.document,
          viewport: action.viewport,
        },
      };
    case "open-node-editor":
      return {
        ...state,
        editorNodeId: action.nodeId,
      };
    case "select-node":
      return {
        ...state,
        selectedNodeId: action.nodeId,
      };
    case "set-active-output":
      return {
        ...state,
        activeOutputId:
          action.nodeId === null
            ? null
            : isOutputNodeId(state.document, action.nodeId)
              ? action.nodeId
              : state.activeOutputId,
      };
    default:
      return assertNever(action);
  }
}
