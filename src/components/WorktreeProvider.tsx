import { createContext, useContext, type ReactNode } from 'react'

export interface WorktreeContextValue {
  cwd: string
  branch: string
  isWorktree: true
}

const WorktreeContext = createContext<WorktreeContextValue | null>(null)

export function useWorktree(): WorktreeContextValue | null {
  return useContext(WorktreeContext)
}

export function WorktreeProvider(props: {
  value: WorktreeContextValue
  children: ReactNode
}): ReactNode {
  return (
    <WorktreeContext.Provider value={props.value}>
      {props.children}
    </WorktreeContext.Provider>
  )
}
