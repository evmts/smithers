package compose

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/stretchr/testify/require"
)

// The ordinary GitHub issue acts end to end: the catalog's own HTTP doors,
// real OAuth sessions, the durable worker, PostgreSQL, and the local GitHub
// fake standing in for api.github.com. The assertion is GitHub's OWN state
// afterwards — the issue the fake holds — not a receipt the app wrote.
//
// Closing, reopening and editing ride the same pipeline as the create and
// the comment: an immediate 202 with a durable receipt, one send on the
// worker behind the credential reload and send fence, the same operation
// replayed under one idempotency key, and a different payload under the same
// key refused instead of sent twice.
func TestInstallIssueActsComposed(t *testing.T) {
	t.Setenv("SMITHERS_ISSUE_ACTS_REHEARSAL", "1")
	r := newRehearsal(t, "SMITHERS_ISSUE_ACTS_REHEARSAL", "C-ACC-01", "acts-")
	require.True(t, r.install("Install ready"))
	const repo = "rehearsal-owner/app"
	number := r.fake.OpenIssue(repo, "rehearsal-owner", "An act", "Body")
	await := func(t *testing.T, id string, state jobs.State) {
		t.Helper()
		require.Eventually(t, func() bool {
			var got string
			err := r.pool.QueryRow(r.ctx, "SELECT state FROM product_job_requests WHERE id=$1", id).Scan(&got)
			return err == nil && got == string(state)
		}, 15*time.Second, 20*time.Millisecond, "operation %s must reach %s", id, state)
	}
	// accept sends one act and answers the durable operation it admitted.
	accept := func(t *testing.T, method, path, body, key string) string {
		t.Helper()
		code, raw, err := r.keyed(method, path, body, key)
		require.NoError(t, err)
		require.Equal(t, 202, code, string(raw))
		var receipt jobs.RequestReceipt
		require.NoError(t, json.Unmarshal(raw, &receipt))
		require.Equal(t, "requested", receipt.Kind, "the acknowledgment precedes the network write")
		require.NotEmpty(t, receipt.OperationID)
		return receipt.OperationID
	}
	state := func() string {
		t.Helper()
		issue, ok := r.fake.Issue(repo, number)
		require.True(t, ok)
		return issue.State
	}
	closePath := fmt.Sprintf("/api/issues/%d/close", number)
	reopenPath := fmt.Sprintf("/api/issues/%d/reopen", number)

	t.Run("close reaches GitHub once and replays under its key", func(t *testing.T) {
		require.Equal(t, "open", state())
		id := accept(t, "POST", closePath, "", "session-close")
		replay := accept(t, "POST", closePath, "", "session-close")
		require.Equal(t, id, replay, "one key is one operation, never a second POST")
		await(t, id, jobs.StateCompleted)
		require.Equal(t, "closed", state())
		issue, _ := r.fake.Issue(repo, number)
		require.Equal(t, "completed", issue.StateReason, "GitHub records why it closed")
	})

	t.Run("the outcome is readable without repeating the write", func(t *testing.T) {
		id := accept(t, "POST", reopenPath, "", "session-reopen")
		await(t, id, jobs.StateCompleted)
		raw, err := r.expect("GET", "/api/issues/requests/"+id, "", 200)
		require.NoError(t, err)
		var status struct{ State string }
		require.NoError(t, json.Unmarshal(raw, &status))
		require.Equal(t, "completed", status.State)
		require.Equal(t, "open", state(), "the reopen is GitHub's own state, not a local flag")
	})

	t.Run("a comment the App wrote is edited in place", func(t *testing.T) {
		id := accept(t, "POST", fmt.Sprintf("/api/issues/%d/comments", number), `{"body":"First"}`, "session-comment")
		await(t, id, jobs.StateCompleted)
		issue, _ := r.fake.Issue(repo, number)
		require.Len(t, issue.Comments, 1)
		require.Contains(t, issue.Comments[0].Body, "First")
		edit := accept(t, "PATCH", fmt.Sprintf("/api/issues/comments/%d", issue.Comments[0].ID), `{"body":"Second"}`, "session-edit")
		await(t, edit, jobs.StateCompleted)
		issue, _ = r.fake.Issue(repo, number)
		require.Len(t, issue.Comments, 1, "an edit replaces the comment; it never adds one")
		require.Contains(t, issue.Comments[0].Body, "Second")
		require.Contains(t, issue.Comments[0].Body, "Requested by @rehearsal-owner", "the edit keeps who asked")
	})

	t.Run("one key cannot carry a second payload", func(t *testing.T) {
		issue, _ := r.fake.Issue(repo, number)
		code, raw, err := r.keyed("PATCH", fmt.Sprintf("/api/issues/comments/%d", issue.Comments[0].ID), `{"body":"Third"}`, "session-edit")
		require.NoError(t, err)
		require.Equal(t, 409, code, string(raw))
		issue, _ = r.fake.Issue(repo, number)
		require.Contains(t, issue.Comments[0].Body, "Second", "the refused request sent nothing")
	})

	t.Run("an unusable subject is refused with no admission", func(t *testing.T) {
		before := state()
		for _, tc := range []struct{ method, path, body string }{
			{"POST", "/api/issues/0/close", ""},
			{"POST", "/api/issues/0/reopen", ""},
			{"PATCH", "/api/issues/comments/0", `{"body":"x"}`},
			{"PATCH", fmt.Sprintf("/api/issues/comments/%d", 1), `{"body":""}`},
		} {
			code, raw, err := r.keyed(tc.method, tc.path, tc.body, "invalid-"+tc.path+tc.method)
			require.NoError(t, err)
			require.Equal(t, 400, code, string(raw))
		}
		require.Equal(t, before, state())
	})

	t.Run("an act with no key is refused", func(t *testing.T) {
		code, raw, err := r.keyed("POST", closePath, "", "")
		require.NoError(t, err)
		require.Equal(t, 400, code, string(raw))
	})
}
