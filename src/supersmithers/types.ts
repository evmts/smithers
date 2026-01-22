import type { ComponentType } from 'react'

declare const SUPERSMITHERS_BRAND_TYPE: unique symbol
export const SUPERSMITHERS_BRAND: typeof SUPERSMITHERS_BRAND_TYPE = 
  Symbol.for('supersmithers.managed') as typeof SUPERSMITHERS_BRAND_TYPE

export type SupersmithersManagedComponent<P = {}> =
  ComponentType<P> & {
    [SUPERSMITHERS_BRAND]: SupersmithersModuleMeta
  }

export interface SupersmithersModuleMeta {
  scope: string
  moduleAbsPath: string
  exportName: 'default' | string
  moduleHash: string
}

export interface SuperSmithersContext {
  executionId: string
  iteration: number
  treeXml: string
  recentFrames: RenderFrameSnapshot[]
  metrics: SuperSmithersMetrics
  recentErrors: SuperSmithersErrorEvent[]
  rewriteHistory: RewriteHistorySummary
  sourceFile: string
  trigger: SuperSmithersTriggerReason
}

export type SuperSmithersTriggerReason =
  | 'interval' | 'iteration' | 'error' | 'stall' | 'complete' | 'manual'

export interface RenderFrameSnapshot {
  id: string
  iteration: number
  createdAt: string
  xml: string
}

export interface SuperSmithersMetrics {
  tokensInput: number
  tokensOutput: number
  agentCount: number
  errorCount: number
  stallCount: number
  isStalled: boolean
  avgIterationTimeMs: number
}

export interface SuperSmithersErrorEvent {
  at: string
  kind: 'agent' | 'tool' | 'validation'
  message: string
  signature: string
}

export interface RewriteHistorySummary {
  rewriteCount: number
  seenCodeHashes: string[]
}

export interface RewriteProposal {
  summary: string
  rationale: string
  risk: 'low' | 'medium' | 'high'
  newCode: string
}

export interface RewriteResult {
  id: string
  summary: string
  status: 'applied' | 'rejected' | 'failed'
}

export interface AnalysisResult {
  summary: string
  issues: Array<{
    type: 'error' | 'stall' | 'performance' | 'structure'
    description: string
    evidence: string
  }>
  rewrite: {
    recommended: boolean
    goals: string[]
    risk: 'low' | 'medium' | 'high'
    confidence: number
  }
}

export type ClaudeModel = 'haiku' | 'sonnet' | 'opus'

export const MODEL_MAP: Record<ClaudeModel, string> = {
  haiku: 'claude-3-haiku-20240307',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
}

export interface SuperSmithersProps<P> {
  plan: SupersmithersManagedComponent<P>
  planProps?: P
  observeOn?: ('iteration' | 'error' | 'stall' | 'complete')[]
  observeInterval?: number
  rewriteOn?: {
    errors?: boolean
    stalls?: boolean
    performance?: boolean
    custom?: (ctx: SuperSmithersContext) => boolean | Promise<boolean>
  }
  rewriteModel?: ClaudeModel
  rewriteSystemPrompt?: string
  maxRewrites?: number
  rewriteCooldown?: number
  requireApproval?: boolean
  onRewriteProposed?: (proposal: RewriteProposal) => void
  onRewriteApplied?: (result: RewriteResult) => void
  onError?: (error: Error) => void
}
