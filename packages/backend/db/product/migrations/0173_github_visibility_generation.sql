-- Only an explicit GitHub public visibility receipt may open the door.
-- Existing private=false receipts did not distinguish internal repositories.
ALTER TABLE github_synced_repos
    ADD COLUMN github_visibility text CHECK (github_visibility IN ('public', 'private', 'internal')),
    ADD COLUMN visibility_generation bigint NOT NULL DEFAULT 0;
UPDATE github_synced_repos SET github_private = NULL;
