import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import type { GraphDocument, GraphWorkspace } from "../../domain/document/types";
import { isGraphWorkspaceLikeRuntime, normalizeGraphWorkspaceLikeRuntime } from "../../domain/document/types";
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
  initialWorkspace,
  initialDocument,
}: {
  children: ReactNode;
  initialWorkspace?: GraphWorkspace;
  initialDocument?: GraphDocument;
}) {
  const initialState = initialWorkspace ?? initialDocument;
  const previousInitialState = useRef(initialState);
  const [state, dispatch] = useReducer(
    documentReducer,
    initialState,
    createInitialEditorState,
  );

  useEffect(() => {
    if (!initialState || initialState === previousInitialState.current) {
      previousInitialState.current = initialState;
      return;
    }

    if (isGraphWorkspaceLikeRuntime(initialState)) {
      dispatch({ type: "replace-workspace", workspace: normalizeGraphWorkspaceLikeRuntime(initialState) });
    } else {
      dispatch({ type: "replace-document", document: initialState });
    }

    previousInitialState.current = initialState;
  }, [initialState]);

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
