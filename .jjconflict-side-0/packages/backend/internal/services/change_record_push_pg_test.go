package services

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

type recordPushRow struct {
	CommitID    string
	RevisionSeq int64
	UpdatedAt   time.Time
	Xmin        string
}

func recordPushChangeRows(t *testing.T, pool *pgxpool.Pool, repoID int64) map[string]recordPushRow {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT change_id, commit_id, revision_seq, updated_at, xmin::text
		FROM changes WHERE repository_id = $1`, repoID)
	require.NoError(t, err)
	defer rows.Close()
	out := map[string]recordPushRow{}
	for rows.Next() {
		var changeID string
		var row recordPushRow
		require.NoError(t, rows.Scan(&changeID, &row.CommitID, &row.RevisionSeq, &row.UpdatedAt, &row.Xmin))
		out[changeID] = row
	}
	require.NoError(t, rows.Err())
	return out
}

// recordPushRevisionRows maps "change_id@commit_id" to the revision row's
// tuple version, so a test can tell a no-op upsert from an untouched row.
func recordPushRevisionRows(t *testing.T, pool *pgxpool.Pool, repoID int64) map[string]string {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT change_id || '@' || commit_id, xmin::text
		FROM change_revisions WHERE repository_id = $1`, repoID)
	require.NoError(t, err)
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var key, xmin string
		require.NoError(t, rows.Scan(&key, &xmin))
		out[key] = xmin
	}
	require.NoError(t, rows.Err())
	return out
}

func recordPushHost(changes ...repohost.Change) *changeTestRepoHost {
	return &changeTestRepoHost{pages: map[string][]repohost.Change{"": changes}}
}

// A push that moves one of N changes rewrites only that change: unmoved
// changes keep their row version, updated_at and revision row; the moved
// change gets a new revision; a new change is inserted.
func TestChangeServicePG_RecordPushWritesOnlyMovedAndNewChanges(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping DB integration test in short mode")
	}
	pool := setupTestPool(t)
	_, repoID := setupTestUserAndRepo(t, pool)
	ctx := context.Background()

	a := repohost.Change{ChangeID: "change-a", CommitID: "commit-a1", ParentCommitID: "root", Description: "A", ParentChangeIDs: []string{"root-change"}}
	b := repohost.Change{ChangeID: "change-b", CommitID: "commit-b1", ParentCommitID: "commit-a1", Description: "B", ParentChangeIDs: []string{"change-a"}}
	c := repohost.Change{ChangeID: "change-c", CommitID: "commit-c1", ParentCommitID: "commit-b1", Description: "C", ParentChangeIDs: []string{"change-b"}, IsEmpty: true}
	require.NoError(t, NewChangeService(db.New(pool), recordPushHost(a, b, c), pool).RecordPush(ctx, repoID, "alice", "demo"))

	before := recordPushChangeRows(t, pool, repoID)
	beforeRevisions := recordPushRevisionRows(t, pool, repoID)
	require.Len(t, before, 3)
	require.Len(t, beforeRevisions, 3)

	movedB := b
	movedB.CommitID = "commit-b2"
	movedB.Description = "B amended"
	d := repohost.Change{ChangeID: "change-d", CommitID: "commit-d1", ParentCommitID: "commit-c1", Description: "D", ParentChangeIDs: []string{"change-c"}}
	require.NoError(t, NewChangeService(db.New(pool), recordPushHost(a, movedB, c, d), pool).RecordPush(ctx, repoID, "alice", "demo"))

	after := recordPushChangeRows(t, pool, repoID)
	afterRevisions := recordPushRevisionRows(t, pool, repoID)

	for _, unmoved := range []string{"change-a", "change-c"} {
		assert.Equal(t, before[unmoved], after[unmoved], "%s did not move; its row must not be rewritten", unmoved)
		commit := before[unmoved].CommitID
		assert.Equal(t, beforeRevisions[unmoved+"@"+commit], afterRevisions[unmoved+"@"+commit], "%s's revision row must not be rewritten", unmoved)
	}
	rewritten := 0
	for changeID, row := range after {
		if prior, ok := before[changeID]; !ok || prior.Xmin != row.Xmin {
			rewritten++
		}
	}
	assert.Equal(t, 2, rewritten, "only the moved and the new change are written")

	assert.Equal(t, "commit-b2", after["change-b"].CommitID)
	assert.Equal(t, int64(2), after["change-b"].RevisionSeq)
	assert.NotEqual(t, before["change-b"].Xmin, after["change-b"].Xmin)
	assert.Contains(t, afterRevisions, "change-b@commit-b2")
	var description string
	require.NoError(t, pool.QueryRow(ctx, `SELECT description FROM changes WHERE repository_id = $1 AND change_id = 'change-b'`, repoID).Scan(&description))
	assert.Equal(t, "B amended", description)

	require.Contains(t, after, "change-d")
	assert.Equal(t, "commit-d1", after["change-d"].CommitID)
	assert.Equal(t, int64(1), after["change-d"].RevisionSeq)
	assert.Contains(t, afterRevisions, "change-d@commit-d1")
	assert.Len(t, afterRevisions, 5)
}

