/*
 * Small syntax highlighter for the front pages: a sequential tokenizer for TypeScript and VibeLang source.
 * VibeLang's own forms (`error`, `service`, `catch`, `|>`, `%`, `!` in types) highlight as keywords.
 * Colors come from the --code-* variables defined in front.css.
 */
import type { ReactNode } from "react"
import { CodeScroll, CopyButton } from "./ui"

export type TokClass = "k" | "s" | "t" | "n" | "c" | "f"
export interface Tok { text: string; cls?: TokClass }

const KEYWORDS = new Set([
  "import", "from", "export", "class", "extends", "const", "let", "var", "return", "function",
  "if", "else", "new", "yield", "typeof", "interface", "type", "throw", "try", "finally",
  "async", "await", "for", "of", "in", "while", "switch", "case", "break", "continue", "default",
  "readonly", "static", "as", "this", "super", "implements", "declare", "abstract", "satisfies",
  /* VibeLang */
  "error", "service", "catch", "provide", "fork", "join", "using", "match", "when", "schema", "sync", "callback"
])

const TYPES = new Set([
  "string", "number", "boolean", "never", "unknown", "void", "any", "object", "symbol", "bigint",
  "ReadonlyArray", "Record", "Promise", "Effect", "Context", "Schema", "Schedule", "Layer",
  "Option", "Result", "Stream", "Chunk", "Duration", "Fiber", "Ref"
])

const RE = /(\/\/.*$)|(`(?:[^`\\]|\\.)*`)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\|>)|(!+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)|(%)/g

/** Tokenize one line. */
export const tokenizeLine = (line: string): Array<Tok> => {
  const out: Array<Tok> = []
  let last = 0
  RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RE.exec(line)) !== null) {
    if (match.index > last) out.push({ text: line.slice(last, match.index) })
    const [text, comment, template, dq, sq, pipe, bang, num, ident, topic] = match
    if (comment !== undefined) out.push({ text, cls: "c" })
    else if (template !== undefined || dq !== undefined || sq !== undefined) out.push({ text, cls: "s" })
    else if (pipe !== undefined || bang !== undefined || topic !== undefined) out.push({ text, cls: "k" })
    else if (num !== undefined) out.push({ text, cls: "n" })
    else if (ident !== undefined) {
      const rest = line.slice(match.index + text.length)
      if (KEYWORDS.has(text)) out.push({ text, cls: "k" })
      else if (TYPES.has(text) || /^[A-Z]/.test(text)) out.push({ text, cls: "t" })
      else if (rest.startsWith("(")) out.push({ text, cls: "f" })
      else out.push({ text })
    }
    last = match.index + text.length
  }
  if (last < line.length) out.push({ text: line.slice(last) })
  return out
}

export const tokenize = (code: string): Array<Array<Tok>> => code.replace(/\n$/, "").split("\n").map(tokenizeLine)

export const nonBlankLines = (code: string) => code.split("\n").filter(line => line.trim() !== "").length

/** Render one tokenized line; `wrap` can replace a token's span (used for the nameOf type tooltip). */
export const renderLine = (line: Array<Tok>, wrap?: (tok: Tok, key: number, node: ReactNode) => ReactNode): ReactNode =>
  line.map((tok, i) => {
    const node = tok.cls === undefined
      ? <span key={i}>{tok.text}</span>
      : <span key={i} className={`front-tok-${tok.cls}`}>{tok.text}</span>
    return wrap !== undefined ? wrap(tok, i, node) : node
  })

/** Prefer a file path, then Terminal, Output, and the explicit fence language. */
export const codeBlockLabel = (code: string, language = "", fallback = "TypeScript"): string => {
  const path = language.match(/(?:^|\s)(?:title=|filename=)?["']?((?:[\w@.-]+\/)*[\w.-]+\.(?:vibe|effeck|tsx?|jsx?|json|ya?ml|toml|md|sh))["']?(?:\s|$)/i)
    ?? code.match(/^\s*(?:\/\/|#)\s*((?:[\w@.-]+\/)*[\w.-]+\.(?:vibe|effeck|tsx?|jsx?|json|ya?ml|toml|md|sh))\s*$/m)
  if (path) return path[1]
  const lang = language.split(/\s/)[0].toLowerCase()
  if (["sh", "shell", "bash", "zsh", "console"].includes(lang)) return "Terminal"
  if (["out", "output", "text", "plaintext"].includes(lang)) return "Output"
  if (["ts", "typescript", "tsx"].includes(lang) && language.split(/\s+/).includes("effect")) return "Effect"
  if (["vibe", "effeck", "ef"].includes(lang)) return "VibeLang"
  if (["ts", "typescript", "tsx"].includes(lang)) return "TypeScript"
  if (lang === "json") return "JSON"
  return language || fallback
}

/** A read-only highlighted code block with optional line numbers, for docs pages. Scrolls inside itself. */
export const CodeBlock = ({ code, numbers = false, label, language }: { code: string; numbers?: boolean; label?: string; language?: string }) => (
  <div className="front-codeblock">
    <div className="front-codeblock-toolbar">
      <span className="front-codeblock-label">{label || codeBlockLabel(code, language)}</span>
      <CopyButton text={code} className="front-btn-xs" />
    </div>
    <CodeScroll><pre className="front-code" data-numbers={numbers || undefined}><code>
      {tokenize(code).map((line, i) => (
        <span className="front-code-line" key={i}>
          {numbers && <span className="front-code-num" aria-hidden="true">{i + 1}</span>}
          <span className="front-code-src">{(label || codeBlockLabel(code, language)) === "Output" ? line.map(tok => tok.text).join("") : renderLine(line)}</span>
        </span>
      ))}
    </code></pre></CodeScroll>
  </div>
)
