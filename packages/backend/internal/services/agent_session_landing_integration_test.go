package services

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingGitHubFake(t *testing.T) {
	f := newPublicationFixture(t, false)
	pool := f.pool.(*pgxpool.Pool)
	q := db.New(pool)
	ctx := context.Background()
	user, err := q.GetUserByID(ctx, f.userID)
	require.NoError(t, err)
	agents := NewAgentServiceWithPool(q, pool)
	session, err := agents.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: f.repoID, UserID: f.userID, Title: "Update greeting"})
	require.NoError(t, err)
	// This fixture uses the repo-host change lookup port; the source transfer
	// and every GitHub request use real Git and the shared githubfake server.
	f.commit("update greeting", "JOURNEY.md", "Hello from the agent\n")
	head := f.git(f.work, "rev-parse", "HEAD")
	changeID := "testchange"
	sourceRef := repohost.WorkspaceSourceRef(pullWorkspace, head)
	f.git(f.work, "push", "-q", f.hostDir, "HEAD:"+sourceRef)
	rh := &mockLandingRepoHostClient{getChangeFn: func(context.Context, string, string, string) (repohost.Change, error) {
		return repohost.Change{ChangeID: changeID, CommitID: head}, nil
	}}
	landings := NewLandingServiceWithPool(q, rh, pool)
	userRepos := NewGitHubUserReposService(q, fakeOAuthTokenDecrypter{token: "ghu_githubfake_owner"})
	pulls := NewLandingGitHubPullService(landings, q, f.connections, userRepos, "http://smithers.test", f.connections)
	remotes := pulls.remotes
	pulls.remotes = func(ctx context.Context, actor *db.User, repository db.Repository, owner, repo string) (landingGitHubRemotes, error) {
		r, err := remotes(ctx, actor, repository, owner, repo)
		// The repo-host Git surface is the fixture's real bare repository.
		r.sourceURL = f.hostDir
		return r, err
	}
	service := NewAgentSessionLandingService(agents, pulls, pool)
	assertCode := func(code pkgerrors.Code, sessionID string, replyID *int64) {
		t.Helper()
		_, err := service.Open(ctx, &user, "smithers-canary", "smithers", sessionID, replyID)
		var api *pkgerrors.APIError
		require.ErrorAs(t, err, &api)
		require.Equal(t, code, api.Code)
	}
	assertCode(pkgerrors.CodeSessionNotFound, "00000000-0000-0000-0000-000000000001", nil)
	assertCode(pkgerrors.CodeNoCodingResult, session.ID, nil)
	seed := func(content string) int64 {
		t.Helper()
		reply, err := agents.AppendMessage(ctx, session.ID, "assistant", []db.CreateAgentPartParams{{PartType: "coding_result", Content: json.RawMessage(content)}})
		require.NoError(t, err)
		return reply.ID
	}
	noHead := seed(`{"head_commit":null,"head_change_id":null,"test_receipt":null}`)
	assertCode(pkgerrors.CodeNoTurnHead, session.ID, &noHead)
	mismatch := seed(fmt.Sprintf(`{"head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"npm run test","exit_code":0,"commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tests_run":1}}`, head, changeID))
	assertCode(pkgerrors.CodeHeadReceiptMismatch, session.ID, &mismatch)
	reply := seed(fmt.Sprintf(`{"head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":1}}`, head, changeID, head))
	first, err := service.Open(ctx, &user, "smithers-canary", "smithers", session.ID, &reply)
	require.NoError(t, err)
	require.Equal(t, LandingGitHubPullBranch(first.LandingNumber), first.Branch)
	require.Equal(t, head, f.githubRef(first.Branch))
	require.Equal(t, f.main, f.githubRef("main"), "GitHub main is unchanged")
	require.Equal(t, f.main, f.hostRef("refs/heads/main"), "Smithers main is unchanged")
	require.True(t, first.Tested)
	require.True(t, first.Passed)
	require.Positive(t, first.PullNumber)
	require.NotEmpty(t, first.PullURL)
	seed(`{"head_commit":null,"head_change_id":null,"test_receipt":null}`)
	second, err := service.Open(ctx, &user, "smithers-canary", "smithers", session.ID, nil)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeAlreadyLanded, api.Code)
	require.Equal(t, first, second)
	require.Len(t, f.pullCreates(), 1)
}