// A commit that another path recorded without the push recorder's side
// effects (issue links, conflict cache, landing turn) is still completed by
// the next push even though the change did not move.
func TestChangeServicePG_RecordPushCompletesAnUnmovedChangeOtherPathsRecorded(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping DB integration test in short mode")
	}
	pool := setupTestPool(t)
	userID, repoID := setupTestUserAndRepo(t, pool)
	ctx := context.Background()
	queries := db.New(pool)

	var issueID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO issues(repository_id, number, title, author_id) VALUES ($1, 7, 'bug', $2) RETURNING id`, repoID, userID).Scan(&issueID))
	var landingID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO landing_requests(repository_id, number, title, author_id, target_bookmark, turn_since)
		VALUES ($1, 8, 'land', $2, 'main', NOW() - INTERVAL '1 hour') RETURNING id`, repoID, userID).Scan(&landingID))

	// Project each change the way landing preparation does: the change row
	// and a push revision, with none of the push recorder's side effects.
	project := func(change repohost.Change) {
		parents, err := json.Marshal(change.ParentChangeIDs)
		require.NoError(t, err)
		_, err = queries.UpsertChange(ctx, db.UpsertChangeParams{
			RepositoryID: repoID, ChangeID: change.ChangeID, CommitID: change.CommitID, Description: change.Description,
			HasConflict: change.HasConflict, IsEmpty: change.IsEmpty, ParentChangeIds: parents,
		})
		require.NoError(t, err)
		_, err = queries.RecordChangeRevision(ctx, db.RecordChangeRevisionParams{
			RepositoryID: repoID, ChangeID: change.ChangeID, CommitID: change.CommitID, ParentCommitID: change.ParentCommitID,
			Source: "push", OperationIds: []string{},
		})
		require.NoError(t, err)
	}
	linked := repohost.Change{ChangeID: "change-linked", CommitID: "commit-l1", ParentChangeIDs: []string{}, Description: "Fix\n\nCloses: #7"}
	stale := repohost.Change{ChangeID: "change-stale", CommitID: "commit-s1", ParentChangeIDs: []string{}, Description: "Clean"}
	landed := repohost.Change{ChangeID: "change-landed", CommitID: "commit-x1", ParentChangeIDs: []string{}, Description: "Stacked"}
	project(linked)
	project(stale)
	project(landed)
	_, err := pool.Exec(ctx, `INSERT INTO conflicts(repository_id, change_id, file_path, conflict_type) VALUES ($1, 'change-stale', 'old.go', 'content')`, repoID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO landing_request_changes(landing_request_id, change_id, position_in_stack) VALUES ($1, 'change-landed', 1)`, landingID)
	require.NoError(t, err)

	require.NoError(t, NewChangeService(queries, recordPushHost(linked, stale, landed), pool).RecordPush(ctx, repoID, "alice", "demo"))

	var linkType string
	require.NoError(t, pool.QueryRow(ctx, `SELECT link_type FROM issue_change_links WHERE repository_id = $1 AND change_id = 'change-linked' AND issue_id = $2`, repoID, issueID).Scan(&linkType))
	assert.Equal(t, "closes", linkType)
	var conflicts int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM conflicts WHERE repository_id = $1 AND change_id = 'change-stale'`, repoID).Scan(&conflicts))
	assert.Zero(t, conflicts)
	var turnReason string
	var turnRevisionID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT turn_reason, turn_revision_id FROM landing_requests WHERE id = $1`, landingID).Scan(&turnReason, &turnRevisionID))
	assert.Equal(t, "revision", turnReason)
	assert.NotZero(t, turnRevisionID)

	// Once complete, the same push writes nothing.
	before := recordPushChangeRows(t, pool, repoID)
	beforeRevisions := recordPushRevisionRows(t, pool, repoID)
	require.NoError(t, NewChangeService(queries, recordPushHost(linked, stale, landed), pool).RecordPush(ctx, repoID, "alice", "demo"))
	assert.Equal(t, before, recordPushChangeRows(t, pool, repoID))
	assert.Equal(t, beforeRevisions, recordPushRevisionRows(t, pool, repoID))
}

// A change that still has conflicts is re-read from repo-host on every push,
// because its stored conflict cache cannot prove what repo-host reports now.
func TestChangeServicePG_RecordPushRefreshesAConflictedUnmovedChange(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping DB integration test in short mode")
	}
	pool := setupTestPool(t)
	_, repoID := setupTestUserAndRepo(t, pool)
	ctx := context.Background()

	conflicted := repohost.Change{ChangeID: "change-c", CommitID: "commit-c1", ParentChangeIDs: []string{}, HasConflict: true}
	host := recordPushHost(conflicted)
	host.conflicts = []repohost.Conflict{{FilePath: "a.go", ConflictType: "content"}}
	require.NoError(t, NewChangeService(db.New(pool), host, pool).RecordPush(ctx, repoID, "alice", "demo"))

	host.conflicts = []repohost.Conflict{{FilePath: "b.go", ConflictType: "content"}}
	require.NoError(t, NewChangeService(db.New(pool), host, pool).RecordPush(ctx, repoID, "alice", "demo"))

	var paths []string
	require.NoError(t, pool.QueryRow(ctx, `SELECT array_agg(file_path ORDER BY file_path) FROM conflicts WHERE repository_id = $1 AND change_id = 'change-c'`, repoID).Scan(&paths))
	assert.Equal(t, []string{"b.go"}, paths)
}
