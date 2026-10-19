import type { FilePage } from "@smthrs/rpc/FileRead"
import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import type { LatestCommit } from "../state/seams/LatestCommitSeam"

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
  /** Why a failed read failed (`failureDetail`), shown behind the README region's notice; absent when the file itself had nothing to show (binary). */
  error?: string
}, string>({ id: "repository-readme-reads", getKey: row => row.id }))

/**
 * The latest commit the Code home shows (repo-ui-spec view 1), and the tree and
 * blob views at their own ref (view 2, Design (H)), read per admission so a
 * repeat visit reads it again (#4342).
 */
export const repositoryLatestCommits = createCollection(localOnlyCollectionOptions<{
  id: string
  commit: LatestCommit
}, string>({ id: "repository-latest-commits", getKey: row => row.id }))

/** The home's row has no ref (the default bookmark); a code view's row is keyed by the ref it shows. */
export const latestCommitKey = (repo: string, requestId?: string, ref?: string) => `${requestId ?? ""}/${repo.toLowerCase()}${ref === undefined ? "" : `/${ref}`}`
export function setLatestCommit(id: string, commit: LatestCommit) {
  if (repositoryLatestCommits.has(id)) repositoryLatestCommits.update(id, draft => { draft.commit = commit })
  else repositoryLatestCommits.insert({ id, commit })
}

export const readmeReadKey = (repo: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}`
export function setReadmeRead(id: string, state: "loading" | "ready" | "failed", name: string, markdown?: string, error?: string) {
  if (repositoryReadmeReads.has(id)) repositoryReadmeReads.update(id, draft => { draft.state = state; draft.name = name; draft.markdown = markdown; draft.error = error })
  else repositoryReadmeReads.insert({ id, state, name, ...(markdown === undefined ? {} : { markdown }), ...(error === undefined ? {} : { error }) })
}

export const codeReadKey = (repo: string, kind: "tree" | "blob", location: string, requestId?: string) => `${requestId ?? ""}/${repo.toLowerCase()}/${kind}/${location}`
export function setCodeRead(id: string, state: "loading" | "ready" | "failed", error?: string, page?: FilePage) {
  const row = { id, state, page, ...(error === undefined ? {} : { error }) }
  if (repositoryCodeReads.has(id)) repositoryCodeReads.update(id, draft => { draft.state = state; draft.error = error; draft.page = page })
  else repositoryCodeReads.insert(row)
}
