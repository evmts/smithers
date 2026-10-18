package services

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// issueActsFixture is the publication fixture plus the one durable job store
// the canonical issue writer uses, so the acts below run the real pipeline:
// admission in its own transaction, a claim on a real worker, credential
// reload and actor re-authorization, the send fence, and the receipt.
type issueActsFixture struct {
	*publicationFixture
	jobs *jobs.Store
	ctx  context.Context
}

func newIssueActsFixture(t *testing.T) *issueActsFixture {
	t.Helper()
	f := newPublicationFixture(t, false)
	store, err := jobs.NewStore(f.pool.(*pgxpool.Pool))
	require.NoError(t, err)
	f.service.SetInstallIssueJobs(store)
	ctx := middleware.ContextWithAuthInfo(context.Background(), &middleware.AuthInfo{User: &db.User{ID: f.userID, Username: "rehearsal-owner"}, SessionHash: "owner-session"})
	ctx = registerTestInstallCredential(t, f.pool, ctx, f.repoID)
	return &issueActsFixture{publicationFixture: f, jobs: store, ctx: ctx}
}

// work claims and runs exactly one pending issue write, as the shared worker
// does, and answers the operation's terminal state.
func (f *issueActsFixture) work(t *testing.T, id string) jobs.State {
	t.Helper()
	worker, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	go func() {
		_ = f.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "acts-" + id, Capacity: 1, Lease: time.Minute, PollInterval: 10 * time.Millisecond,
			Operations: []string{InstallIssueCommentOperation, InstallIssueCreateOperation, InstallIssueCloseOperation, InstallIssueReopenOperation, InstallIssueCommentEditOperation}},
			f.service.HandleInstallIssueWrite)
	}()
	var state string
	require.Eventually(t, func() bool {
		if err := f.pool.QueryRow(context.Background(), "SELECT state FROM product_job_requests WHERE id=$1", id).Scan(&state); err != nil {
			return false
		}
		return state == string(jobs.StateCompleted) || state == string(jobs.StateFailed) || state == string(jobs.StateUncertain)
	}, 25*time.Second, 20*time.Millisecond, "operation %s must settle, last state %q", id, state)
	return jobs.State(state)
}

