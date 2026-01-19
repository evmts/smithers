/**
 * Types for Review Processor workflow
 */

export interface ReviewInfo {
  /** Filename without path */
  name: string
  /** Full path to review file */
  path: string
  /** Review content */
  content: string
  /** Whether marked as difficult */
  isDifficult: boolean
  /** Processing status */
  status: 'pending' | 'processing' | 'implemented' | 'closed' | 'failed' | 'retrying'
  /** Number of retry attempts */
  retries: number
  /** Error message if failed */
  error?: string
  /** Agent ID processing this review */
  agentId?: string
}

export interface ProcessorState {
  /** All reviews found */
  reviews: ReviewInfo[]
  /** Whether initial scan is complete */
  scanned: boolean
  /** Number of agents currently active */
  activeAgents: number
  /** Reviews that completed successfully */
  completed: string[]
  /** Reviews that failed after retries */
  failed: string[]
}

export interface AgentResult {
  reviewName: string
  success: boolean
  action: 'implemented' | 'closed' | 'failed'
  message?: string
  commitHash?: string
}
