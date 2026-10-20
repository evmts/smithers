import { readFileSync } from "node:fs"
import { type Page } from "./checks.ts"
export const fixtures = [
  { name: "good-ui", expected: "pass", scores: [1, 1, 1, 1] },
  { name: "good-terminal", expected: "pass", scores: [1, 1, 1, 1] },
  { name: "good-reference", expected: "pass", scores: [1, 1, 1, 1] },
  { name: "bad-no-shot", expected: "fail", scores: [1, 0, 1, 1] },
  { name: "bad-button", expected: "fail", scores: [1, 1, 1, 1] },
  { name: "bad-marketing", expected: "fail", scores: [1, 1, 1, 1] }
] as const
export const fixture = (name: string): Page => ({
  slug: name,
  markdown: readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), "utf8"),
  captures: [{
    id: "home",
    build: "fixture-build",
    alt: "The repository home with the Files button",
    path: "/owner/repo",
    themes: { light: { file: "home.light.webp" }, dark: { file: "home.dark.webp" } }
  }],
  files: ["home.light.webp", "home.dark.webp"],
  build: "fixture-build",
  runs: [],
  cliHelp: readFileSync(new URL("./fixtures/cli-help.txt", import.meta.url), "utf8")
})
