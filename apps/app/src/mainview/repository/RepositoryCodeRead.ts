import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"

/** Read progress belongs to the route reader; React only projects its result. */
export const repositoryCodeReads = createCollection(localOnlyCollectionOptions<{
  id: string
  state: "loading" | "ready" | "failed"
  error?: string
}, string>({ id: "repository-code-reads", getKey: row => row.id }))

export const codeReadKey = (repo: string, kind: "tree" | "blob", location: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}/${kind}/${location}`
export function setCodeRead(id: string, state: "loading" | "ready" | "failed", error?: string) {
  const row = { id, state, ...(error === undefined ? {} : { error }) }
  if (repositoryCodeReads.has(id)) repositoryCodeReads.update(id, draft => { draft.state = state; draft.error = error })
  else repositoryCodeReads.insert(row)
}
