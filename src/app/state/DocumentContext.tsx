import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { GraphDocument } from "../../domain/document/types";
import {
  createInitialEditorState,
  documentReducer,
  type EditorAction,
  type EditorState,
} from "./documentReducer";

interface DocumentContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({
  children,
  initialDocument,
}: {
  children: ReactNode;
  initialDocument?: GraphDocument;
}) {
  const [state, dispatch] = useReducer(
    documentReducer,
    createInitialEditorState(initialDocument),
  );

  return (
    <DocumentContext.Provider value={{ state, dispatch }}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocumentContext() {
  const value = useContext(DocumentContext);
  if (!value) {
    throw new Error("DocumentContext is missing");
  }
  return value;
}
