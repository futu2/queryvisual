import type { SemanticOutput } from "../graph/semantic";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "../ir/lower";
import { optimizeOutput } from "../ir/optimize";
import type { IRRelNode } from "../ir/types";
import { renderSql } from "../sql/renderer";
import type { GraphDocument } from "../document/types";

export interface CompileOutputResult {
  semantic: SemanticOutput;
  ir: IRRelNode | null;
  optimizedIr: IRRelNode | null;
  sql: string;
}

export function compileOutput(
  document: GraphDocument,
  outputId: string,
): CompileOutputResult {
  const semantic = validateOutput(document, outputId);
  const ir = lowerOutputToIr(semantic);
  const optimizedIr = ir ? optimizeOutput(ir) : null;

  return {
    semantic,
    ir,
    optimizedIr,
    sql: optimizedIr ? renderSql(optimizedIr) : "",
  };
}
