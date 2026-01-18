-- Smithers Orchestrator Database Schema
-- SQLite-based state management with full auditability

-- ============================================================================
-- 1. MEMORIES - Long-term Agent Knowledge
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,

  -- Categorization
  category TEXT NOT NULL,        -- 'fact', 'learning', 'preference', 'context', 'skill'
  scope TEXT DEFAULT 'global',   -- 'global', 'project', 'session'

  -- Content
  key TEXT NOT NULL,             -- Unique identifier within category
  content TEXT NOT NULL,         -- The actual memory content

  -- Metadata
  confidence REAL DEFAULT 1.0,   -- 0.0-1.0, how certain is this memory
  source TEXT,                   -- Where did this come from (agent, user, tool)
  source_execution_id TEXT,      -- Which execution created this

  -- Timestamps (ISO8601 strings)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  accessed_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,               -- Optional TTL

  -- Constraints
  UNIQUE(category, scope, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- ============================================================================
-- 2. EXECUTIONS - Orchestration Runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,

  -- Identity
  name TEXT,                     -- Human-readable name
  file_path TEXT NOT NULL,       -- Path to .smithers/main.tsx

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Configuration (JSON string)
  config TEXT DEFAULT '{}',

  -- Results (JSON string)
  result TEXT,
  error TEXT,                    -- Error message if failed

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  -- Metrics
  total_iterations INTEGER DEFAULT 0,
  total_agents INTEGER DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created_at DESC);

-- ============================================================================
-- 3. PHASES - Workflow Stages
-- ============================================================================

CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  iteration INTEGER NOT NULL DEFAULT 0,  -- Which Ralph iteration

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'skipped', 'failed'

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  -- Metrics
  duration_ms INTEGER,
  agents_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_phases_execution ON phases(execution_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON phases(status);
CREATE INDEX IF NOT EXISTS idx_phases_created ON phases(created_at DESC);

-- ============================================================================
-- 4. AGENTS - Claude Executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,

  -- Configuration
  model TEXT NOT NULL DEFAULT 'sonnet',
  system_prompt TEXT,

  -- Input
  prompt TEXT NOT NULL,          -- The children content

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Output
  result TEXT,                   -- Agent's response
  result_structured TEXT,        -- JSON: Parsed/structured result
  log_path TEXT,                 -- Path to execution log file
  error TEXT,

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  -- Metrics
  duration_ms INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tool_calls_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agents_execution ON agents(execution_id);
CREATE INDEX IF NOT EXISTS idx_agents_phase ON agents(phase_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created ON agents(created_at DESC);

-- ============================================================================
-- 5. TOOL_CALLS - Tool Invocations
-- ============================================================================

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Tool info
  tool_name TEXT NOT NULL,       -- 'Read', 'Edit', 'Bash', 'Glob', etc.

  -- Input (JSON string)
  input TEXT NOT NULL,

  -- Output strategy: inline for small, git reference for large
  output_inline TEXT,            -- Small outputs (<1KB) stored directly
  output_path TEXT,              -- Path to output file (for large outputs)
  output_git_hash TEXT,          -- Git hash of output file
  output_summary TEXT,           -- Haiku-generated summary (for large outputs)
  output_size_bytes INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  error TEXT,

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_agent ON tool_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_execution ON tool_calls(execution_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_created ON tool_calls(created_at DESC);

-- ============================================================================
-- 6. STATE - Current State (Replaces Zustand)
-- ============================================================================

CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,           -- JSON string
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Initialize default state
INSERT OR IGNORE INTO state (key, value) VALUES
  ('phase', '"initial"'),
  ('ralphCount', '0'),
  ('data', 'null');

-- ============================================================================
-- 7. TRANSITIONS - State Audit Log (Flux-like)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transitions (
  id TEXT PRIMARY KEY,
  execution_id TEXT REFERENCES executions(id) ON DELETE CASCADE,

  -- What changed
  key TEXT NOT NULL,
  old_value TEXT,                -- JSON string
  new_value TEXT NOT NULL,       -- JSON string

  -- Context
  trigger TEXT,                  -- What caused this: 'agent_finished', 'user_action', 'init'
  trigger_agent_id TEXT REFERENCES agents(id),

  -- Timing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transitions_execution ON transitions(execution_id);
CREATE INDEX IF NOT EXISTS idx_transitions_key ON transitions(key);
CREATE INDEX IF NOT EXISTS idx_transitions_created ON transitions(created_at DESC);

-- ============================================================================
-- 8. ARTIFACTS - Generated Files/Outputs (Git References)
-- ============================================================================

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,

  -- Identity
  name TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'file', 'code', 'document', 'image', 'data'

  -- Git reference (PRIMARY - content lives in git)
  file_path TEXT NOT NULL,       -- Path relative to repo root
  git_hash TEXT,                 -- Git blob hash (after commit)
  git_commit TEXT,               -- Commit that introduced this artifact

  -- Summary (for quick reference without git lookup)
  summary TEXT,                  -- Brief description of content
  line_count INTEGER,
  byte_size INTEGER,

  -- Metadata (JSON string)
  metadata TEXT DEFAULT '{}',

  -- Timing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_execution ON artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_path ON artifacts(file_path);
CREATE INDEX IF NOT EXISTS idx_artifacts_git ON artifacts(git_hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);

-- ============================================================================
-- 9. REPORTS - Agent-Generated Reports
-- ============================================================================

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,

  -- Report content
  type TEXT NOT NULL,            -- 'progress', 'finding', 'warning', 'error', 'metric', 'decision'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT,                     -- JSON: Structured data (optional)
  severity TEXT DEFAULT 'info',  -- 'info', 'warning', 'critical'

  -- Timing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_execution ON reports(execution_id);
CREATE INDEX IF NOT EXISTS idx_reports_agent ON reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_severity ON reports(severity);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- ============================================================================
-- 10. COMMITS - Version Control Commits
-- ============================================================================

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,

  -- VCS info
  vcs_type TEXT NOT NULL,        -- 'git', 'jj'
  commit_hash TEXT NOT NULL,
  change_id TEXT,                -- JJ change ID (if applicable)

  -- Commit details
  message TEXT NOT NULL,
  author TEXT,

  -- Stats (JSON arrays)
  files_changed TEXT,            -- JSON array
  insertions INTEGER,
  deletions INTEGER,

  -- Smithers metadata (JSON)
  smithers_metadata TEXT,

  -- Timing
  created_at TEXT DEFAULT (datetime('now')),

  -- Ensure unique commits per VCS
  UNIQUE(vcs_type, commit_hash)
);

CREATE INDEX IF NOT EXISTS idx_commits_execution ON commits(execution_id);
CREATE INDEX IF NOT EXISTS idx_commits_agent ON commits(agent_id);
CREATE INDEX IF NOT EXISTS idx_commits_hash ON commits(commit_hash);
CREATE INDEX IF NOT EXISTS idx_commits_vcs ON commits(vcs_type);
CREATE INDEX IF NOT EXISTS idx_commits_created ON commits(created_at DESC);

-- ============================================================================
-- 11. SNAPSHOTS - JJ Working Copy Snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- JJ snapshot info
  change_id TEXT NOT NULL,
  commit_hash TEXT,
  description TEXT,

  -- File changes (JSON arrays)
  files_modified TEXT,
  files_added TEXT,
  files_deleted TEXT,

  -- Status
  has_conflicts INTEGER DEFAULT 0,

  -- Timing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_execution ON snapshots(execution_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_change ON snapshots(change_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at DESC);

-- ============================================================================
-- 12. REVIEWS - Code Reviews
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,

  -- Review target
  target_type TEXT NOT NULL,     -- 'commit', 'diff', 'pr', 'files'
  target_ref TEXT,               -- Commit hash, PR number, etc.

  -- Review result
  approved INTEGER NOT NULL,     -- 0 or 1
  summary TEXT NOT NULL,
  issues TEXT NOT NULL,          -- JSON: Array of {severity, file, line, message, suggestion}
  approvals TEXT,                -- JSON: Array of {aspect, reason}

  -- Reviewer info
  reviewer_model TEXT,           -- 'claude-sonnet-4', etc.

  -- Behavior
  blocking INTEGER DEFAULT 0,

  -- Post-review actions
  posted_to_github INTEGER DEFAULT 0,
  posted_to_git_notes INTEGER DEFAULT 0,

  -- Timing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_execution ON reviews(execution_id);
CREATE INDEX IF NOT EXISTS idx_reviews_agent ON reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_type);
CREATE INDEX IF NOT EXISTS idx_reviews_blocking ON reviews(blocking);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- ============================================================================
-- 13. TASKS - Ralph iteration task tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL DEFAULT 0,
  component_type TEXT NOT NULL,
  component_name TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_execution ON tasks(execution_id);
CREATE INDEX IF NOT EXISTS idx_tasks_iteration_status ON tasks(iteration, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(started_at DESC);

-- ============================================================================
-- 14. STEPS - Fine-grained step tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,

  -- Identity
  name TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'skipped'

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  duration_ms INTEGER,

  -- VCS integration
  snapshot_before TEXT,  -- JJ commit ID before step
  snapshot_after TEXT,   -- JJ commit ID after step
  commit_created TEXT    -- Commit hash if commitAfter was used
);

CREATE INDEX IF NOT EXISTS idx_steps_execution ON steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_steps_phase ON steps(phase_id);
CREATE INDEX IF NOT EXISTS idx_steps_status ON steps(status);
CREATE INDEX IF NOT EXISTS idx_steps_created ON steps(created_at DESC);

-- ============================================================================
-- 15. HUMAN - Human Interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_interactions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Request
  type TEXT NOT NULL,            -- 'confirmation', 'text', 'select'
  prompt TEXT NOT NULL,
  options TEXT,                  -- JSON array of strings

  -- Response
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'timeout'
  response TEXT,                 -- JSON string

  -- Timing
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_human_status ON human_interactions(status);
CREATE INDEX IF NOT EXISTS idx_human_execution ON human_interactions(execution_id);

-- ============================================================================
-- 16. RENDER_FRAMES - Render frame snapshots for time-travel debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS render_frames (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Frame ordering
  sequence_number INTEGER NOT NULL,

  -- Frame content
  tree_xml TEXT NOT NULL,           -- Serialized SmithersNode tree as XML
  ralph_count INTEGER NOT NULL DEFAULT 0,  -- Current Ralph iteration count

  -- Timing
  created_at TEXT DEFAULT (datetime('now')),

  -- Ensure unique sequence per execution
  UNIQUE(execution_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_render_frames_execution ON render_frames(execution_id);
CREATE INDEX IF NOT EXISTS idx_render_frames_sequence ON render_frames(execution_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_render_frames_created ON render_frames(created_at DESC);
