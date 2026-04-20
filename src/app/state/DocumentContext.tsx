import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
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
  const previousInitialDocument = useRef(initialDocument);
  const [state, dispatch] = useReducer(
    documentReducer,
    initialDocument,
    createInitialEditorState,
  );

  useEffect(() => {
    if (
      initialDocument &&
      initialDocument !== previousInitialDocument.current
    ) {
      dispatch({ type: "replace-document", document: initialDocument });
    }

    previousInitialDocument.current = initialDocument;
  }, [initialDocument]);

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
