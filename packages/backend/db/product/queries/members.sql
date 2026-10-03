-- name: InstallHasOwner :one
SELECT EXISTS(SELECT 1 FROM self_host_owners);

-- name: InstallClaimed :one
SELECT EXISTS(SELECT 1 FROM self_host_owners o JOIN collaborators c ON c.user_id=o.user_id WHERE c.github_user_id IS NOT NULL);

-- name: AuthorizeMemberUser :one
SELECT c.id, COALESCE(NOT EXISTS(SELECT 1 FROM install_settings WHERE key='owner.access_checked'),FALSE)::BOOLEAN AS provisional
FROM collaborators c JOIN users u ON u.id=c.user_id JOIN self_host_owners o ON o.user_id=c.user_id
WHERE c.user_id=sqlc.arg(user_id)::BIGINT AND c.suspended_at IS NULL AND u.is_active AND u.deleted_at IS NULL ORDER BY c.id LIMIT 1;

-- name: GetInstallOwner :one
SELECT c.id, c.user_id::BIGINT AS user_id, c.github_user_id,
 COALESCE((SELECT NULLIF(a.profile_data->>'login','') FROM oauth_accounts a WHERE a.user_id=c.user_id AND a.provider='workos' AND a.provider_user_id=c.github_user_id::TEXT ORDER BY a.id LIMIT 1),u.username)::TEXT AS login,
 EXISTS(SELECT 1 FROM install_settings WHERE key='owner.access_checked')::BOOLEAN AS verified FROM self_host_owners o JOIN collaborators c ON c.user_id=o.user_id JOIN users u ON u.id=o.user_id WHERE c.suspended_at IS NULL AND u.is_active AND u.deleted_at IS NULL ORDER BY c.id LIMIT 1;

-- name: LinkInstallOwner :execrows
UPDATE collaborators c SET github_user_id=sqlc.arg(github_user_id)
FROM self_host_owners o WHERE o.user_id=c.user_id AND c.github_user_id IS NULL;

-- name: MarkMemberAccessChecked :exec
INSERT INTO install_settings(key,value) SELECT 'owner.access_checked',jsonb_build_object('last_access_check_at',NOW())
FROM collaborators c JOIN self_host_owners o ON o.user_id=c.user_id WHERE c.id=sqlc.arg(id)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW();

-- name: GetInstallOwnerUser :one
SELECT u.* FROM self_host_owners o JOIN users u ON u.id=o.user_id
WHERE EXISTS(SELECT 1 FROM collaborators c WHERE c.user_id=o.user_id AND c.github_user_id IS NOT NULL);

-- name: ClaimSelfHostOwner :exec
INSERT INTO self_host_owners(user_id) VALUES(sqlc.arg(user_id));

-- name: SetOwnerGitHubIdentity :exec
UPDATE collaborators SET github_user_id=sqlc.arg(github_user_id) WHERE id=sqlc.arg(id);

-- name: LockInstallSetting :one
SELECT value FROM install_settings WHERE key = sqlc.arg(key) FOR UPDATE;

-- name: PutInstallSetting :exec
INSERT INTO install_settings (key, value, updated_at)
VALUES (sqlc.arg(key), sqlc.arg(value), NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- name: DeleteInstallSetting :execrows
DELETE FROM install_settings WHERE key = sqlc.arg(key);

-- name: CreateSetupSession :exec
-- A setup session is the install_settings row setup.session.<digest>; its
-- updated_at is the last request it made.
INSERT INTO install_settings (key, value, updated_at)
VALUES (sqlc.arg(key), '{}'::JSONB, NOW());

-- name: TouchSetupSession :execrows
-- Keeps a setup session alive; one idle for 24 hours is expired.
UPDATE install_settings
SET updated_at = NOW()
WHERE key = sqlc.arg(key)
  AND key LIKE 'setup.session.%'
  AND updated_at > NOW() - INTERVAL '24 hours';

-- name: LockSetupSession :execrows
-- Locks a live setup session for the owner claim.
SELECT key FROM install_settings
WHERE key = sqlc.arg(key)
  AND key LIKE 'setup.session.%'
  AND updated_at > NOW() - INTERVAL '24 hours'
FOR UPDATE;

-- name: DeleteExpiredSetupSessions :execrows
DELETE FROM install_settings
WHERE key LIKE 'setup.session.%'
  AND updated_at <= NOW() - INTERVAL '24 hours';

-- name: DeleteSetupSessions :execrows
DELETE FROM install_settings WHERE key LIKE 'setup.session.%';

-- name: GetInstallSettingValue :one
SELECT value FROM install_settings WHERE key = sqlc.arg(key);

-- name: LockInstallSetupOwner :exec
-- Shared mint/exchange/claim serialization key.
SELECT pg_advisory_xact_lock(344300::BIGINT);
