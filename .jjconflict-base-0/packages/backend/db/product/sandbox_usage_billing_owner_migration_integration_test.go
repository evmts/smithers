package product

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 0167 adds sandbox_usage_intervals.billing_owner_id NOT NULL, backfills it,
// and stamps every later insert from a BEFORE INSERT trigger. The binaries a
// hosted release rolls over still write and read the schema-164 statements
// below, so this proves the exact statement text they run keeps working and
// keeps meaning the same thing. The statements are the generated text of
// smithers b2d9728f9b5bc5d4cf4a486a038de0d5d4390ac1
// (packages/backend/internal/db/sandbox_usage.sql.go), parameters and all.
const (
	legacyOpenSandboxUsageInterval = `
INSERT INTO sandbox_usage_intervals (user_id, sandbox_kind, sandbox_id)
SELECT $1::bigint, $2::text, $3::text
WHERE NOT EXISTS (
    SELECT 1 FROM sandbox_usage_intervals
    WHERE sandbox_kind = $2::text
      AND sandbox_id = $3::text AND ended_at IS NULL
)
ON CONFLICT (sandbox_kind, sandbox_id) WHERE ended_at IS NULL DO NOTHING
`
	legacyCloseSandboxUsageInterval = `
UPDATE sandbox_usage_intervals
SET ended_at = GREATEST(started_at, now())
WHERE sandbox_kind = $1 AND sandbox_id = $2 AND ended_at IS NULL
`
	legacySumSandboxAwakeSecondsForUserSince = `
SELECT COALESCE(FLOOR(SUM(EXTRACT(EPOCH FROM
    LEAST(COALESCE(ended_at, now()), now()) - GREATEST(started_at, $1::timestamptz)
))), 0)::bigint AS seconds
FROM sandbox_usage_intervals
WHERE user_id = $2
  AND started_at < now()
  AND LEAST(COALESCE(ended_at, now()), now()) > GREATEST(started_at, $1::timestamptz)
`
	legacyCloseOrphanedSandboxUsageIntervals = `
UPDATE sandbox_usage_intervals AS usage
SET ended_at = GREATEST(usage.started_at, LEAST(now(), COALESCE(
    CASE usage.sandbox_kind
        WHEN 'workspace' THEN (SELECT COALESCE(w.suspended_at, w.deleted_at, w.last_activity_at, w.updated_at) FROM workspaces w WHERE w.id::text = usage.sandbox_id)
        WHEN 'agent' THEN (SELECT COALESCE(a.finished_at, a.deleted_at, a.updated_at) FROM agent_sessions a WHERE a.id::text = usage.sandbox_id)
    END, now())))
WHERE usage.ended_at IS NULL AND (
    (usage.sandbox_kind = 'workspace' AND NOT EXISTS (
        SELECT 1 FROM workspaces w WHERE w.id::text = usage.sandbox_id
        AND w.status IN ('pending', 'starting', 'running') AND w.deleted_at IS NULL
    )) OR
    (usage.sandbox_kind = 'agent' AND NOT EXISTS (
        SELECT 1 FROM agent_sessions a WHERE a.id::text = usage.sandbox_id
        AND a.status = 'active' AND a.deleted_at IS NULL
    ))
)
`
)

type legacyUsageOwner struct {
	kind  string
	owner int64
}

func legacyUsageOwners(t *testing.T, pool *pgxpool.Pool) map[string]legacyUsageOwner {
	t.Helper()
	rows, err := pool.Query(t.Context(),
		`SELECT sandbox_id, billing_owner_type, billing_owner_id FROM sandbox_usage_intervals WHERE ended_at IS NULL`)
	require.NoError(t, err)
	defer rows.Close()
	owners := map[string]legacyUsageOwner{}
	for rows.Next() {
		var id, kind string
		var owner int64
		require.NoError(t, rows.Scan(&id, &kind, &owner))
		owners[id] = legacyUsageOwner{kind: kind, owner: owner}
	}
	require.NoError(t, rows.Err())
	return owners
}

// usageBillingOwnerFixture seeds the owners, repositories and workspaces the
// legacy intervals name, at the schema the previous release serves.
func usageBillingOwnerFixture(t *testing.T, pool *pgxpool.Pool) (machine, person, member, org int64) {
	t.Helper()
	ctx := t.Context()
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&machine))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, lower_username) VALUES ('person','person') RETURNING id`).Scan(&person))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, lower_username) VALUES ('member','member') RETURNING id`).Scan(&member))
	// The organization deliberately takes the service account's numeric id, so
	// a reader that drops the owner type would read the wrong payer.
	_, err := pool.Exec(ctx, `INSERT INTO organizations (id, name, lower_name) VALUES ($1,'acme','acme')`, machine)
	require.NoError(t, err)
	return machine, person, member, machine
}

