import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphNode, GraphWorkspace } from "../document/types";
import type { Expr } from "../expr/ast";
import { inferExpressionType } from "../expr/infer";
import { parseExpression } from "../expr/parser";
import {
  buildSubgraphWorkspace,
  resolveSubgraphTarget,
} from "../workspace/interfaces";
import type {
  HelperCallResolution,
  HelperRegistry,
  ImportedHelperDefinition,
} from "./types";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function diagnostic(code: string, message: string, nodeId?: string, field?: string): Diagnostic {
  return {
    level: "error",
    code,
    message,
    ref: { nodeId, field },
  };
}

function canonicalName(name: string) {
  return name.toLowerCase();
}

function formatQualifiedName(moduleName: string, helperName: string) {
  return moduleName ? `${moduleName}.${helperName}` : helperName;
}

function helperNodeModuleName(source: Extract<GraphNode, { kind: "helperFunctions" }>) {
  return (source.data as { moduleName?: string }).moduleName ?? "";
}

function highestPlaceholderIndex(expr: Expr | null): number {
  if (!expr) return 0;

  switch (expr.kind) {
    case "placeholder":
      return expr.index;
    case "unary":
      return highestPlaceholderIndex(expr.expression);
    case "binary":
      return Math.max(
        highestPlaceholderIndex(expr.left),
        highestPlaceholderIndex(expr.right),
      );
    case "call":
      return Math.max(0, ...expr.args.map(highestPlaceholderIndex));
    case "case":
      return Math.max(
        0,
        ...expr.branches.flatMap((branch) => [
          highestPlaceholderIndex(branch.when),
          highestPlaceholderIndex(branch.then),
        ]),
        highestPlaceholderIndex(expr.elseExpression),
      );
    case "cast":
      return highestPlaceholderIndex(expr.expression);
    case "column":
    case "literal":
      return 0;
  }
}

type HelperBodyCall = {
  name: string;
  argCount: number;
};

type HelperDependencyMetadata = {
  dependencyIds: string[];
  hasInvalidBodyCall: boolean;
};

function collectCalls(expr: Expr | null): HelperBodyCall[] {
  if (!expr) return [];

  switch (expr.kind) {
    case "call":
      return [
        { name: expr.name, argCount: expr.args.length },
        ...expr.args.flatMap(collectCalls),
      ];
    case "unary":
      return collectCalls(expr.expression);
    case "binary":
      return [...collectCalls(expr.left), ...collectCalls(expr.right)];
    case "case":
      return [
        ...expr.branches.flatMap((branch) => [
          ...collectCalls(branch.when),
          ...collectCalls(branch.then),
        ]),
        ...collectCalls(expr.elseExpression),
      ];
    case "cast":
      return collectCalls(expr.expression);
    case "column":
    case "literal":
    case "placeholder":
      return [];
  }
}

function createResolver(helpers: ImportedHelperDefinition[]) {
  return (name: string): HelperCallResolution => {
    const canonicalCallName = canonicalName(name);

    if (canonicalCallName.includes(".")) {
      const dotIndex = canonicalCallName.lastIndexOf(".");
      const moduleName = canonicalCallName.slice(0, dotIndex);
      const helperName = canonicalCallName.slice(dotIndex + 1);
      const matches = helpers.filter(
        (candidate) =>
          candidate.moduleName === moduleName && candidate.name === helperName,
      );
      const helper = matches[0];
      if (matches.length === 1 && helper) return { status: "resolved", helper };
      if (matches.length > 1) return { status: "ambiguous", helpers: matches };
      return { status: "unresolved" };
    }

    const matches = helpers.filter((helper) => helper.name === canonicalCallName);
    const helper = matches[0];
    if (matches.length === 1 && helper) return { status: "resolved", helper };
    if (matches.length > 1) return { status: "ambiguous", helpers: matches };
    return { status: "unresolved" };
  };
}

