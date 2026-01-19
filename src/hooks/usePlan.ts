import { useMemo } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { usePlanNodeContext } from '../components/PlanNodeContext.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

export interface UsePlanResult {
  plan: string
  activeNodeId: string | null
}

function markActiveNode(plan: string, activeNodeId: string | null): string {
  if (!plan || !activeNodeId) return plan
  const marker = `plan-node-id="${activeNodeId}"`
  if (!plan.includes(marker)) return plan
  return plan.replace(marker, `${marker} plan-active="true"`)
}

export function usePlan(): UsePlanResult {
  const { reactiveDb, executionId, getTreeXML } = useSmithers()
  const planNode = usePlanNodeContext()
  const activeNodeId = planNode?.nodeId ?? null

  const { data: latestFrameXml } = useQueryValue<string>(
    reactiveDb,
    'SELECT tree_xml FROM render_frames WHERE execution_id = ? ORDER BY sequence_number DESC LIMIT 1',
    [executionId]
  )

  const plan = useMemo(() => {
    const fromFrames = latestFrameXml ?? ''
    const fromTree = getTreeXML?.() ?? ''
    const basePlan = fromFrames || fromTree || ''
    return markActiveNode(basePlan, activeNodeId)
  }, [latestFrameXml, getTreeXML, activeNodeId])

  return { plan, activeNodeId }
}
