import { MOCK_NOW, people, pulls, releases, repo, runs, tags, to, tree } from "../../fixtures"
import type { Release, Run } from "../../fixtures/types"

const storageKey = () => `repo-releases-local:${repo.slug}`

export const readPublished = (): Release[] => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey()) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter((item): item is Release => item !== null && typeof item === "object"
      && typeof item.tag === "string" && typeof item.name === "string" && typeof item.body === "string"
      && typeof item.author === "string" && typeof item.date === "string" && Array.isArray(item.pulls))
  } catch { return [] }
}

export const savePublished = (items: Release[]) => {
  try { sessionStorage.setItem(storageKey(), JSON.stringify(items)) } catch { /* Local view state still updates. */ }
}

export const releaseList = (local: Release[], empty = false): Release[] => {
  if (empty) return []
  const items = [...local, ...releases.filter(item => !local.some(added => added.tag === item.tag))]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const latest = items.find(item => !item.prerelease)
  return items.map(item => ({ ...item, latest: latest?.tag === item.tag }))
}

export const notesRun = (item: Release): Run | undefined => runs.find(run => {
  if (run.flow !== "release-notes" || run.state !== "succeeded" || Date.parse(run.started) > Date.parse(item.date)) return false
  const tokens = run.title.split(/[\s,;:()]+/)
  return tokens.includes(item.tag)
})

export const changesForTag = (tag: string) => {
  const target = tags.find(item => item.name === tag)
  const previous = [...tags]
    .filter(item => item.name !== tag && (!target || Date.parse(item.date) < Date.parse(target.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
  const changes = pulls.filter(item => item.state === "merged" && item.merged
    && (!previous || Date.parse(item.merged.date) > Date.parse(previous.date))
    && (!target || Date.parse(item.merged.date) <= Date.parse(target.date)))
    .sort((a, b) => Date.parse(b.merged!.date) - Date.parse(a.merged!.date))
  return { previous, changes }
}

export const generateNotes = (tag: string) => {
  const { previous, changes } = changesForTag(tag)
  const body = changes.length
    ? changes.map(item => `- ${item.title} ([#${item.n}](pull/${item.n}))`).join("\n")
    : `No landed changes${previous ? ` since ${previous.name}` : ""}.`
  return `## Changes\n\n${body}`
}

export const releaseTagError = (tag: string): string | undefined => {
  if (!tag.trim()) return "Enter a tag."
  if (/\s|[~^:?*\\\[\]]/.test(tag) || tag.includes("..") || tag.includes("@{")
    || tag.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))) {
    return "Use a tag without spaces or special characters."
  }
  return undefined
}

export const makeRelease = (tag: string, title: string, notes: string): Release => {
  const error = releaseTagError(tag.trim())
  if (error) throw new Error(error)
  if (!title.trim() || !notes.trim()) throw new Error("Enter a release title and notes.")
  return {
    tag: tag.trim(), name: title.trim(), body: notes.trim(), date: MOCK_NOW,
    author: people.find(person => person.role === "owner")?.login ?? repo.owner,
    prerelease: /\d-/.test(tag), pulls: changesForTag(tag).changes.map(item => item.n)
  }
}

/** Source bytes, rather than invented compressed archive sizes. */
export const sourceSize = () => {
  const bytes = tree.reduce((sum, item) => sum + (item.kind === "file" ? item.size ?? 0 : 0), 0)
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB source`
    : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB source` : `${bytes} B source`
}

export const releaseMarkdown = (source: string) => {
  if (!repo.github) return source
  return source.split(`${repo.github}/pull/`).join(`${to("pull")}/`)
    .split(`${repo.github}/issues/`).join(`${to("issues")}/`)
}
