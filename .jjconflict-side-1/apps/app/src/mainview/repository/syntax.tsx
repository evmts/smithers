import { Fragment } from "react"

const linesOf = (text: string) => text ? text.replace(/\n$/, "").split("\n") : []
type Token = { text: string; kind: string }
const keywords = new Set([
  "import", "from", "export", "default", "type", "interface", "class", "extends", "implements",
  "function", "const", "let", "var", "return", "new", "async", "await", "if", "else", "for",
  "of", "in", "while", "switch", "case", "break", "throw", "try", "catch", "finally", "typeof",
  "instanceof", "readonly", "private", "public", "protected", "static", "as", "this", "void"
])
const types = new Set(["string", "number", "boolean", "unknown", "never", "any", "true", "false", "null", "undefined"])

export const tokenize = (content: string): Token[][] => {
  let inComment = false
  return linesOf(content).map(line => {
    const result: Token[] = []
    let cursor = 0
    while (cursor < line.length) {
      const remaining = line.slice(cursor)
      if (inComment || remaining.startsWith("/*")) {
        const end = line.indexOf("*/", cursor + (inComment ? 0 : 2))
        const text = line.slice(cursor, end < 0 ? line.length : end + 2)
        result.push({ text, kind: "comment" })
        cursor += text.length
        inComment = end < 0
        continue
      }
      if (remaining.startsWith("//")) {
        result.push({ text: remaining, kind: "comment" })
        break
      }
      const match = remaining.match(/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\b\d+(?:\.\d+)?\b|\s+|.)/)
      const text = match?.[0] ?? remaining[0]
      const kind = /^["'`]/.test(text) ? "string"
        : keywords.has(text) ? "keyword"
        : types.has(text) || /^[A-Z][\w$]*$/.test(text) ? "type"
        : /^\d/.test(text) ? "number" : /^[A-Za-z_$]/.test(text) && /^\s*\(/.test(remaining.slice(text.length)) ? "fn" : "plain"
      result.push({ text, kind })
      cursor += text.length
    }
    return result
  })
}

export const Syntax = ({ code, term = "" }: { code: string; term?: string }) => <>{tokenize(code).map((line, i) => <Fragment key={i}>{i > 0 && "\n"}{line.map((token, j) => {
  const parts = term ? token.text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")) : [token.text]
  return <span className={`repo-code-token-${token.kind}`} key={j}>{parts.map((part, k) => term && part.toLowerCase() === term.toLowerCase() ? <mark key={k}>{part}</mark> : part)}</span>
})}</Fragment>)}{code.endsWith("\n") && "\n"}</>
