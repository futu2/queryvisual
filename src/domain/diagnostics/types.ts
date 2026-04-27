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
  // Ordered from the nearest child graph hop to the deepest failing graph location.
  // The final entry should match `child` when present.
  chain?: DiagnosticContextRef[];
}

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  ref?: DiagnosticRef;
  context?: DiagnosticContext;
}
