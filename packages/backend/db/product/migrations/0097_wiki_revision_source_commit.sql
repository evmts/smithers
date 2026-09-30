-- Commit provenance of a revision imported from a git checkout: the commit
-- whose tree held exactly the imported bytes at the document path. Empty means
-- unknown: not a checkout, uncommitted bytes, or not a sync import.
ALTER TABLE wiki_page_revisions ADD COLUMN source_commit text NOT NULL DEFAULT ''
    CHECK (source_commit = '' OR source_commit ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
