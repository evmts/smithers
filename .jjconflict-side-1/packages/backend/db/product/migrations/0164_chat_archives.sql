-- A branch holds one live chat and any number of archived ones (Will,
-- 2026-10-13, #3827). Archiving moves the chat's turns to the key
-- 'archive-' || id, which no live route resolves, and records where the chat
-- happened and what it was about.
CREATE TABLE chat_archives (
    id text PRIMARY KEY CHECK (id <> '' AND octet_length(id) <= 64),
    -- 0 is an account's private chat; its owner is the only reader.
    repository_id bigint NOT NULL DEFAULT 0 CHECK (repository_id >= 0),
    owner_id bigint REFERENCES users(id) ON DELETE CASCADE,
    archived_by bigint REFERENCES users(id) ON DELETE SET NULL,
    -- The live key the chat was cut from: a branch key, or account-N-main.
    source_conversation_id text NOT NULL CHECK (source_conversation_id <> ''),
    -- What history groups by. NULL repository is the no-repository group.
    repository text CHECK (repository IS NULL OR (repository <> '' AND octet_length(repository) <= 200)),
    branch text CHECK (branch IS NULL OR (branch <> '' AND octet_length(branch) <= 200)),
    -- The first prompt's first line until the model writes a title.
    title text NOT NULL CHECK (octet_length(title) <= 400),
    summary text CHECK (summary IS NULL OR octet_length(summary) <= 2000),
    -- Runs the chat started, oldest first: [{"repo","runId","workspaceId"?}].
    runs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(runs) = 'array'),
    entry_count integer NOT NULL CHECK (entry_count > 0),
    first_at timestamptz NOT NULL,
    last_at timestamptz NOT NULL,
    archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((repository_id = 0) = (owner_id IS NOT NULL))
);
CREATE INDEX chat_archives_scope_idx ON chat_archives (repository_id, owner_id, archived_at DESC, id);