function buildHelperDependencyMetadata(
  helpers: ImportedHelperDefinition[],
  diagnostics: Diagnostic[],
  resolveCall: HelperRegistry["resolveCall"],
) {
  const metadataByHelperId = new Map<string, HelperDependencyMetadata>();

  for (const helper of helpers) {
    const dependencyIds: string[] = [];
    let hasInvalidBodyCall = false;

    for (const call of collectCalls(helper.ast)) {
      const resolution = resolveCall(call.name);

      if (resolution.status === "ambiguous") {
        diagnostics.push(
          diagnostic(
            "helpers.ambiguous-helper",
            `Helper call ${call.name} is ambiguous`,
            helper.definingNodeId,
            `helpers.${helper.rowIndex}.expression`,
          ),
        );
        hasInvalidBodyCall = true;
        continue;
      }

      if (resolution.status === "resolved") {
        dependencyIds.push(resolution.helper.id);

        if (resolution.helper.arity !== call.argCount) {
          diagnostics.push(
            diagnostic(
              "helpers.helper-arity",
              `Helper ${call.name} expects ${resolution.helper.arity} arguments but got ${call.argCount}`,
              helper.definingNodeId,
              `helpers.${helper.rowIndex}.expression`,
            ),
          );
          hasInvalidBodyCall = true;
        }
      }
    }

    metadataByHelperId.set(helper.id, {
      dependencyIds,
      hasInvalidBodyCall,
    });
  }

  return metadataByHelperId;
}

function addRecursiveDiagnostics(
  helpers: ImportedHelperDefinition[],
  diagnostics: Diagnostic[],
  metadataByHelperId: Map<string, HelperDependencyMetadata>,
) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const recursiveIds = new Set<string>();

  function visit(helperId: string, path: string[]) {
    if (visiting.has(helperId)) {
      const cycleStart = path.indexOf(helperId);
      const cycle = path.slice(cycleStart);
      const key = [...cycle].sort().join("|");
      for (const cycleHelperId of cycle) {
        recursiveIds.add(cycleHelperId);
      }
      if (!reported.has(key)) {
        reported.add(key);
        const helper = helpers.find((candidate) => candidate.id === helperId);
        diagnostics.push(
          diagnostic(
            "helpers.recursive",
            "Helper definitions cannot be recursive",
            helper?.definingNodeId,
            helper ? `helpers.${helper.rowIndex}.expression` : undefined,
          ),
        );
      }
      return;
    }

    if (visited.has(helperId)) return;

    visiting.add(helperId);
    for (const dependency of metadataByHelperId.get(helperId)?.dependencyIds ?? []) {
      visit(dependency, [...path, dependency]);
    }
    visiting.delete(helperId);
    visited.add(helperId);
  }

  for (const helper of helpers) {
    visit(helper.id, [helper.id]);
  }

  return recursiveIds;
}

function inferHelperReturnTypes(
  helpers: ImportedHelperDefinition[],
  registry: HelperRegistry,
  metadataByHelperId: Map<string, HelperDependencyMetadata>,
  recursiveIds: Set<string>,
) {
  const helpersById = new Map(helpers.map((helper) => [helper.id, helper]));
  const invalidIds = new Set(recursiveIds);
  const visiting = new Set<string>();
  const inferred = new Set<string>();

  for (const helper of helpers) {
    if (metadataByHelperId.get(helper.id)?.hasInvalidBodyCall) {
      invalidIds.add(helper.id);
    }
  }

  function infer(helper: ImportedHelperDefinition) {
    if (inferred.has(helper.id)) return helper.returnType;
    if (visiting.has(helper.id)) {
      invalidIds.add(helper.id);
      return "unknown";
    }

    const metadata = metadataByHelperId.get(helper.id);
    if (!helper.ast || invalidIds.has(helper.id) || !metadata) {
      helper.returnType = "unknown";
      inferred.add(helper.id);
      return helper.returnType;
    }

    visiting.add(helper.id);
    for (const dependencyId of metadata.dependencyIds) {
      const dependency = helpersById.get(dependencyId);
      if (!dependency) continue;
      infer(dependency);
      if (invalidIds.has(dependency.id)) {
        invalidIds.add(helper.id);
      }
    }
    visiting.delete(helper.id);

    helper.returnType = invalidIds.has(helper.id)
      ? "unknown"
      : inferExpressionType(helper.ast, {}, { helpers: registry });
    inferred.add(helper.id);
    return helper.returnType;
  }

  for (const helper of helpers) {
    infer(helper);
  }
}

export type BuildHelperRegistryOptions = {
  workspace?: GraphWorkspace;
  graphId?: string;
  importStack?: string[];
};

