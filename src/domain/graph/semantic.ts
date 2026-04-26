import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphNode } from "../document/types";
import type { ColumnMap } from "../schema/types";

export interface SemanticOutput {
  // When originating from a workspace graph, this identifies which graph was validated.
  // Legacy single-document callers leave this undefined.
  graphId?: string;
  document: GraphDocument;
  outputId: string;
  outputName: string;
  orderedNodes: GraphNode[];
  nodesById: Record<string, GraphNode>;
  schemas: Record<string, ColumnMap>;
  diagnostics: Diagnostic[];
}
