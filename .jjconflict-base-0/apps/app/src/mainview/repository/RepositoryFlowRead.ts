import { createCollection, localOnlyCollectionOptions } from "@tanstack/db"
import type { FlowDefinition, ReadState } from "./FlowContents"

/** What one flows route read answered, and the ref it read at (for source links). */
export type FlowRouteRead =
  | { readonly kind: "list"; readonly ref?: string; readonly read: ReadState<readonly { name: string; path: string }[]> }
  | { readonly kind: "flow"; readonly ref?: string; readonly read: ReadState<FlowDefinition> }

/** Read progress belongs to the route reader (RepositorySubjectEntry); the views only project it. */
export const repositoryFlowReads = createCollection(localOnlyCollectionOptions<{ id: string; value: FlowRouteRead }, string>({
  id: "repository-flow-reads", getKey: row => row.id
}))

/** One row per admission and route: a later admission never shows an earlier one's answer. */
export const flowReadKey = (repo: string, name: string | undefined, requestId?: string) =>
  `${requestId ?? ""}/${repo.toLowerCase()}/flows${name === undefined ? "" : `/${name}`}`

export function setFlowRead(id: string, value: FlowRouteRead) {
  if (repositoryFlowReads.has(id)) repositoryFlowReads.update(id, draft => { draft.value = value as typeof draft.value })
  else repositoryFlowReads.insert({ id, value })
}