export function buildHelperRegistry(
  document: GraphDocument,
  options: BuildHelperRegistryOptions = {},
): HelperRegistry {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  const helpers: ImportedHelperDefinition[] = [];
  const diagnostics: Diagnostic[] = [];
  const currentGraphId =
    options.graphId ?? ("id" in document ? document.id : undefined);
  const legacyImportedSourceIds = new Set(
    document.edges
      .filter((edge) => {
        const target = nodesById.get(edge.target);
        return target?.kind === "importHelperFunctions";
      })
      .map((edge) => edge.source),
  );

  for (const source of document.nodes) {
    if (source.kind !== "helperFunctions") continue;
    if (legacyImportedSourceIds.has(source.id)) continue;
    importHelpers(
      source,
      {
        moduleName: helperNodeModuleName(source),
        moduleNodeId: source.id,
        idPrefix: source.id,
      },
      helpers,
      diagnostics,
    );
  }

  for (const importer of document.nodes) {
    if (importer.kind !== "importHelperFunctions") continue;

    const incomingEdges = document.edges.filter(
      (edge) => edge.target === importer.id && edge.targetHandle === "in",
    );

    if (incomingEdges.length === 0) {
      diagnostics.push(
        diagnostic(
          "helpers.importer-missing-input",
          "Helper importers require one helper input",
          importer.id,
        ),
      );
      continue;
    }

    if (incomingEdges.length > 1) {
      diagnostics.push(
        diagnostic(
          "helpers.importer-duplicate-input",
          "Helper importers require exactly one helper input",
          importer.id,
        ),
      );
      continue;
    }

    const incomingEdge = incomingEdges[0];
    if (!incomingEdge) continue;

    const source = nodesById.get(incomingEdge.source);
    if (!source || source.kind !== "helperFunctions") {
      diagnostics.push(
        diagnostic(
          "helpers.importer-invalid-source",
          "Helper importers must connect to a helperFunctions node",
          importer.id,
        ),
      );
      continue;
    }

    importHelpers(
      source,
      {
        moduleName: importer.data.moduleName,
        moduleNodeId: importer.id,
        idPrefix: importer.id,
      },
      helpers,
      diagnostics,
    );
  }

  for (const importer of document.nodes) {
    if (importer.kind !== "importGraphHelpers") continue;

    const target = importer.data.target ?? {
      kind: "local" as const,
      graphId: importer.data.graphId,
    };
    const isEmptyLocalTarget =
      target.kind === "local" && target.graphId.trim() === "";
    const isEmptyPackageTarget =
      target.kind === "package" &&
      (target.packageId.trim() === "" ||
        target.version.trim() === "" ||
        target.exportKey.trim() === "");
    if (isEmptyLocalTarget || isEmptyPackageTarget) {
      diagnostics.push(
        diagnostic(
          "helpers.graph-import-missing-graph",
          "Graph helper imports require a graph",
          importer.id,
          "graphId",
        ),
      );
      continue;
    }

    const rawModuleName = importer.data.moduleName.trim();
    if (rawModuleName !== "" && !NAME_RE.test(rawModuleName)) {
      diagnostics.push(
        diagnostic(
          "helpers.invalid-module",
          "Helper module names must be valid identifiers",
          importer.id,
          "moduleName",
        ),
      );
      continue;
    }

    if (!options.workspace) {
      diagnostics.push(
        diagnostic(
          "helpers.graph-import-requires-workspace",
          "Graph helper imports require a workspace context",
          importer.id,
          "graphId",
        ),
      );
      continue;
    }

    const resolved = resolveSubgraphTarget(options.workspace, {
      graphId: importer.data.graphId,
      target,
    });

    if (!resolved.graph) {
      diagnostics.push(
        diagnostic(
          target.kind === "package"
            ? "helpers.graph-import-missing-package-export"
            : "helpers.graph-import-missing-graph",
          target.kind === "package"
            ? `Installed package export ${target.packageId}@${target.version}#${target.exportKey} does not exist.`
            : `Referenced helper graph ${target.graphId} does not exist in the workspace`,
          importer.id,
          target.kind === "package" ? "target" : "graphId",
        ),
      );
      continue;
    }

    if (target.kind === "local" && currentGraphId && target.graphId === currentGraphId) {
      diagnostics.push(
        diagnostic(
          "helpers.graph-import-cycle",
          `Helper graph import cycle detected: ${currentGraphId} -> ${target.graphId}`,
          importer.id,
          "graphId",
        ),
      );
      continue;
    }

    const sourceGraphId = resolved.graph.id;
    if (target.kind === "local" && options.importStack?.includes(sourceGraphId)) {
      diagnostics.push(
        diagnostic(
          "helpers.graph-import-cycle",
          `Helper graph import cycle detected: ${[
            ...(options.importStack ?? []),
            ...(currentGraphId ? [currentGraphId] : []),
            sourceGraphId,
          ].join(" -> ")}`,
          importer.id,
          "graphId",
        ),
      );
      continue;
    }

    const sourceWorkspace =
      target.kind === "package"
        ? buildSubgraphWorkspace(options.workspace, resolved)
        : options.workspace;

    const sourceRegistry = buildHelperRegistry(resolved.graph, {
      workspace: sourceWorkspace,
      graphId: sourceGraphId,
      importStack: [...(options.importStack ?? []), currentGraphId ?? sourceGraphId],
    });
    diagnostics.push(...sourceRegistry.diagnostics);

    const moduleOverride = rawModuleName === "" ? null : canonicalName(rawModuleName);
    for (const helper of sourceRegistry.helpers) {
      const moduleName = moduleOverride ?? helper.moduleName;
      helpers.push({
        ...helper,
        id: `${importer.id}:${helper.id}:${formatQualifiedName(
          moduleName,
          helper.name,
        )}`,
        moduleName,
        importerNodeId: importer.id,
      });
    }
  }

  addDuplicateQualifiedNameDiagnostics(helpers, diagnostics);
  const resolveCall = createResolver(helpers);
  const metadataByHelperId = buildHelperDependencyMetadata(
    helpers,
    diagnostics,
    resolveCall,
  );
  const recursiveIds = addRecursiveDiagnostics(
    helpers,
    diagnostics,
    metadataByHelperId,
  );

  const registry: HelperRegistry = {
    helpers,
    diagnostics,
    resolveCall,
  };

  inferHelperReturnTypes(helpers, registry, metadataByHelperId, recursiveIds);

  return registry;
}