// The ordinary GitHub issue acts through the canonical durable writer, with
// real PostgreSQL and a real HTTP GitHub (the fake) answering the API. The
// assertion is GitHub's own state afterwards, read back off the fake — never
// a receipt the product wrote about itself.
func TestInstallIssueActsReachGitHub(t *testing.T) {
	f := newIssueActsFixture(t)
	const repo = "rehearsal-owner/app"
	number := f.fake.OpenIssue(repo, "rehearsal-owner", "An act", "Body")
	issue := func() (string, string) {
		t.Helper()
		got, ok := f.fake.Issue(repo, number)
		require.True(t, ok)
		return got.State, got.StateReason
	}

	state, _ := issue()
	require.Equal(t, "open", state)

	// Close: the acknowledgment is immediate and carries no GitHub result.
	receipt, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID, number, "close-1")
	require.NoError(t, err)
	require.Equal(t, "requested", receipt.Kind)
	require.NotEmpty(t, receipt.OperationID)
	state, _ = issue()
	require.Equal(t, "open", state, "admission alone writes nothing to GitHub")

	// The same key admits the same operation: never a second POST.
	replay, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID, number, "close-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)

	require.Equal(t, jobs.StateCompleted, f.work(t, receipt.OperationID))
	state, reason := issue()
	require.Equal(t, "closed", state)
	require.Equal(t, "completed", reason, "GitHub records why the issue closed")

	// The outcome is readable afterwards without repeating the write.
	status, err := f.service.InstallIssueCreateStatus(f.ctx, f.repoID, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, status["state"])

	// Reopen, through the same pipeline and the same fence.
	reopen, err := f.service.RequestInstallIssueReopen(f.ctx, f.repoID, number, "reopen-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, reopen.OperationID))
	state, _ = issue()
	require.Equal(t, "open", state)

	// A comment, then an edit of that comment in place.
	comment, err := f.service.RequestInstallIssueComment(f.ctx, f.repoID, number, "First", "comment-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, comment.OperationID))
	got, _ := f.fake.Issue(repo, number)
	require.Len(t, got.Comments, 1)
	require.Contains(t, got.Comments[0].Body, "First")
	require.Contains(t, got.Comments[0].Body, "Requested by @rehearsal-owner")

	edit, err := f.service.RequestInstallIssueCommentEdit(f.ctx, f.repoID, got.Comments[0].ID, "Second", "edit-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, edit.OperationID))
	got, _ = f.fake.Issue(repo, number)
	require.Len(t, got.Comments, 1, "an edit replaces the comment; it never posts another")
	require.Contains(t, got.Comments[0].Body, "Second")
	require.Contains(t, got.Comments[0].Body, "Requested by @rehearsal-owner", "the edit keeps who asked")

	// One key cannot carry a second payload: nothing more is sent.
	_, err = f.service.RequestInstallIssueCommentEdit(f.ctx, f.repoID, got.Comments[0].ID, "Third", "edit-1")
	require.Error(t, err)
	got, _ = f.fake.Issue(repo, number)
	require.Contains(t, got.Comments[0].Body, "Second")
}

// A stale repository, an unusable subject and a missing key are refused
// before any admission, so no job exists to send.
func TestInstallIssueActsRefuseBeforeAdmission(t *testing.T) {
	f := newIssueActsFixture(t)
	const repo = "rehearsal-owner/app"
	number := f.fake.OpenIssue(repo, "rehearsal-owner", "An act", "Body")
	admitted := func() int64 {
		t.Helper()
		var count int64
		require.NoError(t, f.pool.QueryRow(context.Background(), "SELECT count(*) FROM product_job_requests").Scan(&count))
		return count
	}
	before := admitted()

	// A repository that is not the install's own is refused: the number
	// belongs to the install's repository, never to a caller-named one.
	_, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID+1000, number, "stale-1")
	require.Error(t, err)

	for _, tc := range []struct {
		name   string
		act    func() error
		detail string
	}{
		{"no issue", func() error {
			_, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID, 0, "bad-1")
			return err
		}, "invalid_issue_state"},
		{"no key", func() error {
			_, err := f.service.RequestInstallIssueReopen(f.ctx, f.repoID, number, "")
			return err
		}, "invalid_issue_state"},
		{"no comment", func() error {
			_, err := f.service.RequestInstallIssueCommentEdit(f.ctx, f.repoID, 0, "x", "bad-2")
			return err
		}, "invalid_issue_comment"},
		{"empty body", func() error {
			_, err := f.service.RequestInstallIssueCommentEdit(f.ctx, f.repoID, 9, "  ", "bad-3")
			return err
		}, "invalid_issue_comment"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requireTodoControl(t, tc.act(), 400, tc.detail)
		})
	}
	require.Equal(t, before, admitted(), "nothing was admitted")
}

// An outcome GitHub never confirmed is visible as uncertain and is NOT sent
// again: the worker records the unresolved external attempt and the status
// door answers it, so a client reads the outcome rather than POSTing twice.
func TestInstallIssueCloseLostReplyStaysUncertain(t *testing.T) {
	f := newIssueActsFixture(t)
	const repo = "rehearsal-owner/app"
	number := f.fake.OpenIssue(repo, "rehearsal-owner", "An act", "Body")
	// GitHub applies the close and the reply is lost on the way back.
	f.fake.LoseNextResponses(fmt.Sprintf("/repos/%s/issues/%d", repo, number), 1)
	receipt, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID, number, "lost-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateUncertain, f.work(t, receipt.OperationID))

	status, err := f.service.InstallIssueCreateStatus(f.ctx, f.repoID, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateUncertain, status["state"], "the unknown outcome stays checkable")

	// The pre-call marker was committed exactly once, so GitHub saw the write
	// once: the lost reply left the operation unresolved, never re-sent.
	var attempt int
	require.NoError(t, f.pool.QueryRow(context.Background(),
		"SELECT external_attempt FROM product_job_dispatches WHERE operation_id=$1", receipt.OperationID).Scan(&attempt))
	require.Equal(t, 1, attempt, "exactly one external attempt")
	// GitHub did apply it; nothing claimed success, and nothing repeated it.
	applied, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	require.Equal(t, "closed", applied.State)

	// The same key still answers the same operation rather than sending again.
	replay, err := f.service.RequestInstallIssueClose(f.ctx, f.repoID, number, "lost-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
	raw, err := json.Marshal(status)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "github", "the state carries no provider prose")
}
