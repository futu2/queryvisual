import { createSampleWorkspace } from "../../domain/workspace/sample";
import type {
  GraphDefinition,
  GraphDocument,
  GraphEdge,
  GraphNode,
  GraphWorkspace,
} from "../../domain/document/types";

export interface EditorState {
  workspace: GraphWorkspace;
  activeGraphId: string;
  document: GraphDocument;
  selectedNodeId: string | null;
  editorNodeId: string | null;
}

export type EditorAction =
  | { type: "replace-workspace"; workspace: GraphWorkspace }
  | { type: "replace-document"; document: GraphDocument }
  | { type: "create-graph" }
  | { type: "rename-graph"; graphId: string; name: string }
  | { type: "delete-graph"; graphId: string }
  | { type: "set-active-graph"; graphId: string }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | { type: "delete-edge"; edgeId: string }
  | {
      type: "set-node-position";
      nodeId: string;
      position: GraphNode["position"];
    }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null };

function assertNever(action: never): never {
  throw new Error(`Unknown action: ${JSON.stringify(action)}`);
}

function sameTargetHandle(edge: GraphEdge, candidate: GraphEdge) {
  return (
    edge.target === candidate.target &&
    edge.targetHandle === candidate.targetHandle
  );
}

function toGraphDefinition(document: GraphDocument): GraphDefinition {
  if ("id" in document && typeof document.id === "string") {
    return document;
  }

  return {
    id: "graph-main",
    metadata: document.metadata,
    viewport: document.viewport,
    nodes: document.nodes,
    edges: document.edges,
  };
}

function toWorkspace(document: GraphDocument): GraphWorkspace {
  const graph = toGraphDefinition(document);

  return {
    version: 2,
    metadata: {
      name: graph.metadata.name,
    },
    entryGraphId: graph.id,
    graphs: [graph],
  };
}

function isWorkspaceInput(
  value: GraphWorkspace | GraphDocument,
): value is GraphWorkspace {
  return "graphs" in value && value.version === 2;
}

function getActiveGraphById(
  workspace: GraphWorkspace,
  activeGraphId: string,
): GraphDefinition | null {
  return workspace.graphs.find((graph) => graph.id === activeGraphId) ?? null;
}

function createStateFromWorkspace(workspace: GraphWorkspace): EditorState {
  const activeGraph =
    getActiveGraphById(workspace, workspace.entryGraphId) ?? workspace.graphs[0] ?? null;

  if (!activeGraph) {
    throw new Error("Workspace must include at least one graph");
  }

  return {
    workspace,
    activeGraphId: activeGraph.id,
    document: activeGraph,
    selectedNodeId: null,
    editorNodeId: null,
  };
}

function updateActiveGraph(
  state: EditorState,
  update: (graph: GraphDefinition) => GraphDefinition,
): EditorState {
  const activeGraph = getActiveGraph(state);
  if (!activeGraph) {
    return state;
  }

  const nextActiveGraph = update(activeGraph);
  return {
    ...state,
    workspace: {
      ...state.workspace,
      graphs: state.workspace.graphs.map((graph) =>
        graph.id === nextActiveGraph.id ? nextActiveGraph : graph,
      ),
    },
    document: nextActiveGraph,
  };
}

