import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { useRef } from "react";
import { useOutputRuntime } from "./features/output-runtime/outputRuntime";
import type { GraphDocument, GraphWorkspace } from "./domain/document/types";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";
import { InstalledPackageList } from "./features/packages/InstalledPackageList";
import { GraphCatalog } from "./features/workspace/GraphCatalog";
import { I18nProvider, useI18n } from "./features/i18n/I18nContext";

export function AppLayout() {
  const { state } = useDocumentContext();
  const outputRuntime = useOutputRuntime(state.workspace, state.activeGraphId);
  const editorTransitionRef = useRef<(action: () => void) => void>((action) =>
    action(),
  );
  const { t } = useI18n();

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>{t("app.title")}</h1>
        <p className="muted">{t("app.subtitle")}</p>
        <DocumentToolbar />
        <GraphCatalog
          runGraphMutation={(action) => editorTransitionRef.current(action)}
        />
        <InstalledPackageList packages={state.workspace.installedPackages} />
        <NodePalette />
      </aside>

      <main
        className="pane canvas-pane"
      >
        <h2>{t("app.canvasTitle")}</h2>
        <GraphCanvas
          outputRuntime={outputRuntime}
          registerEditorTransition={(runner) => {
            editorTransitionRef.current = runner;
          }}
        />
      </main>
    </div>
  );
}

export function App({
  initialWorkspace,
  initialDocument,
}: {
  initialWorkspace?: GraphWorkspace;
  initialDocument?: GraphDocument;
}) {
  return (
    <I18nProvider>
      <DocumentProvider
        initialWorkspace={initialWorkspace}
        initialDocument={initialDocument}
      >
        <AppLayout />
      </DocumentProvider>
    </I18nProvider>
  );
}
