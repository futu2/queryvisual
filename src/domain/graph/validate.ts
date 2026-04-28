import type { Diagnostic } from "../diagnostics/types";
import type {
  GraphDefinition,
  GraphDocument,
  GraphNode,
  GraphWorkspace,
  NamedExpression,
} from "../document/types";
import { isGraphWorkspaceLikeRuntime, normalizeGraphWorkspaceLikeRuntime } from "../document/types";
import type { ExpressionAnalysisDiagnosticCode } from "../expr/analyze";
import { analyzeExpression } from "../expr/analyze";
import type { ColumnMap, ColumnType } from "../schema/types";
import { detectGraphCycle } from "../workspace/dependencies";
import { findGraphById } from "../workspace/interfaces";
import { buildExpressionScope } from "./expressionScope";
import type { SemanticOutput } from "./semantic";

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter(edge => edge.target === nodeId);
}

function outgoingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter(edge => edge.source === nodeId);
}

function parseOutputHandle(handle: string): string | null {
  if (!handle.startsWith("out:")) return null;
  const id = handle.slice("out:".length);
  return id === "" ? null : id;
}

function parseInputHandle(handle: string): string | null {
  if (!handle.startsWith("in:")) return null;
  const id = handle.slice("in:".length);
  return id === "" ? null : id;
}

function isWorkspace(value: unknown): value is GraphWorkspace {
  return isGraphWorkspaceLikeRuntime(value);
}

function isTypeCompatible(provided: ColumnType | undefined, required: ColumnType) {
  if (!provided) return false;
  if (provided === "unknown" || required === "unknown") return true;
  return provided === required;
}

function orderedReachableNodes(document: GraphDocument, outputId: string) {
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  const ordered: GraphNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodesById[nodeId];
    if (!node) {
      return;
    }

    for (const edge of incomingEdges(document, nodeId)) {
      visit(edge.source);
    }

    ordered.push(node);
  }

  visit(outputId);
  return ordered;
}

function diagnostic(
  code: string,
  message: string,
  nodeId: string,
  field?: string,
): Diagnostic {
  return {
    level: "error",
    code,
    message,
    ref: { nodeId, field },
  };
}

const analyzerCodeToNodeSuffix: Record<ExpressionAnalysisDiagnosticCode, string> = {
  "expr.parse-error": "invalid-expression",
  "expr.unknown-column": "unknown-column",
  "expr.ambiguous-column": "ambiguous-column",
  "expr.non-boolean": "non-boolean",
};

function pushAnalyzerDiagnostics(params: {
  diagnostics: Diagnostic[];
  nodeKind: GraphNode["kind"];
  nodeId: string;
  field: string;
  expression: string;
  requireBoolean?: boolean;
  document: GraphDocument;
  schemaOverrides: Record<string, ColumnMap>;
}) {
  const scope = buildExpressionScope(params.document, params.nodeId, {
    schemas: params.schemaOverrides,
  });
  const analysis = analyzeExpression(params.expression, scope, {
    requireBoolean: params.requireBoolean,
  });

  for (const diag of analysis.diagnostics) {
    params.diagnostics.push(
      diagnostic(
        `${params.nodeKind}.${analyzerCodeToNodeSuffix[diag.code]}`,
        diag.message,
        params.nodeId,
        params.field,
      ),
    );
  }

  return analysis.type;
}

function mappingsToSchema(
  mappings: NamedExpression[],
  diagnostics: Diagnostic[],
  nodeId: string,
  nodeKind: GraphNode["kind"],
  fieldPrefix: string,
  document: GraphDocument,
  schemaOverrides: Record<string, ColumnMap>,
) {
  return Object.fromEntries(
    mappings.map((mapping, index) => {
      const type = pushAnalyzerDiagnostics({
        diagnostics,
        nodeKind,
        nodeId,
        field: `${fieldPrefix}.${index}.expression`,
        expression: mapping.expression,
        document,
        schemaOverrides,
      });
      return [mapping.name, type];
    }),
  );
}

function singleInput(
  inputs: ReturnType<typeof incomingEdges>,
  diagnostics: Diagnostic[],
  nodeId: string,
  nodeKind: string,
  missingMessage: string,
) {
  const inEdges = inputs.filter(edge => edge.targetHandle === "in");
  if (inEdges.length === 0) {
    diagnostics.push(diagnostic(`${nodeKind}.missing-input`, missingMessage, nodeId));
    return null;
  }
  if (inEdges.length > 1) {
    diagnostics.push(
      diagnostic(
        `${nodeKind}.duplicate-input`,
        `${nodeKind} nodes require exactly one input.`,
        nodeId,
      ),
    );
    return null;
  }
  return inEdges[0];
}

