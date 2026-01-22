import { useCallback, useRef, type ReactNode } from 'react'
import { ExecutionScopeProvider, useExecutionScope } from './ExecutionScope.js'
import { StepRegistryProvider, useStepRegistry } from './Step.js'
import { useStepContext } from './StepContext.js'

let parallelAutoId = 0

export interface ParallelProps {
  children: ReactNode
}

export function Parallel(props: ParallelProps): ReactNode {
  const registry = useStepRegistry()
  const executionScope = useExecutionScope()
  const stepContext = useStepContext()
  const groupIdRef = useRef<string | null>(null)
  const groupIndexRef = useRef<number | null>(null)

  if (groupIdRef.current === null) {
    const smithersKey = (props as { __smithersKey?: unknown }).__smithersKey
    if (smithersKey !== undefined && smithersKey !== null) {
      groupIdRef.current = `parallel:${String(smithersKey)}`
    } else {
      groupIdRef.current = `parallel:auto:${parallelAutoId++}`
    }
  }

  const shouldRegisterWithParent = Boolean(registry && !registry.isParallel && !stepContext)

  if (groupIndexRef.current === null && shouldRegisterWithParent) {
    groupIndexRef.current = registry!.registerStep(`parallel:${groupIdRef.current}`)
  }

  const isGroupActive = shouldRegisterWithParent
    ? registry!.isStepActive(groupIndexRef.current ?? 0)
    : true

  const handleAllStepsComplete = useCallback(() => {
    if (shouldRegisterWithParent && registry) {
      registry.advanceStep()
    }
  }, [registry, shouldRegisterWithParent])
  const registryEnabled = executionScope.enabled && isGroupActive

  return (
    <parallel>
      {registryEnabled && (
        <ExecutionScopeProvider enabled={registryEnabled}>
          <StepRegistryProvider
            isParallel
            registryId={groupIdRef.current ?? undefined}
            enabled={registryEnabled}
            onAllStepsComplete={handleAllStepsComplete}
          >
            {props.children}
          </StepRegistryProvider>
        </ExecutionScopeProvider>
      )}
    </parallel>
  )
}
