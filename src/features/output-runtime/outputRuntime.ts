import { useEffect, useMemo, useRef, useState } from "react";
import {
  compileOutput,
  type CompileOutputResult,
} from "../../domain/compile/compileOutput";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type {
  GraphDefinition,
  GraphDocument,
  GraphNode,
  GraphWorkspace,
} from "../../domain/document/types";

type Awaitable<T> = T | Promise<T>;
type OutputListenerName = "copyToClipboard" | "logToConsole" | "saveToLocalStorage";

export interface OutputListenerStatus {
  lastSuccessfulSql: string | null;
  lastRunAt: number | null;
  lastErrorMessage: string | null;
  lastSuccessfulSqlByListener: Record<OutputListenerName, string | null>;
  lastEnabledByListener: Record<OutputListenerName, boolean>;
}

export interface OutputRuntimeSnapshot {
  resultsByOutputId: Record<string, CompileOutputResult>;
  diagnostics: Diagnostic[];
  listenerStatusByOutputId: Record<string, OutputListenerStatus>;
}

export interface OutputRuntimeDependencies {
  clipboardWriteText: (
    sql: string,
    context: { outputId: string; outputName: string },
  ) => Awaitable<void>;
  consoleLog: (
    sql: string,
    context: { outputId: string; outputName: string },
  ) => Awaitable<void>;
  localStorageSetItem: (
    key: string,
    sql: string,
    context: { outputId: string; outputName: string },
  ) => Awaitable<void>;
  now: () => number;
}

const defaultRuntimeDependencies: OutputRuntimeDependencies = {
  clipboardWriteText: (sql) =>
    navigator.clipboard?.writeText?.(sql) ?? Promise.resolve(),
  consoleLog: (sql, context) => {
    console.log(`[QueryVisual output ${context.outputName}]`, sql);
  },
  localStorageSetItem: (key, sql) => {
    localStorage.setItem(key, sql);
  },
  now: () => Date.now(),
};

export function createInitialListenerStatus(): OutputListenerStatus {
  return {
    lastSuccessfulSql: null,
    lastRunAt: null,
    lastErrorMessage: null,
    lastSuccessfulSqlByListener: {
      copyToClipboard: null,
      logToConsole: null,
      saveToLocalStorage: null,
    },
    lastEnabledByListener: {
      copyToClipboard: false,
      logToConsole: false,
      saveToLocalStorage: false,
    },
  };
}

function listOutputNodes(document: GraphDocument) {
  return document.nodes.filter(
    (node): node is Extract<GraphNode, { kind: "output" }> =>
      node.kind === "output",
  );
}

