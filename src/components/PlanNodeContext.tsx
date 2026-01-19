import { createContext, useContext, useRef, type ReactNode } from 'react'

export interface PlanNodeContextValue {
  nodeId: string
}

const PlanNodeContext = createContext<PlanNodeContextValue | null>(null)

export function PlanNodeProvider(props: { nodeId: string; children: ReactNode }): ReactNode {
  return (
    <PlanNodeContext.Provider value={{ nodeId: props.nodeId }}>
      {props.children}
    </PlanNodeContext.Provider>
  )
}

export function usePlanNodeContext(): PlanNodeContextValue | null {
  return useContext(PlanNodeContext)
}

export function usePlanNodeId(): string {
  const idRef = useRef<string | null>(null)
  if (!idRef.current) {
    idRef.current = crypto.randomUUID()
  }
  return idRef.current
}

export function usePlanNodeProps(): { nodeId: string; planNodeProps: { 'plan-node-id': string } } {
  const nodeId = usePlanNodeId()
  return { nodeId, planNodeProps: { 'plan-node-id': nodeId } }
}
