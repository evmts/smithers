// Type definitions for Smithers DB

export interface Memory {
  id: string
  category: 'fact' | 'learning' | 'preference' | 'context' | 'skill'
  scope: 'global' | 'project' | 'session'
  key: string
  content: string
  confidence: number
  source?: string
  source_execution_id?: string
  created_at: Date
  updated_at: Date
  accessed_at: Date
  expires_at?: Date
}

export interface MemoryInput {
  category: Memory['category']
  key: string
  content: string
  scope?: Memory['scope']
  confidence?: number
  source?: string
  expires_at?: Date
}

export interface Execution {
  id: string
  name?: string
  file_path: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  config: Record<string, any>
  result?: Record<string, any>
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  total_iterations: number
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
}

export interface Phase {
  id: string
  execution_id: string
  name: string
  iteration: number
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed'
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  agents_count: number
}

export interface Agent {
  id: string
  execution_id: string
  phase_id?: string
  model: string
  system_prompt?: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string
  result_structured?: Record<string, any>
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  tokens_input?: number
  tokens_output?: number
  tool_calls_count: number
}

export interface ToolCall {
  id: string
  agent_id: string
  execution_id: string
  tool_name: string
  input: Record<string, any>
  output_inline?: string
  output_path?: string
  output_git_hash?: string
  output_summary?: string
  output_size_bytes?: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
}

export interface StateEntry {
  key: string
  value: any
  updated_at: Date
}

export interface Transition {
  id: string
  execution_id?: string
  key: string
  old_value?: any
  new_value: any
  trigger?: string
  trigger_agent_id?: string
  created_at: Date
}

export interface Artifact {
  id: string
  execution_id: string
  agent_id?: string
  name: string
  type: 'file' | 'code' | 'document' | 'image' | 'data'
  file_path: string
  git_hash?: string
  git_commit?: string
  summary?: string
  line_count?: number
  byte_size?: number
  metadata: Record<string, any>
  created_at: Date
}

// ============================================================================
// VCS and Reporting Tables
// ============================================================================

export interface Report {
  id: string
  execution_id: string
  agent_id?: string
  type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
  title: string
  content: string
  data?: Record<string, any>
  severity: 'info' | 'warning' | 'critical'
  created_at: Date
}

export interface Commit {
  id: string
  execution_id: string
  agent_id?: string
  vcs_type: 'git' | 'jj'
  commit_hash: string
  change_id?: string
  message: string
  author?: string
  files_changed?: string[]
  insertions?: number
  deletions?: number
  smithers_metadata?: Record<string, any>
  created_at: Date
}

export interface Snapshot {
  id: string
  execution_id: string
  change_id: string
  commit_hash?: string
  description?: string
  files_modified?: string[]
  files_added?: string[]
  files_deleted?: string[]
  has_conflicts: boolean
  created_at: Date
}

export interface Review {
  id: string
  execution_id: string
  agent_id?: string
  target_type: 'commit' | 'diff' | 'pr' | 'files'
  target_ref?: string
  approved: boolean
  summary: string
  issues: ReviewIssue[]
  approvals?: ReviewApproval[]
  reviewer_model?: string
  blocking: boolean
  posted_to_github: boolean
  posted_to_git_notes: boolean
  created_at: Date
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion'
  file?: string
  line?: number
  message: string
  suggestion?: string
}

export interface ReviewApproval {
  aspect: string
  reason: string
}

export interface Step {
  id: string
  execution_id: string
  phase_id?: string
  name?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  snapshot_before?: string
  snapshot_after?: string
  commit_created?: string
}
