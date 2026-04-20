import { useRef } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { downloadDocument, parseDocumentJson } from "./fileIO";

export function DocumentToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state, dispatch } = useDocumentContext();

  return (
    <div className="toolbar-row">
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
          const raw = await file.text();
          dispatch({
            type: "replace-document",
            document: parseDocumentJson(raw),
          });
        }}
      />
    </div>
  );
}
