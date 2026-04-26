import { useEffect, useMemo, useState } from "react";
import {
  compileOutput,
  type CompileOutputResult,
} from "../../domain/compile/compileOutput";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument, GraphNode } from "../../domain/document/types";

export interface OutputListenerStatus {
  lastSuccessfulSql: string | null;
  lastRunAt: number | null;
  lastErrorMessage: string | null;
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
  ) => void;
  consoleLog: (
    sql: string,
    context: { outputId: string; outputName: string },
  ) => void;
  localStorageSetItem: (
    key: string,
    sql: string,
    context: { outputId: string; outputName: string },
  ) => void;
  now: () => number;
}

const defaultRuntimeDependencies: OutputRuntimeDependencies = {
  clipboardWriteText: (sql) => {
    navigator.clipboard?.writeText?.(sql);
  },
  consoleLog: (sql) => {
    console.log(sql);
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
  };
}

function listOutputNodes(document: GraphDocument) {
  return document.nodes.filter(
    (node): node is Extract<GraphNode, { kind: "output" }> =>
      node.kind === "output",
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

export function applyOutputListeners(params: {
  document: GraphDocument;
  resultsByOutputId: Record<string, CompileOutputResult>;
  previousStatusByOutputId: Record<string, OutputListenerStatus>;
  deps?: Partial<OutputRuntimeDependencies>;
}) {
  const dependencies: OutputRuntimeDependencies = {
    ...defaultRuntimeDependencies,
    ...params.deps,
  };
  const nextStatusByOutputId: Record<string, OutputListenerStatus> = {};

  for (const outputNode of listOutputNodes(params.document)) {
    const outputId = outputNode.id;
    const previousStatus =
      params.previousStatusByOutputId[outputId] ?? createInitialListenerStatus();
    const compileResult = params.resultsByOutputId[outputId];

    if (!compileResult) {
      nextStatusByOutputId[outputId] = previousStatus;
      continue;
    }

    const sql = compileResult.sql.trim();
    if (!sql || previousStatus.lastSuccessfulSql === sql) {
      nextStatusByOutputId[outputId] = previousStatus;
      continue;
    }

    const context = {
      outputId,
      outputName: outputNode.data.outputName,
    };
    const listeners = outputNode.data.listeners;
    const nextStatus: OutputListenerStatus = {
      ...previousStatus,
      lastRunAt: dependencies.now(),
    };

    try {
      if (listeners.copyToClipboard) {
        dependencies.clipboardWriteText(sql, context);
      }
      if (listeners.logToConsole) {
        dependencies.consoleLog(sql, context);
      }
      if (listeners.saveToLocalStorage.enabled) {
        dependencies.localStorageSetItem(
          listeners.saveToLocalStorage.key,
          sql,
          context,
        );
      }

      nextStatus.lastSuccessfulSql = sql;
      nextStatus.lastErrorMessage = null;
    } catch (error) {
      nextStatus.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
    }

    nextStatusByOutputId[outputId] = nextStatus;
  }

  return nextStatusByOutputId;
}

export function useOutputRuntime(
  document: GraphDocument,
  deps?: Partial<OutputRuntimeDependencies>,
): OutputRuntimeSnapshot {
  const compiledSnapshot = useMemo(() => compileDocumentOutputs(document), [document]);
  const [listenerStatusByOutputId, setListenerStatusByOutputId] = useState<
    Record<string, OutputListenerStatus>
  >({});

  useEffect(() => {
    setListenerStatusByOutputId((previousStatusByOutputId) =>
      applyOutputListeners({
        document,
        resultsByOutputId: compiledSnapshot.resultsByOutputId,
        previousStatusByOutputId,
        deps,
      }),
    );
  }, [compiledSnapshot.resultsByOutputId, deps, document]);

  return {
    ...compiledSnapshot,
    listenerStatusByOutputId,
  };
}
