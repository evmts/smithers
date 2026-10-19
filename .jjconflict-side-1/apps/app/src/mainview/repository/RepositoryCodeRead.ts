import type { FilePage } from "@smthrs/rpc/FileRead"
import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"

/** Read progress belongs to the route reader; React only projects its result. */
export const repositoryCodeReads = createCollection(localOnlyCollectionOptions<{
  id: string
  state: "loading" | "ready" | "failed"
  error?: string
  page?: FilePage
}, string>({ id: "repository-code-reads", getKey: row => row.id }))

export const codeReadKey = (repo: string, kind: "tree" | "blob", location: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}/${kind}/${location}`
export function setCodeRead(id: string, state: "loading" | "ready" | "failed", error?: string, page?: FilePage) {
  const row = { id, state, page, ...(error === undefined ? {} : { error }) }
  if (repositoryCodeReads.has(id)) repositoryCodeReads.update(id, draft => { draft.state = state; draft.error = error; draft.page = page })
  else repositoryCodeReads.insert(row)
}
