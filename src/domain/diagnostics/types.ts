export type DiagnosticLevel = "error" | "warning";

export interface DiagnosticRef {
  nodeId?: string;
  field?: string;
  edgeId?: string;
}

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  ref?: DiagnosticRef;
}
