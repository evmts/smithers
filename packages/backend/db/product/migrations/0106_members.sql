-- Retain the singleton owner; install membership uses existing collaborators.
ALTER TABLE collaborators ALTER COLUMN repository_id DROP NOT NULL;
ALTER TABLE collaborators ADD COLUMN github_user_id BIGINT;
ALTER TABLE collaborators ADD COLUMN unix_uid INTEGER UNIQUE CHECK (unix_uid >= 20000);
ALTER TABLE collaborators ADD COLUMN suspended_at TIMESTAMPTZ;
CREATE SEQUENCE collaborators_unix_uid_seq START WITH 20000 MINVALUE 20000 OWNED BY collaborators.unix_uid;
ALTER TABLE collaborators ALTER COLUMN unix_uid SET DEFAULT nextval('collaborators_unix_uid_seq');
-- One install membership row before repository selection.
CREATE UNIQUE INDEX collaborators_setup_user ON collaborators(user_id) WHERE repository_id IS NULL;
UPDATE collaborators c SET permission='admin',
 github_user_id=(SELECT provider_user_id::BIGINT FROM oauth_accounts a WHERE a.user_id=c.user_id
   AND provider='workos' AND provider_user_id ~ '^[0-9]+$' ORDER BY id LIMIT 1),
 unix_uid=COALESCE(c.unix_uid,nextval('collaborators_unix_uid_seq'))
WHERE EXISTS(SELECT 1 FROM self_host_owners o WHERE o.user_id=c.user_id);
INSERT INTO collaborators(repository_id,user_id,permission,github_user_id)
SELECT NULL,o.user_id,'admin',
 (SELECT provider_user_id::BIGINT FROM oauth_accounts a WHERE a.user_id=o.user_id
   AND provider='workos' AND provider_user_id ~ '^[0-9]+$' ORDER BY id LIMIT 1)
FROM self_host_owners o WHERE NOT EXISTS(SELECT 1 FROM collaborators c WHERE c.user_id=o.user_id);
DROP TABLE local_credentials;
ALTER TABLE oauth_states ADD COLUMN setup_session_digest TEXT;