function createEmptyGraph(graphId: string): GraphDefinition {
  return {
    id: graphId,
    metadata: { name: graphId },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

function findGraphById(
  workspace: GraphWorkspace,
  graphId: string,
): GraphDefinition | null {
  return workspace.graphs.find((graph) => graph.id === graphId) ?? null;
}

function resolveActiveGraph(
  workspace: GraphWorkspace,
  activeGraphId: string,
): GraphDefinition {
  return (
    findGraphById(workspace, activeGraphId) ??
    workspace.graphs[0] ??
    createEmptyGraph(activeGraphId)
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function compileDocumentOutputs(document: GraphDocument): Pick<
  OutputRuntimeSnapshot,
  "resultsByOutputId" | "diagnostics"
> {
  const diagnosticsByKey = new Map<string, Diagnostic>();
  const resultsByOutputId: Record<string, CompileOutputResult> = {};

  for (const outputNode of listOutputNodes(document)) {
    const result = compileOutput(document, outputNode.id);
    resultsByOutputId[outputNode.id] = result;

    for (const diagnostic of result.semantic.diagnostics) {
      diagnosticsByKey.set(stableStringify(diagnostic), diagnostic);
    }
  }

  return {
    resultsByOutputId,
    diagnostics: [...diagnosticsByKey.values()],
  };
}

function compileWorkspaceOutputs(
  workspace: GraphWorkspace,
  activeGraphId: string,
): Pick<OutputRuntimeSnapshot, "resultsByOutputId" | "diagnostics"> & {
  runtimeDocument: GraphDefinition;
} {
  const runtimeDocument = resolveActiveGraph(workspace, activeGraphId);
  const diagnosticsByKey = new Map<string, Diagnostic>();
  const resultsByOutputId: Record<string, CompileOutputResult> = {};

  for (const outputNode of listOutputNodes(runtimeDocument)) {
    const result = compileOutput(workspace, runtimeDocument.id, outputNode.id);
    resultsByOutputId[outputNode.id] = result;

    for (const diagnostic of result.semantic.diagnostics) {
      diagnosticsByKey.set(stableStringify(diagnostic), diagnostic);
    }
  }

  return {
    runtimeDocument,
    resultsByOutputId,
    diagnostics: [...diagnosticsByKey.values()],
  };
}

function normalizeListenerStatus(
  status: OutputListenerStatus | undefined,
): OutputListenerStatus {
  if (!status) {
    return createInitialListenerStatus();
  }

  const defaults = createInitialListenerStatus();
  return {
    ...defaults,
    ...status,
    lastSuccessfulSqlByListener: {
      ...defaults.lastSuccessfulSqlByListener,
      ...status.lastSuccessfulSqlByListener,
    },
    lastEnabledByListener: {
      ...defaults.lastEnabledByListener,
      ...status.lastEnabledByListener,
    },
  };
}

export async function applyOutputListeners(params: {
  document: GraphDocument;
  resultsByOutputId: Record<string, CompileOutputResult>;
  previousStatusByOutputId: Record<string, OutputListenerStatus>;
  deps?: Partial<OutputRuntimeDependencies>;
}): Promise<Record<string, OutputListenerStatus>> {
  const dependencies: OutputRuntimeDependencies = {
    ...defaultRuntimeDependencies,
    ...params.deps,
  };
  const nextStatusByOutputId: Record<string, OutputListenerStatus> = {};

  for (const outputNode of listOutputNodes(params.document)) {
    const outputId = outputNode.id;
    const previousStatus = normalizeListenerStatus(
      params.previousStatusByOutputId[outputId],
    );
    const compileResult = params.resultsByOutputId[outputId];

    if (!compileResult) {
      nextStatusByOutputId[outputId] = previousStatus;
      continue;
    }

    const sql = compileResult.sql.trim();
    const context = {
      outputId,
      outputName: outputNode.data.outputName,
    };
    const listeners = outputNode.data.listeners;
    const nextEnabledByListener: OutputListenerStatus["lastEnabledByListener"] = {
      copyToClipboard: listeners.copyToClipboard,
      logToConsole: listeners.logToConsole,
      saveToLocalStorage: listeners.saveToLocalStorage.enabled,
    };
    const nextStatus: OutputListenerStatus = {
      ...previousStatus,
      lastEnabledByListener: nextEnabledByListener,
    };

    if (!sql) {
      nextStatusByOutputId[outputId] = nextStatus;
      continue;
    }

    const listenerRuns: Array<{
      name: OutputListenerName;
      enabled: boolean;
      run: () => Awaitable<void>;
    }> = [
      {
        name: "copyToClipboard",
        enabled: listeners.copyToClipboard,
        run: () => dependencies.clipboardWriteText(sql, context),
      },
      {
        name: "logToConsole",
        enabled: listeners.logToConsole,
        run: () => dependencies.consoleLog(sql, context),
      },
      {
        name: "saveToLocalStorage",
        enabled: listeners.saveToLocalStorage.enabled,
        run: () =>
          dependencies.localStorageSetItem(
            listeners.saveToLocalStorage.key,
            sql,
            context,
          ),
      },
    ];
    const errors: string[] = [];
    let attemptedRuns = 0;
    let successfulRuns = 0;

    for (const listener of listenerRuns) {
      if (!listener.enabled) {
        continue;
      }

      const wasEnabled = previousStatus.lastEnabledByListener[listener.name];
      const lastSuccessfulSqlForListener =
        previousStatus.lastSuccessfulSqlByListener[listener.name];
      const shouldRun =
        !wasEnabled || lastSuccessfulSqlForListener !== sql;

      if (!shouldRun) {
        continue;
      }

      attemptedRuns += 1;
      try {
        await listener.run();
        successfulRuns += 1;
        nextStatus.lastSuccessfulSqlByListener[listener.name] = sql;
      } catch (error) {
        errors.push(
          `${listener.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (attemptedRuns > 0) {
      nextStatus.lastRunAt = dependencies.now();
      nextStatus.lastErrorMessage = errors.length > 0 ? errors.join(" | ") : null;
      if (successfulRuns > 0) {
        nextStatus.lastSuccessfulSql = sql;
      }
    }

    nextStatusByOutputId[outputId] = nextStatus;
  }

  return nextStatusByOutputId;
}

const objectIdentityByRef = new WeakMap<object, number>();
let nextObjectIdentity = 1;

function getObjectIdentity(value: object) {
  const existing = objectIdentityByRef.get(value);
  if (existing) {
    return existing;
  }

  const identity = nextObjectIdentity;
  nextObjectIdentity += 1;
  objectIdentityByRef.set(value, identity);
  return identity;
}

function createWorkspaceRuntimeKey(
  workspace: GraphWorkspace,
  activeGraphId: string,
): string {
  return [
    activeGraphId,
    ...workspace.graphs.map((graph) =>
      [
        graph.id,
        getObjectIdentity(graph.nodes),
        getObjectIdentity(graph.edges),
      ].join(":"),
    ),
  ].join("|");
}

export function useOutputRuntime(
  workspace: GraphWorkspace,
  activeGraphId: string,
  deps?: Partial<OutputRuntimeDependencies>,
): OutputRuntimeSnapshot {
  const runtimeKey = createWorkspaceRuntimeKey(workspace, activeGraphId);
  const compiledSnapshot = useMemo(
    () => compileWorkspaceOutputs(workspace, activeGraphId),
    [runtimeKey],
  );
  const [listenerStatusByOutputId, setListenerStatusByOutputId] = useState<
    Record<string, OutputListenerStatus>
  >({});
  const listenerStatusRef = useRef(listenerStatusByOutputId);

  useEffect(() => {
    listenerStatusRef.current = listenerStatusByOutputId;
  }, [listenerStatusByOutputId]);

  useEffect(() => {
    let cancelled = false;
    const runListeners = async () => {
      const activeGraphStatusByOutputId = await applyOutputListeners({
        document: compiledSnapshot.runtimeDocument,
        resultsByOutputId: compiledSnapshot.resultsByOutputId,
        previousStatusByOutputId: listenerStatusRef.current,
        deps,
      });

      if (!cancelled) {
        listenerStatusRef.current = {
          ...listenerStatusRef.current,
          ...activeGraphStatusByOutputId,
        };
        setListenerStatusByOutputId(listenerStatusRef.current);
      }
    };

    void runListeners();

    return () => {
      cancelled = true;
    };
  }, [compiledSnapshot.resultsByOutputId, compiledSnapshot.runtimeDocument, deps]);

  return useMemo(
    () => ({
      ...compiledSnapshot,
      listenerStatusByOutputId,
    }),
    [compiledSnapshot, listenerStatusByOutputId],
  );
}
