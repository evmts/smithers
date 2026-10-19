import type { FilePage } from "@smthrs/rpc/FileRead"
import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"

/** Read progress belongs to the route reader; React only projects its result. */
export const repositoryCodeReads = createCollection(localOnlyCollectionOptions<{
  id: string
  state: "loading" | "ready" | "failed"
  error?: string
  page?: FilePage
}, string>({ id: "repository-code-reads", getKey: row => row.id }))

/**
 * The repository README the Code home reads below Files when the declared
 * home carries none (repo-ui-spec view 1: blocks, then Files, then README):
 * the same contents read the tree uses, keyed by the admission it belongs to.
 */
export const repositoryReadmeReads = createCollection(localOnlyCollectionOptions<{
  id: string
  state: "loading" | "ready" | "failed"
  /** The file's own name in the tree (README.md, readme.markdown, README). */
  name: string
  markdown?: string
}, string>({ id: "repository-readme-reads", getKey: row => row.id }))

export const readmeReadKey = (repo: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}`
export function setReadmeRead(id: string, state: "loading" | "ready" | "failed", name: string, markdown?: string) {
  if (repositoryReadmeReads.has(id)) repositoryReadmeReads.update(id, draft => { draft.state = state; draft.name = name; draft.markdown = markdown })
  else repositoryReadmeReads.insert({ id, state, name, ...(markdown === undefined ? {} : { markdown }) })
}

export const codeReadKey = (repo: string, kind: "tree" | "blob", location: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}/${kind}/${location}`
export function setCodeRead(id: string, state: "loading" | "ready" | "failed", error?: string, page?: FilePage) {
  const row = { id, state, page, ...(error === undefined ? {} : { error }) }
  if (repositoryCodeReads.has(id)) repositoryCodeReads.update(id, draft => { draft.state = state; draft.error = error; draft.page = page })
  else repositoryCodeReads.insert(row)
}
