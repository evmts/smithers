import { createContext, useContext } from "react"
import type { RepoView } from "../repo"

// What React components get: the repository layer's live queries to render and plain actions to call
// (features/repo/repo.ts).

const RepoContext = createContext<RepoView | null>(null)

export const RepoProvider = RepoContext.Provider

export const useRepo = (): RepoView => {
  const repo = useContext(RepoContext)
  if (repo === null) throw new Error("useRepo needs a RepoProvider: main.tsx renders one")
  return repo
}