// Every legacy interval representation must survive 0167 unchanged in the
// columns the old binaries read, and gain the repository's payer.
func TestSandboxUsageBillingOwnerMigrationKeepsLegacyIntervals(t *testing.T) {
	pool := reviewDatabase(t, 166)
	ctx := t.Context()
	machine, person, member, org := usageBillingOwnerFixture(t, pool)

	var personRepo, orgRepo int64
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO repositories (user_id,name,lower_name) VALUES ($1,'solo','solo') RETURNING id`, person).Scan(&personRepo))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO repositories (org_id,name,lower_name) VALUES ($1,'teamwork','teamwork') RETURNING id`, org).Scan(&orgRepo))

	workspace := func(repo, owner int64, name string) string {
		var id string
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO workspaces (repository_id,user_id,name,status) VALUES ($1,$2,$3,'running') RETURNING id::text`,
			repo, owner, name).Scan(&id))
		return id
	}
	own := workspace(personRepo, person, "own")
	team := workspace(orgRepo, member, "team")
	branch := workspace(personRepo, machine, "branch")
	collaborator := workspace(personRepo, member, "collaborator")

	var session string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO agent_sessions (id,repository_id,user_id,status,started_at)
		 VALUES (gen_random_uuid(),$1,$2,'active',now()) RETURNING id::text`,
		personRepo, person).Scan(&session))

	const orphan = "66666666-6666-4666-8666-666666666666"
	const machineOrphan = "77777777-7777-4777-8777-777777777777"
	const ended = "88888888-8888-4888-8888-888888888888"
	legacy := []struct {
		owner int64
		kind  string
		id    string
	}{
		{person, "workspace", own},
		{member, "workspace", team},
		{machine, "workspace", branch},
		{member, "workspace", collaborator},
		{person, "agent", session},
		{person, "gateway", "gw-legacy-1"},
		{person, "workspace", orphan},
		{machine, "workspace", machineOrphan},
		{person, "workspace", ended},
	}
	for _, row := range legacy {
		_, err := pool.Exec(ctx, legacyOpenSandboxUsageInterval, row.owner, row.kind, row.id)
		require.NoError(t, err, "the serving release opens %s %s", row.kind, row.id)
	}
	_, err := pool.Exec(ctx, legacyCloseSandboxUsageInterval, "workspace", ended)
	require.NoError(t, err)
	// Fix the clock-independent part of every interval so the retained reader
	// answers can be compared across the migration.
	_, err = pool.Exec(ctx, `UPDATE sandbox_usage_intervals
	  SET started_at = now() - interval '90 minutes',
	      ended_at = CASE WHEN ended_at IS NULL THEN NULL ELSE now() - interval '30 minutes' END`)
	require.NoError(t, err)

	type retained struct {
		kind, id        string
		owner           int64
		started, closed any
	}
	before := map[string]retained{}
	rows, err := pool.Query(ctx, `SELECT sandbox_kind, sandbox_id, user_id, started_at, ended_at FROM sandbox_usage_intervals`)
	require.NoError(t, err)
	for rows.Next() {
		var row retained
		require.NoError(t, rows.Scan(&row.kind, &row.id, &row.owner, &row.started, &row.closed))
		before[row.kind+"/"+row.id] = row
	}
	rows.Close()
	require.NoError(t, rows.Err())
	require.Len(t, before, len(legacy))

	require.NoError(t, Apply(ctx, pool))

	after := map[string]retained{}
	rows, err = pool.Query(ctx, `SELECT sandbox_kind, sandbox_id, user_id, started_at, ended_at FROM sandbox_usage_intervals`)
	require.NoError(t, err)
	for rows.Next() {
		var row retained
		require.NoError(t, rows.Scan(&row.kind, &row.id, &row.owner, &row.started, &row.closed))
		after[row.kind+"/"+row.id] = row
	}
	rows.Close()
	require.NoError(t, rows.Err())
	assert.Equal(t, before, after, "0167 must not touch a column the serving release reads")

	owners := legacyUsageOwners(t, pool)
	assert.Equal(t, legacyUsageOwner{"user", person}, owners[own])
	assert.Equal(t, legacyUsageOwner{"org", org}, owners[team], "an organization's repository pays for its workspace")
	assert.Equal(t, legacyUsageOwner{"user", person}, owners[branch], "a branch machine's hours belong to the repository, not the service account")
	assert.Equal(t, legacyUsageOwner{"user", person}, owners[collaborator], "a collaborator's workspace is paid by the repository")
	assert.Equal(t, legacyUsageOwner{"user", person}, owners[session])
	assert.Equal(t, legacyUsageOwner{"user", person}, owners["gw-legacy-1"])
	assert.Equal(t, legacyUsageOwner{"user", person}, owners[orphan], "an interval whose workspace is gone keeps its legacy identity")
	assert.Equal(t, legacyUsageOwner{"user", machine}, owners[machineOrphan])

	var seconds int64
	require.NoError(t, pool.QueryRow(ctx, legacySumSandboxAwakeSecondsForUserSince, time.Now().Add(-3*time.Hour), person).Scan(&seconds))
	assert.Positive(t, seconds, "the retained reader still sums by user_id")
}