function importHelpers(
  source: Extract<GraphNode, { kind: "helperFunctions" }>,
  moduleSource: {
    moduleName: string;
    moduleNodeId: string;
    idPrefix: string;
  },
  helpers: ImportedHelperDefinition[],
  diagnostics: Diagnostic[],
) {
  const rawModuleName = moduleSource.moduleName.trim();

  if (rawModuleName !== "" && !NAME_RE.test(rawModuleName)) {
    diagnostics.push(
      diagnostic(
        "helpers.invalid-module",
        "Helper module names must be valid identifiers",
        moduleSource.moduleNodeId,
        "moduleName",
      ),
    );
    return;
  }

  const moduleName = canonicalName(rawModuleName);

  source.data.helpers.forEach((helper, rowIndex) => {
    if (!NAME_RE.test(helper.name)) {
      diagnostics.push(
        diagnostic(
          "helpers.invalid-name",
          "Helper names must be valid identifiers",
          source.id,
          `helpers.${rowIndex}.name`,
        ),
      );
      return;
    }

    const helperName = canonicalName(helper.name);

    let ast: Expr | null = null;
    try {
      ast = parseExpression(helper.expression, { allowPlaceholders: true });
    } catch {
      diagnostics.push(
        diagnostic(
          "helpers.invalid-expression",
          "Helper expressions must be valid expressions",
          source.id,
          `helpers.${rowIndex}.expression`,
        ),
      );
      return;
    }

    helpers.push({
      id: `${moduleSource.idPrefix}:${rowIndex}:${formatQualifiedName(moduleName, helperName)}`,
      name: helperName,
      moduleName,
      expression: helper.expression,
      ast,
      arity: highestPlaceholderIndex(ast),
      returnType: "unknown",
      definingNodeId: source.id,
      importerNodeId: moduleSource.moduleNodeId,
      rowIndex,
    });
  });
}

function addDuplicateQualifiedNameDiagnostics(
  helpers: ImportedHelperDefinition[],
  diagnostics: Diagnostic[],
) {
  const helpersByQualifiedName = new Map<string, ImportedHelperDefinition[]>();

  for (const helper of helpers) {
    const qualifiedName = formatQualifiedName(helper.moduleName, helper.name);
    helpersByQualifiedName.set(qualifiedName, [
      ...(helpersByQualifiedName.get(qualifiedName) ?? []),
      helper,
    ]);
  }

  for (const [qualifiedName, matches] of helpersByQualifiedName) {
    if (matches.length <= 1) continue;

    for (const helper of matches.slice(1)) {
      diagnostics.push(
        diagnostic(
          "helpers.duplicate-qualified-name",
          `Duplicate helper definition for ${qualifiedName}`,
          helper.definingNodeId,
          `helpers.${helper.rowIndex}.name`,
        ),
      );
    }
  }
}
