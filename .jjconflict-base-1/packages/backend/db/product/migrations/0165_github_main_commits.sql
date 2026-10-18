-- The synced main-commit inventory (spec §20.4b, T-GH-02). Each row is one
-- first-parent commit a GitHub main pull moved Smithers main through. The
-- scorecard counts a commit as work outside Smithers when no TODO's PR merge
-- commit equals it; classification is read-time, so a merge settled after the
-- sync still counts as Smithers work.
--
-- A bookmark the pull created (a seeded mirror's whole history) records
-- nothing: that history predates the install's changes to main.
CREATE TABLE github_main_commits (
    repository_id bigint NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    commit_id text NOT NULL CHECK (commit_id ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
    synced_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (repository_id, commit_id)
);

CREATE INDEX github_main_commits_synced_idx ON github_main_commits (synced_at);

-- The first synced observation after this migration starts the inventory.
-- Windows that begin earlier have no complete inventory.
ALTER TABLE github_main_pulls ADD COLUMN commits_recorded_from timestamptz;
