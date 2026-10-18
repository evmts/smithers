-- Unknown GitHub visibility stays private to public metadata readers.
ALTER TABLE github_synced_repos ADD COLUMN github_private boolean;