function validateGraphOutput(params: {
  document: GraphDocument;
  outputId: string;
  workspace?: GraphWorkspace;
  graphId?: string;
  graphInputSchemas?: Record<string, ColumnMap>;
}): SemanticOutput {
  const document = params.document;
  const outputId = params.outputId;
  const workspace = params.workspace;
  const graphInputSchemas = params.graphInputSchemas ?? {};
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const orderedNodes = orderedReachableNodes(document, outputId);
  const reachableNodeIds = new Set(orderedNodes.map(node => node.id));
  const diagnostics: Diagnostic[] = [];
  const schemas: Record<string, ColumnMap> = {};
  // Tracks nodes whose output schema/scope is not trustworthy due to structural issues
  // (missing/duplicate wiring) either on the node itself or upstream. Downstream consumers
  // should not emit analyzer diagnostics based on these broken scopes.
  const invalidStructure = new Set<string>();

  for (const node of orderedNodes) {
    const inputs = incomingEdges(document, node.id);
    switch (node.kind) {
      case "graphInput":
        schemas[node.id] = graphInputSchemas[node.id] ?? node.data.columns;
        break;
      case "fromTable":
        schemas[node.id] = node.data.columns;
        break;
      case "subgraph": {
        if (!workspace) {
          diagnostics.push(
            diagnostic(
              "subgraph.unsupported",
              "Subgraph nodes require a workspace context.",
              node.id,
              "graphId",
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        if (node.data.target?.kind === "package") {
          diagnostics.push(
            diagnostic(
              "subgraph.unsupported-package-target",
              "Package subgraph targets are not supported yet.",
              node.id,
              "target",
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        const childGraphId = node.data.graphId;
        const childGraph = findGraphById(workspace, childGraphId);
        if (!childGraph) {
          diagnostics.push(
            diagnostic(
              "subgraph.missing-graph",
              `Referenced graph ${childGraphId} does not exist in the workspace.`,
              node.id,
              "graphId",
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        const inputNameCounts = new Map<string, number>();
        for (const inputNode of childGraph.nodes) {
          if (inputNode.kind !== "graphInput") continue;
          inputNameCounts.set(
            inputNode.data.inputName,
            (inputNameCounts.get(inputNode.data.inputName) ?? 0) + 1,
          );
        }
        for (const [name, count] of inputNameCounts.entries()) {
          if (count <= 1) continue;
          diagnostics.push(
            diagnostic(
              "subgraph.duplicate-child-input-name",
              `Child graph has duplicate input name ${name}.`,
              node.id,
              "graphId",
            ),
          );
        }

        const outputNameCounts = new Map<string, number>();
        for (const outputNode of childGraph.nodes) {
          if (outputNode.kind !== "output") continue;
          outputNameCounts.set(
            outputNode.data.outputName,
            (outputNameCounts.get(outputNode.data.outputName) ?? 0) + 1,
          );
        }
        for (const [name, count] of outputNameCounts.entries()) {
          if (count <= 1) continue;
          diagnostics.push(
            diagnostic(
              "subgraph.duplicate-child-output-name",
              `Child graph has duplicate output name ${name}.`,
              node.id,
              "graphId",
            ),
          );
        }

        if (
          [...inputNameCounts.values()].some((count) => count > 1) ||
          [...outputNameCounts.values()].some((count) => count > 1)
        ) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        const outputIds = new Set<string>();
        for (const edge of outgoingEdges(document, node.id)) {
          if (!reachableNodeIds.has(edge.target)) continue;
          const outId = parseOutputHandle(edge.sourceHandle);
          if (outId) outputIds.add(outId);
        }

        if (outputIds.size === 0) {
          diagnostics.push(
            diagnostic(
              "subgraph.missing-output",
              "Subgraph nodes require one connected output handle.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        if (outputIds.size > 1) {
          diagnostics.push(
            diagnostic(
              "subgraph.ambiguous-output",
              "Subgraph nodes may only use one output handle per execution path.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        const [childOutputId] = Array.from(outputIds);

        const childInputSchemas: Record<string, ColumnMap> = {};
        let compatible = true;

        const childReachableNodes = orderedReachableNodes(childGraph, childOutputId);
        const requiredChildInputIds = new Set(
          childReachableNodes
            .filter(
              (n): n is Extract<GraphNode, { kind: "graphInput" }> => n.kind === "graphInput",
            )
            .map((n) => n.id),
        );

        const childInputs = childGraph.nodes
          .filter(
            (n): n is Extract<GraphNode, { kind: "graphInput" }> => n.kind === "graphInput",
          )
          .filter((n) => requiredChildInputIds.has(n.id));
        for (const inputNode of childInputs) {
          const handleId = `in:${inputNode.id}`;
          const matches = inputs.filter((edge) => edge.targetHandle === handleId);
          if (matches.length !== 1) {
            compatible = false;
            diagnostics.push(
              diagnostic(
                matches.length === 0
                  ? "subgraph.missing-input"
                  : "subgraph.duplicate-input",
                `Subgraph nodes require exactly one parent connection for child input ${inputNode.data.inputName}.`,
                node.id,
                handleId,
              ),
            );
            continue;
          }

          const edge = matches[0]!;
          if (invalidStructure.has(edge.source)) {
            compatible = false;
            continue;
          }
          const providedSchema = schemas[edge.source] ?? {};
          const requiredSchema = inputNode.data.columns ?? {};
          for (const [col, requiredType] of Object.entries(requiredSchema)) {
            if (!Object.prototype.hasOwnProperty.call(providedSchema, col)) {
              compatible = false;
              diagnostics.push(
                diagnostic(
                  "subgraph.incompatible-input",
                  `Missing required input column ${col} for child graph.`,
                  node.id,
                  handleId,
                ),
              );
              continue;
            }

            const providedType = providedSchema[col];
            if (!isTypeCompatible(providedType, requiredType)) {
              compatible = false;
              diagnostics.push(
                diagnostic(
                  "subgraph.incompatible-input",
                  `Incompatible input column ${col} type (${providedType} vs ${requiredType}).`,
                  node.id,
                  handleId,
                ),
              );
            }
          }

          childInputSchemas[inputNode.id] = providedSchema;
        }

        if (!compatible) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        const childSemantic = validateOutput(
          workspace,
          childGraphId,
          childOutputId,
          childInputSchemas,
        );
        if (childSemantic.diagnostics.some((d) => d.level === "error")) {
          for (const childDiagnostic of childSemantic.diagnostics) {
            if (childDiagnostic.level !== "error") continue;
            const immediate = {
              graphId: childGraphId,
              nodeId: childDiagnostic.ref?.nodeId,
              field: childDiagnostic.ref?.field,
            };
            const inheritedChain =
              childDiagnostic.context?.chain ??
              (childDiagnostic.context?.child ? [childDiagnostic.context.child] : []);
            const chain = [immediate, ...inheritedChain];
            const deepest = chain[chain.length - 1];
            diagnostics.push({
              level: childDiagnostic.level,
              code: childDiagnostic.code,
              message: childDiagnostic.message,
              ref: { nodeId: node.id, field: "graphId" },
              context: {
                parent: params.graphId ? { graphId: params.graphId, nodeId: node.id } : undefined,
                child: deepest,
                chain,
              },
            });
          }
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }

        schemas[node.id] = childSemantic.schemas[childOutputId] ?? {};
        break;
      }
      case "join": {
        const leftEdges = inputs.filter(edge => edge.targetHandle === "left");
        const rightEdges = inputs.filter(edge => edge.targetHandle === "right");
        const left = leftEdges[0];
        const right = rightEdges[0];
        if (!left || !right) {
          diagnostics.push(
            diagnostic(
              "join.missing-input",
              "Join nodes require left and right inputs.",
              node.id,
            ),
          );
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (leftEdges.length > 1) {
          diagnostics.push(
            diagnostic(
              "join.duplicate-left-input",
              "Join nodes require exactly one left input.",
              node.id,
            ),
          );
        }
        if (rightEdges.length > 1) {
          diagnostics.push(
            diagnostic(
              "join.duplicate-right-input",
              "Join nodes require exactly one right input.",
              node.id,
            ),
          );
        }
        // Wiring must be unambiguous before we can build a meaningful expression scope.
        if (leftEdges.length !== 1 || rightEdges.length !== 1) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        // If either required input is already structurally invalid upstream, suppress analyzer
        // diagnostics here and downstream (scope would be misleading).
        if (invalidStructure.has(left.source) || invalidStructure.has(right.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        const leftSchema = schemas[left.source] ?? {};
        const rightSchema = schemas[right.source] ?? {};
        pushAnalyzerDiagnostics({
          diagnostics,
          nodeKind: "join",
          nodeId: node.id,
          field: "predicate",
          expression: node.data.predicate,
          requireBoolean: true,
          document,
          schemaOverrides: schemas,
        });
        schemas[node.id] = { ...leftSchema, ...rightSchema };
        break;
      }
      case "where": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "where",
          "Where nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        pushAnalyzerDiagnostics({
          diagnostics,
          nodeKind: "where",
          nodeId: node.id,
          field: "predicate",
          expression: node.data.predicate,
          requireBoolean: true,
          document,
          schemaOverrides: schemas,
        });
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "select": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "select",
          "Select nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        schemas[node.id] = mappingsToSchema(
          node.data.mappings,
          diagnostics,
          node.id,
          "select",
          "mappings",
          document,
          schemas,
        );
        break;
      }
      case "aggregation": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "aggregation",
          "Aggregation nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        schemas[node.id] = {
          ...mappingsToSchema(
            node.data.groupBy,
            diagnostics,
            node.id,
            "aggregation",
            "groupBy",
            document,
            schemas,
          ),
          ...mappingsToSchema(
            node.data.aggregates,
            diagnostics,
            node.id,
            "aggregation",
            "aggregates",
            document,
            schemas,
          ),
        };
        break;
      }
      case "sort": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "sort",
          "sort nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        for (const [index, item] of node.data.items.entries()) {
          pushAnalyzerDiagnostics({
            diagnostics,
            nodeKind: "sort",
            nodeId: node.id,
            field: `items.${index}.expression`,
            expression: item.expression,
            document,
            schemaOverrides: schemas,
          });
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "limit": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "limit",
          "limit nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "output": {
        const input = singleInput(
          inputs,
          diagnostics,
          node.id,
          "output",
          "Output nodes require one input.",
        );
        if (!input) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        if (invalidStructure.has(input.source)) {
          schemas[node.id] = {};
          invalidStructure.add(node.id);
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
    }
  }

  const outputNode = nodesById[outputId];
  if (!outputNode || outputNode.kind !== "output") {
    diagnostics.push({
      level: "error",
      code: "output.invalid",
      message: `Node ${outputId} is not an output node.`,
      ref: { nodeId: outputId },
    });
  }

  return {
    graphId: params.graphId ?? ("id" in document ? (document as GraphDefinition).id : undefined),
    document,
    outputId,
    outputName: outputNode?.kind === "output" ? outputNode.data.outputName : outputId,
    orderedNodes,
    nodesById,
    schemas,
    diagnostics,
  };
}

export function validateOutput(document: GraphDocument, outputId: string): SemanticOutput;
export function validateOutput(
  workspace: GraphWorkspace,
  graphId: string,
  outputId: string,
  graphInputSchemas?: Record<string, ColumnMap>,
): SemanticOutput;
export function validateOutput(
  arg1: GraphDocument | GraphWorkspace,
  arg2: string,
  arg3?: string,
  arg4?: Record<string, ColumnMap>,
): SemanticOutput {
  if (isWorkspace(arg1)) {
    const workspace = normalizeGraphWorkspaceLikeRuntime(arg1);
    const graphId = arg2;
    const outputId = arg3 ?? arg2;
    const graphInputSchemas = arg4 ?? {};

    const cycle = detectGraphCycle(workspace, graphId);
    if (cycle) {
      const graph =
        findGraphById(workspace, graphId) ??
        ({
          id: graphId,
          metadata: { name: graphId },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        } satisfies GraphDefinition);

      return {
        graphId,
        document: graph,
        outputId,
        outputName: outputId,
        orderedNodes: [],
        nodesById: {},
        schemas: {},
        diagnostics: [
          diagnostic(
            "subgraph.cycle",
            `Graph dependency cycle detected: ${cycle.path.join(" -> ")}`,
            outputId,
          ),
        ],
      };
    }

    const graph = findGraphById(workspace, graphId);
    if (!graph) {
      const stub: GraphDefinition = {
        id: graphId,
        metadata: { name: graphId },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      };
      return {
        graphId,
        document: stub,
        outputId,
        outputName: outputId,
        orderedNodes: [],
        nodesById: {},
        schemas: {},
        diagnostics: [
          diagnostic("graph.invalid", `Graph ${graphId} does not exist.`, outputId),
        ],
      };
    }

    return validateGraphOutput({
      document: graph,
      outputId,
      workspace,
      graphId,
      graphInputSchemas,
    });
  }

  const document = arg1;
  const outputId = arg2;
  return validateGraphOutput({ document, outputId });
}