function createEmptyGraph(index: number): GraphDefinition {
  return {
    id: `graph-${crypto.randomUUID()}`,
    metadata: { name: `Graph ${index + 1}` },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

export function createInitialEditorState(
  documentOrWorkspace: GraphWorkspace | GraphDocument = createSampleWorkspace(),
): EditorState {
  if (isWorkspaceInput(documentOrWorkspace)) {
    return createStateFromWorkspace(documentOrWorkspace);
  }

  return createStateFromWorkspace(toWorkspace(documentOrWorkspace));
}

export function getActiveGraph(state: EditorState): GraphDefinition | null {
  return getActiveGraphById(state.workspace, state.activeGraphId);
}

export function documentReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "replace-workspace":
      return createInitialEditorState(action.workspace);
    case "replace-document":
      return createInitialEditorState(action.document);
    case "create-graph": {
      const nextGraph = createEmptyGraph(state.workspace.graphs.length);
      return {
        ...state,
        workspace: {
          ...state.workspace,
          graphs: [...state.workspace.graphs, nextGraph],
        },
        activeGraphId: nextGraph.id,
        document: nextGraph,
        selectedNodeId: null,
        editorNodeId: null,
      };
    }
    case "rename-graph": {
      const graphToRename = getActiveGraphById(state.workspace, action.graphId);
      if (!graphToRename) {
        return state;
      }

      const renamedGraph: GraphDefinition = {
        ...graphToRename,
        metadata: {
          ...graphToRename.metadata,
          name: action.name,
        },
      };

      return {
        ...state,
        workspace: {
          ...state.workspace,
          graphs: state.workspace.graphs.map((graph) =>
            graph.id === action.graphId ? renamedGraph : graph,
          ),
        },
        document:
          state.activeGraphId === action.graphId ? renamedGraph : state.document,
      };
    }
    case "delete-graph": {
      if (state.workspace.graphs.length <= 1) {
        return state;
      }

      const graphExists = state.workspace.graphs.some(
        (graph) => graph.id === action.graphId,
      );
      if (!graphExists) {
        return state;
      }

      const nextGraphs = state.workspace.graphs.filter(
        (graph) => graph.id !== action.graphId,
      );
      const nextActiveGraph =
        getActiveGraphById(state.workspace, state.activeGraphId)?.id !== action.graphId
          ? getActiveGraphById(
              { ...state.workspace, graphs: nextGraphs },
              state.activeGraphId,
            )
          : nextGraphs[0];

      if (!nextActiveGraph) {
        return state;
      }

      const didSwitchActiveGraph = nextActiveGraph.id !== state.activeGraphId;

      return {
        ...state,
        workspace: {
          ...state.workspace,
          entryGraphId:
            state.workspace.entryGraphId === action.graphId
              ? nextActiveGraph.id
              : state.workspace.entryGraphId,
          graphs: nextGraphs,
        },
        activeGraphId: nextActiveGraph.id,
        document: nextActiveGraph,
        selectedNodeId: didSwitchActiveGraph ? null : state.selectedNodeId,
        editorNodeId: didSwitchActiveGraph ? null : state.editorNodeId,
      };
    }
    case "set-active-graph": {
      const nextActiveGraph = getActiveGraphById(state.workspace, action.graphId);
      if (!nextActiveGraph) {
        return state;
      }

      return {
        ...state,
        activeGraphId: nextActiveGraph.id,
        document: nextActiveGraph,
        selectedNodeId: null,
        editorNodeId: null,
      };
    }
    case "add-node":
      return updateActiveGraph(state, (graph) => ({
        ...graph,
        nodes: [...graph.nodes, action.node],
      }));
    case "replace-node":
      return updateActiveGraph(state, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === action.node.id ? action.node : node,
        ),
      }));
    case "upsert-edge":
      return updateActiveGraph(state, (graph) => ({
        ...graph,
        edges: [
          ...graph.edges.filter(
            (edge) =>
              edge.id !== action.edge.id && !sameTargetHandle(edge, action.edge),
          ),
          action.edge,
        ],
      }));
    case "delete-edge":
      return updateActiveGraph(state, (graph) => ({
        ...graph,
        edges: graph.edges.filter((edge) => edge.id !== action.edgeId),
      }));
    case "set-node-position":
      return updateActiveGraph(state, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === action.nodeId ? { ...node, position: action.position } : node,
        ),
      }));
    case "set-viewport":
      if (
        state.document.viewport.x === action.viewport.x &&
        state.document.viewport.y === action.viewport.y &&
        state.document.viewport.zoom === action.viewport.zoom
      ) {
        return state;
      }

      return updateActiveGraph(state, (graph) => ({
        ...graph,
        viewport: action.viewport,
      }));
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
    default:
      return assertNever(action);
  }
}
