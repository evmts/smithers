-- Smithers Orchestrator Database Schema
-- PGlite-based state management with full auditability

-- Enable extensions
-- Note: pgvector for embeddings, uuid for ID generation

-- ============================================================================
-- 1. MEMORIES - Long-term Agent Knowledge
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Categorization
  category TEXT NOT NULL,        -- 'fact', 'learning', 'preference', 'context', 'skill'
  scope TEXT DEFAULT 'global',   -- 'global', 'project', 'session'

  -- Content
  key TEXT NOT NULL,             -- Unique identifier within category
  content TEXT NOT NULL,         -- The actual memory content
  -- embedding VECTOR(1536),     -- Optional: for semantic search (requires pgvector)

  -- Metadata
  confidence REAL DEFAULT 1.0,   -- 0.0-1.0, how certain is this memory
  source TEXT,                   -- Where did this come from (agent, user, tool)
  source_execution_id UUID,      -- Which execution created this

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,        -- Optional TTL

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT,                     -- Human-readable name
  file_path TEXT NOT NULL,       -- Path to .smithers/main.tsx

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Configuration
  config JSONB DEFAULT '{}',     -- Max iterations, model settings, etc.

  -- Results
  result JSONB,                  -- Final output/result
  error TEXT,                    -- Error message if failed

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  iteration INTEGER NOT NULL DEFAULT 0,  -- Which Ralph iteration

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'skipped', 'failed'

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES phases(id) ON DELETE SET NULL,

  -- Configuration
  model TEXT NOT NULL DEFAULT 'sonnet',
  system_prompt TEXT,

  -- Input
  prompt TEXT NOT NULL,          -- The children content

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Output
  result TEXT,                   -- Agent's response
  result_structured JSONB,       -- Parsed/structured result if applicable
  error TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- Tool info
  tool_name TEXT NOT NULL,       -- 'Read', 'Edit', 'Bash', 'Glob', etc.

  -- Input (always stored - usually small)
  input JSONB NOT NULL,          -- Tool input parameters

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
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
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
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize default state
INSERT INTO state (key, value) VALUES
  ('phase', '"initial"'),
  ('iteration', '0'),
  ('data', 'null')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 7. TRANSITIONS - State Audit Log (Flux-like)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,

  -- What changed
  key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,

  -- Context
  trigger TEXT,                  -- What caused this: 'agent_finished', 'user_action', 'init'
  trigger_agent_id UUID REFERENCES agents(id),

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transitions_execution ON transitions(execution_id);
CREATE INDEX IF NOT EXISTS idx_transitions_key ON transitions(key);
CREATE INDEX IF NOT EXISTS idx_transitions_created ON transitions(created_at DESC);

-- ============================================================================
-- 8. ARTIFACTS - Generated Files/Outputs (Git References)
-- ============================================================================

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

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

  -- Metadata
  metadata JSONB DEFAULT '{}',   -- Language, mime type, etc.

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- Report content
  type TEXT NOT NULL,            -- 'progress', 'finding', 'warning', 'error', 'metric', 'decision'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data JSONB,                    -- Structured data (optional)
  severity TEXT DEFAULT 'info',  -- 'info', 'warning', 'critical'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- VCS info
  vcs_type TEXT NOT NULL,        -- 'git', 'jj'
  commit_hash TEXT NOT NULL,
  change_id TEXT,                -- JJ change ID (if applicable)

  -- Commit details
  message TEXT NOT NULL,
  author TEXT,

  -- Stats
  files_changed TEXT[],
  insertions INTEGER,
  deletions INTEGER,

  -- Smithers metadata (from git notes)
  smithers_metadata JSONB,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

  -- JJ snapshot info
  change_id TEXT NOT NULL,
  commit_hash TEXT,
  description TEXT,

  -- File changes
  files_modified TEXT[],
  files_added TEXT[],
  files_deleted TEXT[],

  -- Status
  has_conflicts BOOLEAN DEFAULT false,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_execution ON snapshots(execution_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_change ON snapshots(change_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at DESC);

-- ============================================================================
-- 12. REVIEWS - Code Reviews
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- Review target
  target_type TEXT NOT NULL,     -- 'commit', 'diff', 'pr', 'files'
  target_ref TEXT,               -- Commit hash, PR number, etc.

  -- Review result
  approved BOOLEAN NOT NULL,
  summary TEXT NOT NULL,
  issues JSONB NOT NULL,         -- Array of {severity, file, line, message, suggestion}
  approvals JSONB,               -- Array of {aspect, reason}

  -- Reviewer info
  reviewer_model TEXT,           -- 'claude-sonnet-4', etc.

  -- Behavior
  blocking BOOLEAN DEFAULT false,

  -- Post-review actions
  posted_to_github BOOLEAN DEFAULT false,
  posted_to_git_notes BOOLEAN DEFAULT false,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_execution ON reviews(execution_id);
CREATE INDEX IF NOT EXISTS idx_reviews_agent ON reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_type);
CREATE INDEX IF NOT EXISTS idx_reviews_blocking ON reviews(blocking);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
