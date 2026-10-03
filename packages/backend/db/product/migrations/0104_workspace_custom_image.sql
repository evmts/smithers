-- #3205: additive, opt-in image admission and egress policy. Existing rows
-- remain NULL and keep their original execution defaults without a backfill.
ALTER TABLE public.workspaces
    ADD COLUMN image_ref text,
    ADD COLUMN image_digest text,
    ADD COLUMN booted_image_digest text,
    ADD COLUMN network_mode text CHECK (network_mode IN ('none', 'proxy')),
    ADD CONSTRAINT workspace_image_digest_check CHECK (
        (image_ref IS NULL AND image_digest IS NULL) OR
        (image_ref IS NOT NULL AND image_ref <> '' AND image_digest IS NOT NULL
         AND image_digest ~ '^sha256:[0-9a-f]{64}$')),
    ADD CONSTRAINT workspace_booted_image_digest_check CHECK (
        booted_image_digest IS NULL OR booted_image_digest ~ '^sha256:[0-9a-f]{64}$');
