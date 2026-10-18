-- Unknown GitHub visibility stays private to public metadata readers.
ALTER TABLE github_synced_repos ADD COLUMN github_private boolean;

-- Keep background deferrals separate from completed full syncs and failure strikes.
ALTER TABLE github_synced_repos
    ADD COLUMN next_reconcile_at timestamptz,
    ADD COLUMN reconcile_skip_logged_at timestamptz;
