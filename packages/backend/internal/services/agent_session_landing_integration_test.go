package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/stretchr/testify/require"
)

func TestSessionLandingGitHubFake(t *testing.T) {
	for _, tc := range []struct {
		name           string
		receipt        string
		tested, passed bool
	}{
		{"passed", `{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":1}`, true, true},
		{"zero tests", `{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":0}`, true, false},
		{"unknown count", `{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":null}`, true, true},
		{"failed tests", `{"command":"npm run test","exit_code":1,"commit":%q,"tests_run":3}`, true, false},
		{"not tested", "null", false, false},
	} {
		t.Run(tc.name, func(t *testing.T) { testSessionLandingGitHubFake(t, tc.receipt, tc.tested, tc.passed) })
	}
}

type sessionLandingTestFixture struct {
	f              *publicationFixture
	pool           *pgxpool.Pool
	agents         *AgentService
	service        *AgentSessionLandingService
	user           db.User
	session        AgentSessionResponse
	head, changeID string
}

func newSessionLandingTestFixture(t *testing.T, opts ...LandingServiceOption) *sessionLandingTestFixture {
	f := newPublicationFixture(t, false)
	config := f.pool.(*pgxpool.Pool).Config()
	config.MaxConns = 3
	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
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
	landings := NewLandingServiceWithPool(q, rh, pool, opts...)
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
	return &sessionLandingTestFixture{f: f, pool: pool, agents: agents, service: service, user: user, session: session, head: head, changeID: changeID}

}

func testSessionLandingGitHubFake(t *testing.T, receiptTemplate string, tested, passed bool) {
	x := newSessionLandingTestFixture(t)
	f, pool, agents, service, user, session, head, changeID := x.f, x.pool, x.agents, x.service, x.user, x.session, x.head, x.changeID
	q := db.New(pool)
	ctx := context.Background()
	assertCode := func(code pkgerrors.Code, sessionID string, replyID *int64) {
		t.Helper()
		_, err := service.Open(ctx, &user, "smithers-canary", "smithers", sessionID, replyID)
		var api *pkgerrors.APIError
		require.ErrorAs(t, err, &api)
		require.Equal(t, code, api.Code)
	}
	assertCode(pkgerrors.CodeSessionNotFound, "00000000-0000-0000-0000-000000000001", nil)
	assertCode(pkgerrors.CodeSessionNotFound, "missing-session", nil)
	assertCode(pkgerrors.CodeNoCodingResult, session.ID, nil)
	other, err := q.GetUserByID(ctx, f.userID)
	require.NoError(t, err)
	other.ID = f.userID + 9999
	_, err = service.Open(ctx, &other, "smithers-canary", "smithers", session.ID, nil)
	var denied *pkgerrors.APIError
	require.ErrorAs(t, err, &denied)
	require.Equal(t, pkgerrors.CodePushPermissionRequired, denied.Code)
	seed := func(content string) int64 {
		t.Helper()
		reply, err := seedServerCodingResult(t, agents, pool, ctx, session.ID, json.RawMessage(content))
		require.NoError(t, err)
		return reply.ID
	}
	noHead := seed(`{"producer":"smithers-server","head_commit":null,"head_change_id":null,"test_receipt":null}`)
	assertCode(pkgerrors.CodeNoTurnHead, session.ID, &noHead)
	mismatch := seed(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"npm run test","exit_code":0,"commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tests_run":1}}`, head, changeID))
	assertCode(pkgerrors.CodeHeadReceiptMismatch, session.ID, &mismatch)
	receipt := receiptTemplate
	if receipt != "null" {
		receipt = fmt.Sprintf(receiptTemplate, head)
	}
	reply := seed(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":%s}`, head, changeID, receipt))
	first, err := service.Open(ctx, &user, "smithers-canary", "smithers", session.ID, &reply)
	require.NoError(t, err)
	require.Equal(t, LandingGitHubPullBranch(first.LandingNumber), first.Branch)
	require.Equal(t, head, f.githubRef(first.Branch))
	require.Equal(t, f.main, f.githubRef("main"), "GitHub main is unchanged")
	require.Equal(t, f.main, f.hostRef("refs/heads/main"), "Smithers main is unchanged")
	require.Equal(t, tested, first.Tested)
	require.Equal(t, passed, first.Passed)
	require.Positive(t, first.PullNumber)
	require.NotEmpty(t, first.PullURL)
	seed(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"other test","exit_code":1,"commit":%q,"tests_run":1}}`, head, changeID, head))
	second, err := service.Open(ctx, &user, "smithers-canary", "smithers", session.ID, &reply)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeAlreadyLanded, api.Code)
	require.Equal(t, first, second)
	require.Len(t, f.pullCreates(), 1)
	retryCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var wait sync.WaitGroup
	failures := make(chan error, 8)
	for range 8 {
		wait.Go(func() {
			replay, err := service.Open(retryCtx, &user, "smithers-canary", "smithers", session.ID, &reply)
			var refusal *pkgerrors.APIError
			if !errors.As(err, &refusal) || refusal.Code != pkgerrors.CodeAlreadyLanded || replay != first {
				failures <- fmt.Errorf("concurrent replay: result=%+v err=%v", replay, err)
			}
		})
	}
	wait.Wait()
	close(failures)
	for err := range failures {
		require.NoError(t, err)
	}
	require.Len(t, f.pullCreates(), 1)

}

// NewSessionLandingHTTPFixture shares the real PostgreSQL, Git transfer and
// githubfake boundary with the external test of the production HTTP handler.
func NewSessionLandingHTTPFixture(t *testing.T) (*AgentSessionLandingService, *AgentService, *db.User, db.Repository, string, string, func(SessionLanding)) {
	t.Helper()
	x := newSessionLandingTestFixture(t)
	raw := fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":2}}`, x.head, x.changeID, x.head)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(raw))
	require.NoError(t, err)
	repository, err := db.New(x.pool).GetRepoByID(t.Context(), x.f.repoID)
	require.NoError(t, err)
	verify := func(result SessionLanding) {
		require.Equal(t, x.head, x.f.githubRef(result.Branch))
		require.Equal(t, x.f.main, x.f.githubRef("main"))
		require.Equal(t, x.f.main, x.f.hostRef("refs/heads/main"))
		require.Len(t, x.f.pullCreates(), 1)
	}
	return x.service, x.agents, &x.user, repository, x.session.ID, x.head, verify
}

