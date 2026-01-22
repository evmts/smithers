export type SqlParam = string | number | boolean | null | Uint8Array

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
  name: string | undefined
  file_path: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  config: Record<string, any>
  result: Record<string, any> | undefined
  error: string | undefined
  started_at: Date | undefined
  completed_at: Date | undefined
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
  phase_id: string | undefined
  model: string
  system_prompt: string | undefined
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result: string | undefined
  result_structured: Record<string, any> | undefined
  log_path: string | undefined
  error: string | undefined
  started_at: Date | undefined
  completed_at: Date | undefined
  created_at: Date
  duration_ms: number | undefined
  tokens_input: number | undefined
  tokens_output: number | undefined
  tool_calls_count: number
  stream_summary?: StreamSummary
}

export interface StreamSummary {
  textBlocks: number
  reasoningBlocks: number
  toolCalls: number
  toolResults: number
  errors: number
}

export interface AgentStreamEvent {
  id: string
  agent_id: string
  event_type: string
  event_id?: string
  tool_name?: string
  content?: string
  timestamp: number
  created_at: Date
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

export type BuildStatus = 'passing' | 'broken' | 'fixing'

export interface BuildState {
  id: number
  status: BuildStatus
  fixer_agent_id: string | null
  broken_since: string | null
  last_check: string | null
}

export interface Artifact {
  id: string
  execution_id: string
  agent_id: string | undefined
  name: string
  type: 'file' | 'code' | 'document' | 'image' | 'data'
  file_path: string
  git_hash: string | undefined
  git_commit: string | undefined
  summary: string | undefined
  line_count: number | undefined
  byte_size: number | undefined
  metadata: Record<string, any>
  created_at: Date
}

export interface Report {
  id: string
  execution_id: string
  agent_id: string | undefined
  type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
  title: string
  content: string
  data: Record<string, any> | undefined
  severity: 'info' | 'warning' | 'critical'
  created_at: Date
}

export interface Commit {
  id: string
  execution_id: string
  agent_id: string | undefined
  vcs_type: 'git' | 'jj'
  commit_hash: string
  change_id: string | undefined
  message: string
  author: string | undefined
  files_changed: string[] | undefined
  insertions: number | undefined
  deletions: number | undefined
  smithers_metadata: Record<string, any> | undefined
  created_at: Date
}

export interface Snapshot {
  id: string
  execution_id: string
  change_id: string
  commit_hash: string | undefined
  description: string | undefined
  files_modified: string[] | undefined
  files_added: string[] | undefined
  files_deleted: string[] | undefined
  has_conflicts: boolean
  created_at: Date
}

export interface Review {
  id: string
  execution_id: string
  agent_id: string | undefined
  target_type: 'commit' | 'diff' | 'pr' | 'files'
  target_ref: string | undefined
  approved: boolean
  summary: string
  issues: ReviewIssue[]
  approvals: ReviewApproval[] | undefined
  reviewer_model: string | undefined
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
