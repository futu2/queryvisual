import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphNode } from "../document/types";
import type { ColumnMap } from "../schema/types";

export interface SemanticOutput {
  document: GraphDocument;
  outputId: string;
  outputName: string;
  orderedNodes: GraphNode[];
  nodesById: Record<string, GraphNode>;
  schemas: Record<string, ColumnMap>;
  diagnostics: Diagnostic[];
}
