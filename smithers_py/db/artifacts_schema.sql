-- Artifacts table matching the spec from issues/smithers-py.md section 11.4
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT,
    frame_id INTEGER,
    key TEXT,              -- NULL for keyless
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (execution_id) REFERENCES executions(id),
    UNIQUE (execution_id, key) WHERE key IS NOT NULL  -- Keyed artifacts unique
);

CREATE INDEX IF NOT EXISTS idx_artifacts_exec ON artifacts(execution_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_key ON artifacts(execution_id, key) WHERE key IS NOT NULL;