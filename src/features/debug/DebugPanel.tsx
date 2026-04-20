import { useState } from "react";
import type { CompileOutputResult } from "../../domain/compile/compileOutput";

const tabs = ["Diagnostics", "Semantic", "IR", "Optimized IR", "SQL"] as const;

export function DebugPanel({
  result,
  outputs,
  activeOutputId,
  onSelectOutput,
}: {
  result: CompileOutputResult | null;
  outputs: Array<{ id: string; name: string }>;
  activeOutputId: string | null;
  onSelectOutput: (outputId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("SQL");

  const content = (() => {
    if (!result) return "Select an output node to compile.";
    switch (activeTab) {
      case "Diagnostics":
        return JSON.stringify(result.semantic.diagnostics, null, 2);
      case "Semantic":
        return JSON.stringify(result.semantic, null, 2);
      case "IR":
        return JSON.stringify(result.ir, null, 2);
      case "Optimized IR":
        return JSON.stringify(result.optimizedIr, null, 2);
      case "SQL":
        return result.sql;
    }
  })();

  return (
    <div className="debug-panel">
      <div className="output-switcher">
        {outputs.map((output) => (
          <button
            key={output.id}
            type="button"
            className={activeOutputId === output.id ? "solid-button" : "ghost-button"}
            onClick={() => onSelectOutput(output.id)}
          >
            {output.name}
          </button>
        ))}
      </div>
      <div className="tab-row" role="tablist" aria-label="Compiler artifacts">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <pre className="debug-output">{content}</pre>
    </div>
  );
}
