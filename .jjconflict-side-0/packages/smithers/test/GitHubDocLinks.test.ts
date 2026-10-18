/** Public GitHub markdown must link to files rather than website-root routes. */
import { readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it.each(["installation.md", "guides/diagnose-a-run.md"])(
  "resolves reference links from GitHub-rendered %s",
  async (name) => {
    const source = new URL(`../docs/${name}`, import.meta.url)
    const doc = await readFile(source, "utf8")
    const links = [...doc.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!)
    expect(links.filter((link) => /^\/(api|cli)\//.test(link))).toEqual([])
    for (const link of links.filter((link) => link.startsWith("."))) {
      const target = new URL(link.split("#")[0]!, source)
      expect((await stat(fileURLToPath(target))).isFile(), link).toBe(true)
    }
  }
)
