-- name: GetSelfHostOwner :one
SELECT u.*
FROM self_host_owners o
JOIN users u ON u.id = o.user_id
WHERE o.singleton = TRUE
  AND u.is_active = TRUE
  AND u.deleted_at IS NULL;

-- Account erasure protects the immutable binding even if its user is inactive.
-- name: IsSelfHostOwner :one
SELECT EXISTS (
    SELECT 1 FROM self_host_owners
    WHERE singleton = TRUE AND user_id = sqlc.arg(user_id)::bigint
)::boolean;
