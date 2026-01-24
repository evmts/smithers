export interface ReviewTarget {
  /** Type of content to review */
  type: 'commit' | 'diff' | 'pr' | 'files'
  /** Reference (commit hash, branch, PR number, etc.) */
  ref?: string
  /** Specific files to review (for 'files' type) */
  files?: string[]
}

export interface ReviewIssue {
  /** Severity of the issue */
  severity: 'critical' | 'major' | 'minor'
  /** File path (if applicable) */
  file?: string
  /** Line number (if applicable) */
  line?: number
  /** Description of the issue */
  message: string
  /** Suggested fix */
  suggestion?: string
}

export interface ReviewResult {
  /** Whether the review passed */
  approved: boolean
  /** Summary of the review */
  summary: string
  /** List of issues found */
  issues: ReviewIssue[]
}

export type ReviewAgent = 'claude' | 'amp' | 'codex'

export interface ReviewProps {
  /** What to review */
  target: ReviewTarget
  /** Agent to use for review */
  agent?: ReviewAgent
  /** Model to use */
  model?: string
  /** Stop orchestration if issues are found */
  blocking?: boolean
  /** Review criteria/checklist */
  criteria?: string[]
  /** Post review as GitHub PR comment */
  postToGitHub?: boolean
  /** Store review in git notes */
  postToGitNotes?: boolean
  /** Callback when review is complete */
  onFinished?: (result: ReviewResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}
