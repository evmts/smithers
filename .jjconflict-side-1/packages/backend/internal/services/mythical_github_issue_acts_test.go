package services

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The ordinary issue acts the app offers — close, reopen and the edit of a
// comment the App wrote — over a real HTTP GitHub standing in for the API.
// The assertion is the WIRE: the request's method, path, installation
// permissions and JSON body, not a mocked interface's arguments. A close that
// quietly dropped state_reason, or an edit that reopened the issue, would
// read identically through a mock and differently here.
func TestMythicalGitHubIssueActsWire(t *testing.T) {
	t.Parallel()
	github := &recordedGitHub{routes: map[string]func(http.ResponseWriter){
		"PATCH /repos/o/r/issues/3":          answer(http.StatusOK, map[string]any{"number": 3, "state": "closed"}),
		"PATCH /repos/o/r/issues/4":          answer(http.StatusForbidden, map[string]any{"message": "secret-upstream"}),
		"PATCH /repos/o/r/issues/comments/9": answer(http.StatusOK, map[string]any{"id": 9}),
		"PATCH /repos/o/r/issues/comments/8": answer(http.StatusNotFound, map[string]any{"message": "secret-upstream"}),
	}}
	api := github.api(t)
	ctx := context.Background()

	require.NoError(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{State: "closed"}))
	assert.Equal(t, `PATCH /repos/o/r/issues/3 issues=write {"state":"closed","state_reason":"completed"}`, github.calls[0])

	require.NoError(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{State: "open"}))
	assert.Equal(t, `PATCH /repos/o/r/issues/3 issues=write {"state":"open"}`, github.calls[1],
		"a reopen carries no state_reason: GitHub records one only for a close")

	title, body := "Renamed", "Rewritten"
	require.NoError(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{Title: &title, Body: &body}))
	assert.Equal(t, `PATCH /repos/o/r/issues/3 issues=write {"body":"Rewritten","title":"Renamed"}`, github.calls[2],
		"a text edit names no state, so it cannot reopen a closed issue")

	require.NoError(t, api.UpdateIssueComment(ctx, stackRepo, 9, "Edited"))
	assert.Equal(t, `PATCH /repos/o/r/issues/comments/9 issues=write {"body":"Edited"}`, github.calls[3])

	// An edit that names nothing never reaches GitHub.
	before := len(github.calls)
	require.Error(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{}))
	require.Len(t, github.calls, before)

	// A refusal stays a refusal; the provider's own message never carries
	// GitHub's prose back to a caller.
	err := api.UpdateIssue(ctx, stackRepo, 4, mythicalIssueEdit{State: "closed"})
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "secret-upstream")
	err = api.UpdateIssueComment(ctx, stackRepo, 8, "Edited")
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "secret-upstream")

	for _, call := range github.calls {
		assert.Contains(t, call, " issues=write ", call)
		assert.True(t, strings.HasPrefix(call, "PATCH "), call)
	}
}

// Every issue act goes through the caller's send fence, so the worker can
// hold the credential and roster locks around the one actual request and
// record an unresolved outcome if the reply is lost.
func TestMythicalGitHubIssueActsUseTheSendFence(t *testing.T) {
	t.Parallel()
	github := &recordedGitHub{routes: map[string]func(http.ResponseWriter){
		"PATCH /repos/o/r/issues/3":          answer(http.StatusOK, map[string]any{}),
		"PATCH /repos/o/r/issues/comments/9": answer(http.StatusOK, map[string]any{}),
	}}
	api := github.api(t)
	fenced := 0
	ctx := context.WithValue(context.Background(), gitHubIssueSendKey{}, gitHubIssueSendFence(func(send func(context.Context) error) error {
		fenced++
		return send(context.Background())
	}))
	require.NoError(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{State: "closed"}))
	require.NoError(t, api.UpdateIssueComment(ctx, stackRepo, 9, "Edited"))
	require.Equal(t, 2, fenced, "both acts send inside the fence")
	// A refused edit never enters the fence: nothing was sent to fence.
	require.Error(t, api.UpdateIssue(ctx, stackRepo, 3, mythicalIssueEdit{}))
	require.Equal(t, 2, fenced)
}
