import { z } from "zod"
import { RepositoryTabsSchema } from "@smthrs/rpc/RepositoryHome"
import { sharedContentsPath } from "../state/seams/RepoTreeSeam"
import { readContentsPages } from "../state/seams/ContentsPages"
import { unsafePath } from "../state/seams/FilesSeam"
import type { SeamContext } from "../state/seams/SeamContext"

import type { DeclaredTabsData } from "./DeclaredTabsModel"
export type { DeclaredTabsData } from "./DeclaredTabsModel"

type ReaderContext = Pick<SeamContext, "http" | "baseUrl">

const fileText = (body: unknown): string => {
  const parsed = z.object({ content: z.string(), encoding: z.enum(["base64", "utf-8", "utf8"]).optional(), truncated: z.boolean().optional() }).parse(body)
  if (parsed.truncated) throw new Error("File is truncated")
  return parsed.encoding === "base64" ? new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(parsed.content.replace(/\s/g, "")), c => c.charCodeAt(0))) : parsed.content
}
const readContents = async (ctx: ReaderContext, repo: string, path: string): Promise<unknown> => {
  if (unsafePath(path)) throw new Error("Invalid repository path")
  const result = await readContentsPages(ctx.http, `${ctx.baseUrl}${sharedContentsPath(repo, path)}`)
  if (result.kind === "error") throw new Error(result.error)
  if (!result.response.ok) throw new Error(`Could not read ${path} (${result.response.status})`)
  return result.body
}
const listContents = async (ctx: ReaderContext, repo: string, path: string) => {
  const entries = z.array(z.object({ name: z.string().min(1), type: z.enum(["file", "dir"]) })).parse(await readContents(ctx, repo, path))
  if (entries.some(entry => entry.name.includes("/") || entry.name.includes("\\") || unsafePath(entry.name))) throw new Error("Invalid directory entry")
  return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}

export function docsNavigation(source: string, nav: string, root: string): { title: string; path?: string }[] {
  const entries: { title: string; path?: string; level: number }[] = []
  for (const line of source.split("\n")) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    const group = /^(\s*)[-*+]\s+\*\*(.+?)\*\*\s*$/.exec(line)
    if (heading || group) {
      entries.push({ title: heading?.[2] ?? group![2]!, level: heading ? heading[1]!.length : 7 + group![1]!.length })
      continue
    }
    const link = /^\s*(?:(?:[-*+]|\d+\.)\s+)?\[([^\]]+)\]\(([^)]+)\)/.exec(line)
    if (!link || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(link[2]!)) continue
    try {
      const url = new URL(link[2]!, `https://docs.invalid/${nav}`)
      if (url.origin !== "https://docs.invalid" || unsafePath(url.pathname.slice(1))) continue
      const path = decodeURIComponent(url.pathname.slice(1))
      if (!path.startsWith(`${root}/`) || !/\.md$/i.test(path) || unsafePath(path)) continue
      entries.push({ title: link[1]!, path: path.slice(root.length + 1), level: 100 })
    } catch { /* An invalid link cannot name a documentation page. */ }
  }
  return entries.filter((entry, index) => {
    if (entry.path) return true
    for (const next of entries.slice(index + 1)) {
      if (next.level <= entry.level) return false
      if (next.path) return true
    }
    return false
  }).map(({ title, path }) => path === undefined ? { title } : { title, path })
}

export async function readDeclaredTabs(ctx: ReaderContext, repo: string): Promise<DeclaredTabsData> {
  let tabs: z.infer<typeof RepositoryTabsSchema>["tabs"]
  try {
    const response = await ctx.http(`${ctx.baseUrl}${sharedContentsPath(repo, ".smithers/ui/tabs.json")}`)
    if (response.status === 404) return { tabs: [] }
    if (!response.ok) return { tabs: [], error: `Could not read tabs (${response.status})` }
    try { tabs = RepositoryTabsSchema.parse(JSON.parse(fileText(await response.json()))).tabs }
    catch { console.warn("Invalid .smithers/ui/tabs.json"); return { tabs: [] } }
  } catch (error) { return { tabs: [], error: String(error) } }
  return { tabs: await Promise.all(tabs.map(async declaration => {
    const navigation: { title: string; path?: string }[] = []
    const cases: string[] = []
    let entries = 0
    const walk = async (root: string, relative = "", depth = 0): Promise<void> => {
      if (depth > 16) throw new Error("Directory tree is too deep")
      const children = await listContents(ctx, repo, `${root}${relative ? `/${relative}` : ""}`)
      entries += children.length
      if (entries > 1000) throw new Error("Directory tree exceeds 1,000 entries")
      await Promise.all(children.map(async entry => {
        const path = relative ? `${relative}/${entry.name}` : entry.name
        if (entry.type === "dir") await walk(root, path, depth + 1)
        else if (/\.md$/i.test(path)) navigation.push({ path, title: docsFileTitle(path) })
      }))
    }
    try {
      if (declaration.type === "docs") {
        if (declaration.nav) navigation.push(...docsNavigation(fileText(await readContents(ctx, repo, declaration.nav)), declaration.nav, declaration.root))
        else { await walk(declaration.root); navigation.sort((a, b) => a.path! < b.path! ? -1 : a.path! > b.path! ? 1 : 0) }
      } else cases.push(...(await listContents(ctx, repo, declaration.cases)).filter(entry => entry.type === "dir").map(entry => entry.name))
      return { declaration, files: [], cases, navigation }
    } catch (error) { return { declaration, files: [], cases: [], error: error instanceof Error ? error.message : String(error) } }
  })) }
}

export function docsFileTitle(path: string): string {
  const name = path.split("/").at(-1)!.replace(/\.md$/i, "")
  return name.replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ") || name
}

export async function readDeclaredContent(ctx: ReaderContext, repo: string, tab: DeclaredTabsData["tabs"][number], selection: string) {
  if (unsafePath(selection) || selection.startsWith("/")) throw new Error("Invalid repository path")
  if (tab.declaration.type === "docs") {
    const content = fileText(await readContents(ctx, repo, `${tab.declaration.root}/${selection}`))
    return [{ path: selection, content }]
  }
  const root = `${tab.declaration.cases}/${selection}`
  const entries = await listContents(ctx, repo, root)
  return Promise.all(entries.filter(entry => entry.type === "file").map(async entry => ({
    path: `${selection}/${entry.name}`, content: fileText(await readContents(ctx, repo, `${root}/${entry.name}`))
  })))
}

export function docsLink(repo: string, page: string, href: string): string {
  if (!/^(?![a-z][a-z\d+.-]*:|\/|#).*\.md(?:[?#].*)?$/i.test(href)) return href
  const base = new URL(`https://docs.invalid/${page}`)
  const target = new URL(href, base)
  if (target.origin !== base.origin) return href
  return `/${repo}/docs${target.pathname}${target.search}${target.hash}`
}
