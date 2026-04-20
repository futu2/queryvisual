import { useRef, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { downloadDocument, parseDocumentJson } from "./fileIO";

export function DocumentToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { state, dispatch } = useDocumentContext();

  return (
    <div className="toolbar-row">
      {loadError ? <p role="alert">{loadError}</p> : null}
      <button
        type="button"
        className="ghost-button"
        onClick={() => downloadDocument(state.document)}
      >
        Save JSON
      </button>
      <button
        type="button"
        className="ghost-button"
        onClick={() => fileInputRef.current?.click()}
      >
        Load JSON
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          try {
            const raw = await file.text();
            dispatch({
              type: "replace-document",
              document: parseDocumentJson(raw),
            });
            setLoadError(null);
          } catch {
            setLoadError("Could not load QueryVisual document.");
          } finally {
            event.target.value = "";
          }
        }}
      />
    </div>
  );
}
