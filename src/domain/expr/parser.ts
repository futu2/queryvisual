import type { ColumnType } from "../schema/types";
import type { BinaryOp, Expr } from "./ast";

type Token =
  | { kind: "identifier"; value: string }
  | { kind: "number"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; value: string }
  | { kind: "keyword"; value: string };

const TOKEN_RE =
  /\s*(>=|<=|!=|[(),*/+-]|=|>|<|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b|\bcast\b|\bas\b|\band\b|\bor\b|\bnot\b|\bnull\b|\btrue\b|\bfalse\b|[A-Za-z_][A-Za-z0-9_.]*|\d+\.\d+|\d+|'[^']*')/giy;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(input)) !== null) {
    const value = match[1];
    const lower = value.toLowerCase();

    if (/^\d/.test(value)) {
      tokens.push({ kind: "number", value });
    } else if (value.startsWith("'")) {
      tokens.push({ kind: "string", value: value.slice(1, -1) });
    } else if (
      /^(case|when|then|else|end|cast|as|and|or|not|null|true|false)$/i.test(
        value,
      )
    ) {
      tokens.push({ kind: "keyword", value: lower });
    } else if (/^[(),*/+\-=<>!]$/.test(value) || /^(>=|<=|!=)$/.test(value)) {
      tokens.push({ kind: "symbol", value: lower });
    } else {
      tokens.push({ kind: "identifier", value });
    }
  }

  return tokens;
}

export function parseExpression(input: string): Expr {
  const tokens = tokenize(input);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => {
    const token = tokens[index];
    index += 1;
    return token;
  };

  const consumeKeyword = (keyword: string) => {
    const token = consume();
    if (!token || token.kind !== "keyword" || token.value !== keyword) {
      throw new Error(`Expected keyword ${keyword}`);
    }
  };

  const matchValue = (...values: string[]) => {
    const token = peek();
    return token ? values.includes(token.value) : false;
  };

  const parsePrimary = (): Expr => {
    const token = consume();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (token.kind === "number") {
      return { kind: "literal", value: Number(token.value) };
    }

    if (token.kind === "string") {
      return { kind: "literal", value: token.value };
    }

    if (token.kind === "keyword" && token.value === "null") {
      return { kind: "literal", value: null };
    }

    if (
      token.kind === "keyword" &&
      (token.value === "true" || token.value === "false")
    ) {
      return { kind: "literal", value: token.value === "true" };
    }

    if (token.kind === "symbol" && token.value === "(") {
      const expression = parseOr();
      if (!matchValue(")")) {
        throw new Error("Expected ')'");
      }
      consume();
      return expression;
    }

    if (token.kind === "keyword" && token.value === "case") {
      const branches: Array<{ when: Expr; then: Expr }> = [];

      while (matchValue("when")) {
        consumeKeyword("when");
        const when = parseOr();
        consumeKeyword("then");
        const then = parseOr();
        branches.push({ when, then });
      }

      let elseExpression: Expr | null = null;
      if (matchValue("else")) {
        consumeKeyword("else");
        elseExpression = parseOr();
      }

      consumeKeyword("end");
      return { kind: "case", branches, elseExpression };
    }

    if (token.kind === "keyword" && token.value === "cast") {
      if (!matchValue("(")) {
        throw new Error("Expected '(' after cast");
      }
      consume();
      const expression = parseOr();
      consumeKeyword("as");
      const typeToken = consume();
      if (!typeToken || typeToken.kind !== "identifier") {
        throw new Error("Expected type name after AS");
      }
      if (!matchValue(")")) {
        throw new Error("Expected ')'");
      }
      consume();
      return { kind: "cast", expression, to: typeToken.value as ColumnType };
    }

    if (token.kind === "identifier") {
      if (matchValue("(")) {
        consume();
        const args: Expr[] = [];
        while (!matchValue(")")) {
          args.push(parseOr());
          if (matchValue(",")) {
            consume();
          }
        }
        consume();
        return { kind: "call", name: token.value.toLowerCase(), args };
      }

      return { kind: "column", path: token.value.split(".") };
    }

    throw new Error(`Unexpected token ${token.value}`);
  };

  const parseUnary = (): Expr => {
    if (matchValue("-", "not")) {
      const token = consume();
      return {
        kind: "unary",
        op: token.value as "-" | "not",
        expression: parseUnary(),
      };
    }
    return parsePrimary();
  };

  const parseBinaryLayer = (next: () => Expr, operators: string[]): Expr => {
    let left = next();
    while (matchValue(...operators)) {
      const operator = consume().value as BinaryOp;
      const right = next();
      left = { kind: "binary", op: operator, left, right };
    }
    return left;
  };

  const parseMultiplicative = () => parseBinaryLayer(parseUnary, ["*", "/"]);
  const parseAdditive = () => parseBinaryLayer(parseMultiplicative, ["+", "-"]);
  const parseComparison = () =>
    parseBinaryLayer(parseAdditive, ["=", "!=", ">", ">=", "<", "<="]);
  const parseAnd = () => parseBinaryLayer(parseComparison, ["and"]);
  const parseOr = () => parseBinaryLayer(parseAnd, ["or"]);

  const parsed = parseOr();
  if (index !== tokens.length) {
    throw new Error("Unexpected trailing tokens");
  }
  return parsed;
}
