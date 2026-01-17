import { createContext } from 'solid-js'

/**
 * Ralph context for task tracking.
 * Components like Claude register with Ralph when they mount.
 */
export interface RalphContextType {
  registerTask: () => void
  completeTask: () => void
}

export const RalphContext = createContext<RalphContextType | undefined>(undefined)