func TestSessionLandingProvenanceRollsBackWithCreation(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	ctx := t.Context()
	var workspaceID string
	require.NoError(t, x.pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'session-source') RETURNING id`, x.f.repoID, x.user.ID).Scan(&workspaceID))
	_, err := x.pool.Exec(ctx, `UPDATE agent_sessions SET workspace_id=$1 WHERE id=$2`, workspaceID, x.session.ID)
	require.NoError(t, err)
	raw := fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)
	_, err = seedServerCodingResult(t, x.agents, x.pool, ctx, x.session.ID, json.RawMessage(raw))
	require.NoError(t, err)
	_, err = x.pool.Exec(ctx, `CREATE FUNCTION refuse_session_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'source recording unavailable'; END $$`)
	require.NoError(t, err)
	_, err = x.pool.Exec(ctx, `CREATE TRIGGER refuse_session_source BEFORE INSERT ON landing_source_workspaces FOR EACH ROW EXECUTE FUNCTION refuse_session_source()`)
	require.NoError(t, err)
	_, err = x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.Error(t, err)
	var count int
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT count(*) FROM landing_requests WHERE author_agent_session_id=$1`, x.session.ID).Scan(&count))
	require.Zero(t, count, "a failed provenance write must not leave a landing that a retry could publish without its source")
	require.Empty(t, x.f.pullCreates())
	_, err = x.pool.Exec(ctx, `DROP TRIGGER refuse_session_source ON landing_source_workspaces`)
	require.NoError(t, err)
	result, err := x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
	var stored string
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT l.workspace_id FROM landing_source_workspaces l JOIN landing_requests r ON r.id=l.landing_request_id WHERE r.number=$1 AND r.repository_id=$2`, result.LandingNumber, x.f.repoID).Scan(&stored))
	require.Equal(t, workspaceID, stored)
	require.Len(t, x.f.pullCreates(), 1)
}

func TestSessionLandingMissingSourceDoesNotPublish(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	ctx := t.Context()
	var workspaceID string
	require.NoError(t, x.pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name) VALUES($1,$2,'missing-source') RETURNING id`, x.f.repoID, x.user.ID).Scan(&workspaceID))
	_, err := x.pool.Exec(ctx, `UPDATE agent_sessions SET workspace_id=$1 WHERE id=$2`, workspaceID, x.session.ID)
	require.NoError(t, err)
	raw := fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)
	reply, err := seedServerCodingResult(t, x.agents, x.pool, ctx, x.session.ID, json.RawMessage(raw))
	require.NoError(t, err)
	q := db.New(x.pool)
	var key pgtype.UUID
	require.NoError(t, key.Scan(sessionLandingRequestID(x.session.ID, reply.ID)))
	params := db.CreateLandingRequestParams{RepositoryID: x.f.repoID, AuthorID: x.user.ID, Title: "Missing source", TargetBookmark: "main", StackSize: 1, AgentAuthored: true, AuthorAgentSessionID: x.session.ID}
	landing, err := q.CreateLandingRequestIdempotent(ctx, db.CreateLandingRequestIdempotentParams{RepositoryID: params.RepositoryID, AuthorID: params.AuthorID, Title: params.Title, TargetBookmark: params.TargetBookmark, StackSize: params.StackSize, AgentAuthored: params.AgentAuthored, AuthorAgentSessionID: params.AuthorAgentSessionID, RequestID: key, CreateRequestHash: landingCreateDigest(params, []string{x.changeID})})
	require.NoError(t, err)
	_, err = q.AddLandingRequestChange(ctx, db.AddLandingRequestChangeParams{LandingRequestID: landing.ID, ChangeID: x.changeID, PositionInStack: 1})
	require.NoError(t, err)
	_, err = x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.Error(t, err, "an existing landing without its expected source must fail closed")
	require.Empty(t, x.f.pullCreates())
	require.Empty(t, x.f.githubRef(LandingGitHubPullBranch(landing.Number)))
}

