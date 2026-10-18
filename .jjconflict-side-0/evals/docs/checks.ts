import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface Capture {
  id: string
  build?: string
  [key: string]: unknown
}
export interface Run {
  agent: string
  date: string
  result: "pass" | "fail"
  receipt: string
}
export interface Page {
  slug: string
  markdown: string
  captures: Capture[]
  files: string[]
  build?: string
  runs: Run[]
  cliHelp: string
}
export interface Score {
  score: number
  reason: string
}
export const body = (markdown: string) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim()
// Code examples are not rendered headings or screenshots.
export const prose = (markdown: string) =>
  body(markdown).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (block) => block.replace(/[^\n]/g, " "))
export const images = (markdown: string) =>
  [...prose(markdown).matchAll(/!\[([^\]]*)\]\(images\/([^\s)]+)\.webp\)/g)].map((m) => ({ alt: m[1]!, id: m[2]! }))
export const steps = (markdown: string) => {
  const text = body(markdown)
  const headings = [...prose(text).matchAll(/^## (.+)$/gm)]
  return headings.flatMap((m, i) =>
    /^\d+\.\s/.test(m[1]!)
      ? [{ title: m[1]!, text: text.slice(m.index! + m[0].length, headings[i + 1]?.index ?? text.length) }]
      : []
  )
}
const pass = (reason = "ok"): Score => ({ score: 1, reason })
const fail = (reason: string): Score => ({ score: 0, reason })
export const checks = {
  "images-resolve": (page: Page): Score => {
    for (const image of images(page.markdown)) {
      if (!image.alt.trim()) return fail(`${image.id}: empty alt`)
      for (const theme of ["light", "dark"]) {
        if (!page.files.includes(`${image.id}.${theme}.webp`)) return fail(`${image.id}: missing ${theme} image`)
      }
      if (!page.captures.some((c) => c.id === image.id)) return fail(`${image.id}: missing manifest entry`)
    }
    return pass()
  },
  "steps-have-shots": (page: Page): Score => {
    for (const step of steps(page.markdown)) {
      if (!images(step.text).length && !/^(`{3,}|~{3,})sh\s*\n[\s\S]*?^\1\s*$/m.test(step.text)) {
        return fail(`${step.title}: no screenshot or sh block`)
      }
    }
    return pass()
  },
  anatomy: (page: Page): Score => {
    const intro =
      prose(page.markdown).split(/^#{1,6}\s/m)[0]!.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim().split(/\n\s*\n/)[0] ?? ""
    if (!intro || !/[.!?](?:\s|$)/.test(intro) || /^\*\*Before you start:/.test(intro)) {
      return fail("missing opening purpose sentence")
    }
    const numbered = steps(page.markdown)
    if (numbered.length) {
      if (!/^\*\*Before you start:\*\*\s+\S/m.test(prose(page.markdown))) return fail("missing prerequisites")
      if (numbered.some((s, i) => !s.title.startsWith(`${i + 1}. `))) return fail("steps not sequential")
      for (const heading of ["Result", "Next steps"]) {
        if (!prose(page.markdown).split("\n").includes(`## ${heading}`)) return fail(`missing ${heading}`)
      }
    }
    return pass()
  },
  "fresh-captures": (page: Page): Score => {
    if (!page.build) return pass("build unknown")
    for (const { id } of images(page.markdown)) {
      if (page.captures.find((c) => c.id === id)?.build !== page.build) {
        return fail(`${id}: build differs from ${page.build}`)
      }
    }
    return pass()
  },
  journey: (page: Page): Score => {
    let count = 0
    // The array is chronological; only consecutive most recent valid passes count.
    for (const run of [...page.runs].reverse()) {
      if (run.result !== "pass" || !run.agent.trim() || !run.receipt.trim() || !Number.isFinite(Date.parse(run.date))) {
        break
      }
      if (++count === 2) break
    }
    return { score: count / 2, reason: page.runs.length ? `${count}/2 consecutive passing runs` : "no journey receipt" }
  }
}
export async function currentBuild(): Promise<string | undefined> {
  if (process.env.DOCS_EVAL_BUILD?.trim()) return process.env.DOCS_EVAL_BUILD.trim()
  try {
    const response = await fetch("https://smithers.sh/__build.json", { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return undefined
    const data = await response.json() as Record<string, unknown>
    const sha = data.gitSha ?? data.sha ?? data.commit ?? data.build
    return typeof sha === "string" && sha.trim() ? sha : undefined
  } catch {
    return undefined
  }
}
export function loadPage(root: string, slug: string, build?: string): Page {
  const markdown = readFileSync(join(root, "pages", `${slug}.md`), "utf8")
  const captures = JSON.parse(readFileSync(join(root, "images/captures.json"), "utf8")) as Capture[]
  const receiptsFile = new URL("./receipts.json", import.meta.url)
  const receipts = existsSync(receiptsFile) ? JSON.parse(readFileSync(receiptsFile, "utf8")) : {}
  return {
    slug,
    markdown,
    captures,
    build,
    runs: receipts[slug]?.runs ?? [],
    cliHelp: readFileSync(new URL("./fixtures/cli-help.txt", import.meta.url), "utf8"),
    files: images(markdown).flatMap(({ id }) => ["light", "dark"].map((theme) => `${id}.${theme}.webp`)).filter((
      file
    ) => existsSync(join(root, "images", file)))
  }
}