// Every write the previous release makes after 0167 must still be accepted,
// and must land on the repository's payer.
func TestSandboxUsageBillingOwnerAcceptsLegacyWritesAfterMigration(t *testing.T) {
	pool := reviewDatabase(t, 0)
	ctx := t.Context()
	machine, person, member, org := usageBillingOwnerFixture(t, pool)

	var personRepo, orgRepo int64
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO repositories (user_id,name,lower_name) VALUES ($1,'solo','solo') RETURNING id`, person).Scan(&personRepo))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO repositories (org_id,name,lower_name) VALUES ($1,'teamwork','teamwork') RETURNING id`, org).Scan(&orgRepo))
	workspace := func(repo, owner int64, name string) string {
		var id string
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO workspaces (repository_id,user_id,name,status) VALUES ($1,$2,$3,'running') RETURNING id::text`,
			repo, owner, name).Scan(&id))
		return id
	}
	own := workspace(personRepo, person, "own")
	team := workspace(orgRepo, member, "team")
	branch := workspace(personRepo, machine, "branch")
	var session string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO agent_sessions (id,repository_id,user_id,status,started_at)
		 VALUES (gen_random_uuid(),$1,$2,'active',now()) RETURNING id::text`,
		personRepo, person).Scan(&session))

	for _, row := range []struct {
		owner    int64
		kind, id string
		want     legacyUsageOwner
	}{
		{person, "workspace", own, legacyUsageOwner{"user", person}},
		{member, "workspace", team, legacyUsageOwner{"org", org}},
		{machine, "workspace", branch, legacyUsageOwner{"user", person}},
		{person, "agent", session, legacyUsageOwner{"user", person}},
		{person, "gateway", "gw-post-1", legacyUsageOwner{"user", person}},
		// A person's own interval for a workspace that is already gone keeps
		// the legacy identity rather than failing the stamp.
		{person, "workspace", "a6666666-6666-4666-8666-666666666666", legacyUsageOwner{"user", person}},
	} {
		_, err := pool.Exec(ctx, legacyOpenSandboxUsageInterval, row.owner, row.kind, row.id)
		require.NoError(t, err, "the serving release opens %s %s", row.kind, row.id)
		assert.Equal(t, row.want, legacyUsageOwners(t, pool)[row.id])
	}

	// The old guard still makes a second open a no-op, and the old close ends
	// exactly the interval it names.
	_, err := pool.Exec(ctx, legacyOpenSandboxUsageInterval, person, "workspace", own)
	require.NoError(t, err)
	var opens int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM sandbox_usage_intervals WHERE sandbox_kind='workspace' AND sandbox_id=$1`, own).Scan(&opens))
	assert.EqualValues(t, 1, opens)
	_, err = pool.Exec(ctx, legacyCloseSandboxUsageInterval, "workspace", own)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, legacyCloseOrphanedSandboxUsageIntervals)
	require.NoError(t, err, "the serving release's orphan sweep still runs")
}

// The single legacy write 0167 refuses: an interval for a workspace that no
// longer exists, opened under the service account, has no payer to name. The
// serving release logs that stamp and continues, so this is the stamp it
// loses, not a lifecycle it fails. Keep it measured, not assumed.
func TestSandboxUsageBillingOwnerRefusesUnownedServiceAccountInterval(t *testing.T) {
	pool := reviewDatabase(t, 0)
	ctx := t.Context()
	machine, _, _, _ := usageBillingOwnerFixture(t, pool)
	_, err := pool.Exec(ctx, legacyOpenSandboxUsageInterval, machine, "workspace", "b7777777-7777-4777-8777-777777777777")
	require.ErrorContains(t, err, "workspace billing owner unavailable")
	var rows int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM sandbox_usage_intervals`).Scan(&rows))
	assert.Zero(t, rows)
}