// Distinct sessions must not exhaust the pool while their landing locks are held.
func TestSessionLandingPoolSaturation(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	const sessions = 6
	ids := make([]string, sessions)
	for i := range ids {
		session, err := x.agents.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: x.f.repoID, UserID: x.user.ID, Title: fmt.Sprintf("Session %d", i)})
		require.NoError(t, err)
		ids[i] = session.ID
		_, err = seedServerCodingResult(t, x.agents, x.pool, ctx, session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, fmt.Sprintf("change-%d", i))))
		require.NoError(t, err)
	}
	// The first two landings wait after acquiring session exclusion. No
	// landing may finish early and accidentally hide pool saturation.
	var mu sync.Mutex
	arrived := 0
	barrier := make(chan struct{})
	x.service.pulls.landings.repoHost = &mockLandingRepoHostClient{getChangeFn: func(ctx context.Context, _, _, changeID string) (repohost.Change, error) {
		mu.Lock()
		arrived++
		if arrived == 2 {
			close(barrier)
		}
		mu.Unlock()
		select {
		case <-barrier:
			return repohost.Change{ChangeID: changeID, CommitID: x.head}, nil
		case <-ctx.Done():
			return repohost.Change{}, ctx.Err()
		}
	}}
	start := make(chan struct{})
	type outcome struct {
		id     string
		result SessionLanding
		err    error
	}
	results := make(chan outcome, sessions)
	for _, id := range ids {
		go func(id string) {
			<-start
			result, err := x.service.Open(ctx, &x.user, "smithers-canary", "smithers", id, nil)
			results <- outcome{id, result, err}
		}(id)
	}
	close(start)
	outcomes := make([]outcome, 0, sessions)
	for range sessions {
		outcomes = append(outcomes, <-results)
	}
	require.NoError(t, ctx.Err(), "all landings finish before the request deadline")
	for _, out := range outcomes {
		require.NoError(t, out.err)
		require.Equal(t, x.head, out.result.HeadCommit)
		var count int
		require.NoError(t, x.pool.QueryRow(t.Context(), `SELECT count(*) FROM landing_requests WHERE author_agent_session_id=$1`, out.id).Scan(&count))
		require.Equal(t, 1, count)
		replay, err := x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", out.id, nil)
		var api *pkgerrors.APIError
		require.ErrorAs(t, err, &api)
		require.Equal(t, pkgerrors.CodeAlreadyLanded, api.Code)
		require.Equal(t, out.result, replay)
	}
	require.Len(t, x.f.pullCreates(), sessions)
	require.Equal(t, x.f.main, x.f.githubRef("main"))
}

