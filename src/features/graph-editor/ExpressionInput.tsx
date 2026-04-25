import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphDocument } from "../../domain/document/types";
import { analyzeExpression } from "../../domain/expr/analyze";
import { buildExpressionScope } from "../../domain/graph/expressionScope";

type ExpressionInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  document: GraphDocument;
  nodeId: string;
  multiline?: boolean;
};

type TokenPrefix = {
  start: number;
  prefix: string;
};

function isTokenChar(char: string) {
  // Identifiers and namespaces in this app use dotted paths.
  // Keep this conservative to avoid consuming operators/whitespace.
  return /[A-Za-z0-9_.]/.test(char);
}

function getTokenPrefixAt(value: string, cursor: number): TokenPrefix {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  let start = safeCursor;
  while (start > 0 && isTokenChar(value[start - 1]!)) start--;
  return { start, prefix: value.slice(start, safeCursor) };
}

export function ExpressionInput({
  label,
  value,
  onChange,
  document,
  nodeId,
  multiline = false,
}: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [caret, setCaret] = useState<number>(value.length);

  const scope = useMemo(() => buildExpressionScope(document, nodeId), [document, nodeId]);
  const analysis = useMemo(() => analyzeExpression(value, scope), [value, scope]);

  // Keep caret in sync while typing and while controlled value updates.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const nextCaret = el.selectionStart ?? value.length;
    if (Number.isFinite(nextCaret)) setCaret(nextCaret);
  }, [value]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const selection = pendingSelection.current;
    if (!el || !selection) return;
    pendingSelection.current = null;
    el.focus();
    try {
      el.setSelectionRange(selection.start, selection.end);
    } catch {
      // Ignore (e.g. element type doesn't support selection range).
    }
  }, [value]);

  const token = useMemo(() => getTokenPrefixAt(value, caret), [value, caret]);
  const suggestions = useMemo(() => {
    if (token.prefix.trim() === "") return [];
    return scope.suggestions.filter((sugg) => sugg.insertText.startsWith(token.prefix));
  }, [scope.suggestions, token.prefix]);

  function updateCaretFromTarget(target: HTMLInputElement | HTMLTextAreaElement) {
    const nextCaret = target.selectionStart;
    if (typeof nextCaret === "number") setCaret(nextCaret);
  }

  const commonFieldProps = {
    ref: inputRef as any,
    value,
    onChange: (event: any) => {
      updateCaretFromTarget(event.currentTarget);
      onChange(event.currentTarget.value);
    },
    onSelect: (event: any) => {
      updateCaretFromTarget(event.currentTarget);
    },
    onKeyUp: (event: any) => {
      updateCaretFromTarget(event.currentTarget);
    },
    onClick: (event: any) => {
      updateCaretFromTarget(event.currentTarget);
    },
  };

  return (
    <div className="expression-input">
      <label>
        {label}
        {multiline ? <textarea {...commonFieldProps} /> : <input {...commonFieldProps} />}
      </label>

      {suggestions.length > 0 ? (
        <div className="expression-suggestions" aria-label="Suggestions">
          {suggestions.map((sugg) => (
            <button
              key={sugg.key}
              type="button"
              className="expression-suggestion"
              aria-label={`Insert ${sugg.insertText}`}
              onClick={() => {
                const el = inputRef.current;
                const cursor = el?.selectionStart ?? caret;
                const { start, prefix } = getTokenPrefixAt(value, cursor);
                // Replace only the current token prefix.
                const next =
                  value.slice(0, start) + sugg.insertText + value.slice(start + prefix.length);
                pendingSelection.current = {
                  start: start + sugg.insertText.length,
                  end: start + sugg.insertText.length,
                };
                onChange(next);
              }}
            >
              {sugg.label}
            </button>
          ))}
        </div>
      ) : null}

      {analysis.diagnostics.length > 0 ? (
        <div className="expression-diagnostics" role="status" aria-label="Diagnostics">
          {analysis.diagnostics.map((diag, index) => (
            <div key={`${diag.code}:${index}`} className="expression-diagnostic">
              {diag.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
