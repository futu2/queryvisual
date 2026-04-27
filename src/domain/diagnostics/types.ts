export type DiagnosticLevel = "error" | "warning";

export interface DiagnosticRef {
  nodeId?: string;
  field?: string;
  edgeId?: string;
}

export interface DiagnosticContextRef {
  graphId: string;
  nodeId?: string;
  field?: string;
}

export interface DiagnosticContext {
  parent?: DiagnosticContextRef;
  child?: DiagnosticContextRef;
}

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  ref?: DiagnosticRef;
  context?: DiagnosticContext;
}