func TestSessionLandingAfterBoxStopped(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	ctx := t.Context()
	q := db.New(x.pool)
	definition, err := q.UpsertAgentWorkflowDefinition(ctx, x.f.repoID)
	require.NoError(t, err)
	run, err := q.CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{RepositoryID: x.f.repoID, WorkflowDefinitionID: definition.ID, Status: "success", TriggerEvent: "agent", TriggerRef: "main", TriggerCommitSha: x.head, DispatchInputs: json.RawMessage(`{}`)})
	require.NoError(t, err)
	_, err = x.pool.Exec(ctx, `UPDATE workflow_runs SET completed_at=now() WHERE id=$1`, run.ID)
	require.NoError(t, err)
	_, err = x.pool.Exec(ctx, `UPDATE agent_sessions SET workflow_run_id=$1 WHERE id=$2`, run.ID, x.session.ID)
	require.NoError(t, err)
	var workspaceID string
	require.NoError(t, x.pool.QueryRow(ctx, `INSERT INTO workspaces(repository_id,user_id,name,status) VALUES($1,$2,'stopped-session-box','stopped') RETURNING id`, x.f.repoID, x.user.ID).Scan(&workspaceID))
	_, err = x.pool.Exec(ctx, `UPDATE agent_sessions SET workspace_id=$1 WHERE id=$2`, workspaceID, x.session.ID)
	require.NoError(t, err)
	_, err = seedServerCodingResult(t, x.agents, x.pool, ctx, x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	_, err = x.pool.Exec(ctx, `UPDATE agent_sessions SET status='completed' WHERE id=$1`, x.session.ID)
	require.NoError(t, err)
	// No workspace backend is installed: landing must use only the durable
	// result and retained repo-host source, never start or call the box.
	result, err := x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
	require.Equal(t, x.head, x.f.githubRef(result.Branch))
	require.Len(t, x.f.pullCreates(), 1)
	var status string
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT status FROM workspaces WHERE id=$1`, workspaceID).Scan(&status))
	require.Equal(t, "stopped", status)
}

func TestSessionLandingDoesNotKeepTransactionAcrossHostCall(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	ctx := t.Context()
	_, err := seedServerCodingResult(t, x.agents, x.pool, ctx, x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	x.service.pulls.landings.repoHost = &mockLandingRepoHostClient{getChangeFn: func(ctx context.Context, _, _, _ string) (repohost.Change, error) {
		var count int
		// Observe through the fixture's independent connection pool, so the
		// assertion also works when the landing pool itself is saturated.
		err := x.f.pool.(*pgxpool.Pool).QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'`).Scan(&count)
		if err != nil {
			return repohost.Change{}, err
		}
		if count != 0 {
			return repohost.Change{}, fmt.Errorf("host called with %d open transactions", count)
		}
		return repohost.Change{ChangeID: x.changeID, CommitID: x.head}, nil
	}}
	_, err = x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
}

func TestSessionLandingCancelledHostCallReleasesLock(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	original := x.service.pulls.landings.repoHost
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	x.service.pulls.landings.repoHost = &mockLandingRepoHostClient{getChangeFn: func(ctx context.Context, _, _, _ string) (repohost.Change, error) {
		cancel()
		return repohost.Change{}, ctx.Err()
	}}
	_, err = x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.Error(t, err)
	x.service.pulls.landings.repoHost = original
	retryCtx, retryCancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer retryCancel()
	result, err := x.service.Open(retryCtx, &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
	require.Equal(t, x.head, result.HeadCommit)
	require.Len(t, x.f.pullCreates(), 1)
}

func TestSessionLandingRefusesAnotherPersonsSession(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	other, err := db.New(x.pool).CreateUser(t.Context(), db.CreateUserParams{Username: "other-session-owner", LowerUsername: "other-session-owner"})
	require.NoError(t, err)
	_, err = x.pool.Exec(t.Context(), "UPDATE agent_sessions SET user_id = $2 WHERE id=$1", x.session.ID, other.ID)
	require.NoError(t, err)
	_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeSessionNotFound, api.Code)
	missing := httptest.NewRecorder()
	pkgerrors.WriteError(missing, api)
	_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", "00000000-0000-0000-0000-000000000001", nil)
	require.ErrorAs(t, err, &api)
	absent := httptest.NewRecorder()
	pkgerrors.WriteError(absent, api)
	require.Equal(t, missing.Code, absent.Code)
	require.JSONEq(t, missing.Body.String(), absent.Body.String())
}

func TestSessionLandingRefusesChangedRecordedHead(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	x.service.pulls.landings.repoHost = &mockLandingRepoHostClient{getChangeFn: func(context.Context, string, string, string) (repohost.Change, error) {
		return repohost.Change{ChangeID: x.changeID, CommitID: x.f.main}, nil
	}}
	_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeHeadReceiptMismatch, api.Code)
	require.Empty(t, x.f.pullCreates())
	require.Equal(t, x.f.main, x.f.githubRef("main"))
}

