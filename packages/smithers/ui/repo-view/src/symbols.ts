/**
 * The code view's keyboard cursor: a symbol, never a character, because the
 * view reads code and never edits it. These are the pure rules; the view
 * reads the tokens pierre drew and moves the cursor through them.
 */

/** A token the view drew, 1-based, the way the cursor and the pointer name one. */
export interface CodeSymbol {
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

/** The keys that move the cursor. */
export type CursorKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const CURSOR_KEYS: ReadonlySet<string> = new Set<CursorKey>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Words a language reserves: a cursor on one would have nothing to say. */
const KEYWORDS: ReadonlySet<string> = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "declare",
  "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get",
  "if", "implements", "import", "in", "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "null", "of",
  "private", "protected", "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this",
  "throw", "true", "try", "type", "typeof", "undefined", "var", "void", "while", "with", "yield"
]);

/** Whether a token's text names a symbol: an identifier that isn't a reserved word. */
export const isSymbolText = (text: string): boolean => IDENTIFIER.test(text) && !KEYWORDS.has(text);

const byPosition = (left: CodeSymbol, right: CodeSymbol) => left.line - right.line || left.column - right.column;

/** On `line`, the symbol whose column is nearest `column`. */
const nearestOn = (symbols: ReadonlyArray<CodeSymbol>, line: number, column: number): CodeSymbol | undefined =>
  symbols
    .filter((symbol) => symbol.line === line)
    .reduce<CodeSymbol | undefined>(
      (best, symbol) =>
        best === undefined || Math.abs(symbol.column - column) < Math.abs(best.column - column) ? symbol : best,
      undefined,
    );

/**
 * Where `key` moves the cursor among `symbols`: the previous or next symbol,
 * or the nearest one on the closest line above or below that has any. With
 * no cursor, every key lands on the first symbol at or after `anchor` (a
 * 1-based line), else on the first one. At either end the cursor stays.
 */
export const moveCursor = (
  symbols: ReadonlyArray<CodeSymbol>,
  cursor: { readonly line: number; readonly column: number } | undefined,
  key: CursorKey,
  anchor = 1,
): CodeSymbol | undefined => {
  const ordered = [...symbols].sort(byPosition);
  if (cursor === undefined) return ordered.find((symbol) => symbol.line >= anchor) ?? ordered[0];
  const at = ordered.findIndex((symbol) => byPosition(symbol, { ...cursor, text: "" }) >= 0);
  const here = at === -1 ? ordered.length : at;
  const exact = ordered[here]?.line === cursor.line && ordered[here]?.column === cursor.column;
  switch (key) {
    case "ArrowRight":
      return ordered[exact ? here + 1 : here] ?? ordered[here];
    case "ArrowLeft":
      return ordered[here - 1] ?? ordered[here];
    case "ArrowDown": {
      const below = ordered.find((symbol) => symbol.line > cursor.line);
      return below === undefined ? ordered[here] : nearestOn(ordered, below.line, cursor.column);
    }
    case "ArrowUp": {
      const above = ordered.findLast((symbol) => symbol.line < cursor.line);
      return above === undefined ? ordered[here] : nearestOn(ordered, above.line, cursor.column);
    }
  }
};
