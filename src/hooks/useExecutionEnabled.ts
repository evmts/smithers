import { usePhaseContext } from '../components/PhaseContext.js'
import { useStepContext } from '../components/StepContext.js'

export function useExecutionEnabled(): boolean {
  const phase = usePhaseContext()
  const step = useStepContext()
  const phaseActive = phase?.isActive ?? true
  const stepActive = step?.isActive ?? true

  return phaseActive && stepActive
}