func TestSessionLandingRefusesForcePushedPull(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	first, err := x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
	x.f.git(x.f.work, "push", "--force", x.f.github, x.f.main+":refs/heads/"+first.Branch)
	_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeHeadReceiptMismatch, api.Code)
	require.Len(t, x.f.pullCreates(), 1)
	require.Equal(t, x.f.main, x.f.githubRef("main"))
}

func TestSessionLandingForcePushRaceDoesNotCreatePull(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":null}`, x.head, x.changeID)))
	require.NoError(t, err)
	push := x.service.pulls.push
	x.service.pulls.push = func(ctx context.Context, source, sourceRef, commit, destination, targetRef string) error {
		if err := push(ctx, source, sourceRef, commit, destination, targetRef); err != nil {
			return err
		}
		// A competing pusher changes the real GitHub bare ref between publication
		// and verification. The PR API must never receive a create for that head.
		x.f.git(x.f.work, "push", "--force", x.f.github, x.f.main+":"+targetRef)
		return nil
	}
	_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeHeadReceiptMismatch, api.Code)
	require.Empty(t, x.f.pullCreates())
	require.Equal(t, x.f.main, x.f.githubRef("main"))
	require.Equal(t, x.f.main, x.f.hostRef("refs/heads/main"))
}

func TestSessionLandingIgnoresAgentPrecreatedLanding(t *testing.T) {
	x := newSessionLandingTestFixture(t)
	_, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q}`, x.head, x.changeID)))
	require.NoError(t, err)
	q := db.New(x.pool)
	forged, err := q.CreateLandingRequest(t.Context(), db.CreateLandingRequestParams{RepositoryID: x.f.repoID, AuthorID: x.user.ID, Title: "Injected title", Body: "Injected body", TargetBookmark: "evil", StackSize: 1, AgentAuthored: true, AuthorAgentSessionID: x.session.ID})
	require.NoError(t, err)
	_, err = q.AddLandingRequestChange(t.Context(), db.AddLandingRequestChangeParams{LandingRequestID: forged.ID, ChangeID: x.changeID, PositionInStack: 1})
	require.NoError(t, err)
	result, err := x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, nil)
	require.NoError(t, err)
	require.NotEqual(t, forged.Number, result.LandingNumber)
	creates := x.f.pullCreates()
	require.Len(t, creates, 1)
	raw, _ := json.Marshal(creates[0])
	require.NotContains(t, string(raw), "Injected")
	require.Contains(t, string(raw), "Update greeting")
}

func TestSessionLandingReuseRevalidatesApprovedSnapshot(t *testing.T) {
	for _, mutation := range []string{"copy", "base", "head"} {
		t.Run(mutation, func(t *testing.T) {
			x := newSessionLandingTestFixture(t)
			reply, err := seedServerCodingResult(t, x.agents, x.pool, t.Context(), x.session.ID, json.RawMessage(fmt.Sprintf(`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q}`, x.head, x.changeID)))
			require.NoError(t, err)
			landing, err := x.service.pulls.landings.CreateLandingRequest(t.Context(), &x.user, "smithers-canary", "smithers", CreateLandingRequestInput{RequestID: sessionLandingRequestID(x.session.ID, reply.ID), Title: "Update greeting", TargetBookmark: "main", ChangeIDs: []string{x.changeID}})
			require.NoError(t, err)
			_, err = x.pool.Exec(t.Context(), `UPDATE landing_requests SET title='Injected title',body='Injected body' WHERE repository_id=$1 AND number=$2`, x.f.repoID, landing.Number)
			require.NoError(t, err)
			if mutation == "base" {
				_, err = x.pool.Exec(t.Context(), `UPDATE landing_requests SET target_bookmark='evil' WHERE repository_id=$1 AND number=$2`, x.f.repoID, landing.Number)
				require.NoError(t, err)
			}
			if mutation == "head" {
				x.service.pulls.landings.repoHost = &mockLandingRepoHostClient{getChangeFn: func(context.Context, string, string, string) (repohost.Change, error) {
					return repohost.Change{ChangeID: x.changeID, CommitID: x.f.main}, nil
				}}
			}
			_, err = x.service.Open(t.Context(), &x.user, "smithers-canary", "smithers", x.session.ID, &reply.ID)
			if mutation != "copy" {
				require.Error(t, err)
				require.Empty(t, x.f.pullCreates())
				return
			}
			require.NoError(t, err)
			creates := x.f.pullCreates()
			require.Len(t, creates, 1)
			raw, _ := json.Marshal(creates[0])
			require.NotContains(t, string(raw), "Injected")
			require.Contains(t, string(raw), "Update greeting")
		})
	}
}
