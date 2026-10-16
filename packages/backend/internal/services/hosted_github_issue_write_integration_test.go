package services

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/githubfake"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
The hosted, multitenant GitHub issue writer end to end (#4030).

This is NOT an install: `self_host_owners` and `install_settings` are empty,
the service holds no install authorization, and no owner is singular. Three
people and three repositories stand in a real PostgreSQL database; GitHub is
githubfake over real HTTP, holding its own issues and comments. Each act goes
through the actual admission, the actual shared worker claim, the credential
reload, the live re-resolution of the actor's repository authority, GitHub's
own answer about that actor, the send fence and the receipt.

Every assertion about an act's effect is read back off GitHub's own state, not
off a receipt the product wrote about itself. No live GitHub request is made.
*/

// hostedIssueInstallations gives each fixture its own App installation id:
// installation tokens are cached process-wide by installation.
var hostedIssueInstallations atomic.Int64

// passthroughOAuthToken stores each person's GitHub token verbatim, so the
// fixture can give three people three different GitHub identities.
type passthroughOAuthToken struct{}

func (passthroughOAuthToken) DecryptOAuthAccessToken(ciphertext []byte) (string, error) {
	return string(ciphertext), nil
}

type hostedIssueFixture struct {
	t        *testing.T
	pool     *pgxpool.Pool
	fake     *githubfake.Server
	service  *MythicalService
	jobs     *jobs.Store
	writer   int64 // owns flows and docs; admin on GitHub
	reader   int64 // read-only Smithers collaborator on flows
	stranger int64 // owns the foreign repository
	flows    int64
	docs     int64
	foreign  int64
}

// person inserts one account with its own GitHub identity and credential.
func (f *hostedIssueFixture) person(login string, githubID int64, token string) int64 {
	f.t.Helper()
	var id int64
	require.NoError(f.t, f.pool.QueryRow(context.Background(),
		`INSERT INTO users(username, lower_username) VALUES ($1,$1) RETURNING id`, login).Scan(&id))
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO oauth_accounts(user_id, provider, provider_user_id, profile_data, access_token_encrypted)
		 VALUES ($1,'github',$2,$3,$4)`, id, fmt.Sprint(githubID), fmt.Sprintf(`{"login":%q}`, login), []byte(token))
	require.NoError(f.t, err)
	return id
}

func (f *hostedIssueFixture) repository(owner int64, name, destination string) int64 {
	f.t.Helper()
	var id int64
	require.NoError(f.t, f.pool.QueryRow(context.Background(),
		`INSERT INTO repositories(user_id, name, lower_name, default_bookmark, mirror_destination)
		 VALUES ($1,$2,$2,'main',$3) RETURNING id`, owner, name, destination).Scan(&id))
	return id
}

// session is one person's browser session, as every HTTP caller presents one.
func (f *hostedIssueFixture) session(user int64, login string) context.Context {
	f.t.Helper()
	key := fmt.Sprintf("session-%d", user)
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO auth_sessions(session_key,user_id,username,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')`, key, user, login)
	require.NoError(f.t, err)
	return middleware.ContextWithAuthInfo(context.Background(), &middleware.AuthInfo{User: &db.User{ID: user, Username: login}, SessionHash: key})
}

func newHostedIssueFixture(t *testing.T) *hostedIssueFixture {
	t.Helper()
	installation := 9400 + hostedIssueInstallations.Add(1)
	pool := newProductTestPool(t)
	ctx := context.Background()
	f := &hostedIssueFixture{t: t, pool: pool}

	// Three people with three GitHub identities. The fake answers each their
	// OWN permissions on a repository, as GitHub does.
	f.writer = f.person("will", 7, "ghu_githubfake_user_7")
	f.reader = f.person("ana", 21, "ghu_githubfake_user_21")
	f.stranger = f.person("zed", 22, "ghu_githubfake_user_22")
	f.flows = f.repository(f.writer, "flows", "will/flows")
	f.docs = f.repository(f.writer, "docs", "will/docs")
	f.foreign = f.repository(f.stranger, "private", "zed/private")
	// ana is a READ-ONLY collaborator on flows in Smithers' own roster.
	_, err := pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES ($1,$2,'read')`, f.flows, f.reader)
	require.NoError(t, err)

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	app := GitHubAppCredentials{ID: 42, Slug: "smithers-hosted", OwnerLogin: "will", OwnerKind: "user", ClientID: "client",
		ClientSecret: "secret", WebhookSecret: "webhook", PEM: string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))}
	fake, err := githubfake.New(githubfake.Config{OAuthCode: "will-code", GitRoot: t.TempDir(), AppID: app.ID, Slug: app.Slug,
		OwnerLogin: app.OwnerLogin, OwnerKind: app.OwnerKind, ClientID: app.ClientID, ClientSecret: app.ClientSecret,
		WebhookSecret: app.WebhookSecret, PrivateKeyPEM: app.PEM, ConversionCode: "manifest-code",
		Installations: []githubfake.Installation{{ID: installation, Repositories: []githubfake.Repository{
			{ID: 100, FullName: "will/flows"},
			{ID: 101, FullName: "will/docs"},
		}}}})
	require.NoError(t, err)
	t.Cleanup(fake.Close)
	f.fake = fake
	t.Setenv("SMITHERS_GITHUB_APP_API_BASE_URL", fake.URL)
	t.Setenv("SMITHERS_GITHUB_GIT_BASE_URL", fake.URL)
	// GitHub's own access facts: will may write, ana may only read.
	fake.SetCollaborator(7, "will", "admin")
	fake.SetCollaborator(21, "ana", "read")

	codec, err := webhook.NewSecretCodec("hosted-issue-sealing-key")
	require.NoError(t, err)
	credentials := NewGitHubAppCredentialStore(pool, codec)
	require.NoError(t, credentials.Save(ctx, app))
	userRepos := NewGitHubUserReposService(db.New(pool), passthroughOAuthToken{})
	connections := NewRepoConnectionService(pool, credentials)
	connections.SetGitHubRepoAccessVerifier(userRepos)
	for _, name := range []string{"flows", "docs"} {
		_, err = connections.ConnectRepo(ctx, f.writer, "will", name, "MIT")
		require.NoError(t, err)
	}
	require.NoError(t, connections.ReconcileGitHubAppInstallations(ctx))

	// A hosted service: no install authorization, no bound repository.
	f.service = NewMythicalService(pool, nil)
	f.service.SetOrchestration(NewMythicalGitHub(db.New(pool), connections, userRepos, connections), nil, nil)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	f.service.SetInstallIssueJobs(store)
	f.jobs = store

	// The authority this writer runs under is NOT an install's.
	var installRows int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT (SELECT count(*) FROM self_host_owners) + (SELECT count(*) FROM install_settings)`).Scan(&installRows))
	require.Zero(t, installRows, "the hosted writer reads no install binding")
	return f
}

// work claims and runs exactly one pending act on the SHARED issue-write
// worker — the same worker, the same operation list and the same handler the
// composed backend runs — and answers the operation's terminal state.
func (f *hostedIssueFixture) work(t *testing.T, id string) jobs.State {
	t.Helper()
	worker, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	go func() {
		_ = f.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "hosted-" + id, Capacity: 1, Lease: time.Minute,
			PollInterval: 10 * time.Millisecond, Operations: IssueWriteOperations()}, f.service.HandleInstallIssueWrite)
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

// terminalCode is the closed reason code a settled failure carries.
func (f *hostedIssueFixture) terminalCode(t *testing.T, id string) string {
	t.Helper()
	var raw []byte
	require.NoError(t, f.pool.QueryRow(context.Background(), "SELECT terminal_receipt FROM product_job_requests WHERE id=$1", id).Scan(&raw))
	var receipt struct {
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(raw, &receipt))
	return receipt.Code
}

// admitted counts every durable job, so a refusal can be shown to have
// admitted nothing at all.
func (f *hostedIssueFixture) admitted(t *testing.T) int64 {
	t.Helper()
	var count int64
	require.NoError(t, f.pool.QueryRow(context.Background(), "SELECT count(*) FROM product_job_requests").Scan(&count))
	return count
}

// TestHostedGitHubIssueActsReachGitHub is the acceptance line: all five
// ordinary acts, on a hosted origin, land on GitHub's own object.
func TestHostedGitHubIssueActsReachGitHub(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A hosted act", "Body")
	issue := func() (string, string, int) {
		t.Helper()
		got, ok := f.fake.Issue(repo, number)
		require.True(t, ok)
		return got.State, got.StateReason, len(got.Comments)
	}

	state, _, _ := issue()
	require.Equal(t, "open", state)

	// Close: the acknowledgment is the admission and carries no GitHub result.
	receipt, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "close-1")
	require.NoError(t, err)
	require.Equal(t, "requested", receipt.Kind)
	state, _, _ = issue()
	require.Equal(t, "open", state, "admission alone writes nothing to GitHub")

	// The same key admits the same operation: never a second POST.
	replay, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "close-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)

	require.Equal(t, jobs.StateCompleted, f.work(t, receipt.OperationID))
	state, reason, _ := issue()
	require.Equal(t, "closed", state)
	require.Equal(t, "completed", reason, "GitHub records why the issue closed")

	// The outcome is readable afterwards without repeating the write.
	status, err := f.service.GitHubIssueRequestStatus(ctx, f.flows, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, status["state"])

	// Reopen, through the same pipeline and the same fence. A reopen carries
	// no state_reason, so GitHub's completion is cleared.
	reopen, err := f.service.RequestGitHubIssueReopen(ctx, f.flows, number, "reopen-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, reopen.OperationID))
	state, _, _ = issue()
	require.Equal(t, "open", state)

	// A comment, then an edit of that comment in place.
	comment, err := f.service.RequestGitHubIssueComment(ctx, f.flows, number, "First", "comment-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, comment.OperationID))
	got, _ := f.fake.Issue(repo, number)
	require.Len(t, got.Comments, 1)
	require.Contains(t, got.Comments[0].Body, "First")
	require.Contains(t, got.Comments[0].Body, "Requested by @will")

	edit, err := f.service.RequestGitHubIssueCommentEdit(ctx, f.flows, got.Comments[0].ID, "Second", "edit-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, edit.OperationID))
	got, _ = f.fake.Issue(repo, number)
	require.Len(t, got.Comments, 1, "an edit replaces the comment; it never posts another")
	require.Contains(t, got.Comments[0].Body, "Second")
	require.Contains(t, got.Comments[0].Body, "Requested by @will", "the edit keeps who asked")

	// One key cannot carry a second payload: nothing more is sent.
	_, err = f.service.RequestGitHubIssueCommentEdit(ctx, f.flows, got.Comments[0].ID, "Third", "edit-1")
	require.Error(t, err)
	got, _ = f.fake.Issue(repo, number)
	require.Contains(t, got.Comments[0].Body, "Second")

	// The create: GitHub numbers it, and the receipt answers that number.
	created, err := f.service.RequestGitHubIssueCreate(ctx, f.flows, InstallIssueCreateInput{Title: "Opened from the app", Body: "Please look."}, "create-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, created.OperationID))
	status, err = f.service.GitHubIssueRequestStatus(ctx, f.flows, created.OperationID)
	require.NoError(t, err)
	opened, ok := status["number"].(int64)
	require.True(t, ok, "the create's receipt names GitHub's own number: %v", status)
	fresh, ok := f.fake.Issue(repo, opened)
	require.True(t, ok)
	require.Equal(t, "Opened from the app", fresh.Title)
	require.Contains(t, fresh.Body, "Requested by @will")

	// Nothing about this write started a workspace, a box or a flow.
	for _, table := range []string{"workspaces", "workspace_sessions"} {
		var rows int64
		require.NoError(t, f.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&rows))
		require.Zero(t, rows, "%s must be untouched by an issue write", table)
	}
}

// Each act is its own door AND its own operation, so the act a request was
// authorized for is the act that reaches GitHub, and the two repositories a
// person can write never cross.
func TestHostedGitHubIssueActsStayOnTheirOwnRepository(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	flowsNumber := f.fake.OpenIssue("will/flows", "will", "In flows", "Body")
	docsNumber := f.fake.OpenIssue("will/docs", "will", "In docs", "Body")
	require.Equal(t, flowsNumber, docsNumber, "the two repositories number independently")

	receipt, err := f.service.RequestGitHubIssueClose(ctx, f.docs, docsNumber, "docs-close")
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, f.work(t, receipt.OperationID))

	closed, ok := f.fake.Issue("will/docs", docsNumber)
	require.True(t, ok)
	require.Equal(t, "closed", closed.State)
	untouched, ok := f.fake.Issue("will/flows", flowsNumber)
	require.True(t, ok)
	require.Equal(t, "open", untouched.State, "the same number in the other repository is a different issue")

	// The receipt is scoped to the repository it named, so the other
	// repository's door cannot read or resume it.
	_, err = f.service.GitHubIssueRequestStatus(ctx, f.flows, receipt.OperationID)
	requireTodoControl(t, err, 404, "issue_request_not_found")
}

// Authority is re-read, never assumed: a read-only collaborator, a repository
// the actor holds nothing on, and an unusable subject are all refused BEFORE
// anything is admitted, so no job exists to send.
func TestHostedGitHubIssueActsRefuseBeforeAdmission(t *testing.T) {
	f := newHostedIssueFixture(t)
	number := f.fake.OpenIssue("will/flows", "will", "A hosted act", "Body")
	before := f.admitted(t)

	readOnly := f.session(f.reader, "ana")
	stranger := f.session(f.stranger, "zed")
	writer := f.session(f.writer, "will")

	for _, tc := range []struct {
		name   string
		act    func() error
		status int
		code   string
	}{
		{"a read-only collaborator cannot close", func() error {
			_, err := f.service.RequestGitHubIssueClose(readOnly, f.flows, number, "ana-close")
			return err
		}, 403, "permission"},
		{"a read-only collaborator cannot comment", func() error {
			_, err := f.service.RequestGitHubIssueComment(readOnly, f.flows, number, "hello", "ana-comment")
			return err
		}, 403, "permission"},
		{"a stranger cannot write a repository they hold nothing on", func() error {
			_, err := f.service.RequestGitHubIssueReopen(stranger, f.flows, number, "zed-reopen")
			return err
		}, 403, "permission"},
		{"the owner of another repository cannot write through it", func() error {
			_, err := f.service.RequestGitHubIssueClose(writer, f.foreign, number, "will-foreign")
			return err
		}, 403, "permission"},
		{"no issue number", func() error {
			_, err := f.service.RequestGitHubIssueClose(writer, f.flows, 0, "bad-1")
			return err
		}, 400, "invalid_issue_state"},
		{"no idempotency key", func() error {
			_, err := f.service.RequestGitHubIssueReopen(writer, f.flows, number, "")
			return err
		}, 400, "invalid_issue_state"},
		{"an empty comment", func() error {
			_, err := f.service.RequestGitHubIssueComment(writer, f.flows, number, "   ", "bad-2")
			return err
		}, 400, "invalid_issue_comment"},
		{"a titleless create", func() error {
			_, err := f.service.RequestGitHubIssueCreate(writer, f.flows, InstallIssueCreateInput{Title: " "}, "bad-3")
			return err
		}, 400, "invalid_issue"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requireAccessOrControl(t, tc.act(), tc.status, tc.code)
		})
	}
	require.Equal(t, before, f.admitted(t), "nothing was admitted")
	open, ok := f.fake.Issue("will/flows", number)
	require.True(t, ok)
	require.Equal(t, "open", open.State, "GitHub was never asked")
	require.Empty(t, open.Comments)
}

// GitHub's own access rules are the last word, and a refusal there is a typed,
// truthful outcome — never a Smithers-only success and never a service token.
func TestHostedGitHubIssueRefusalsAreTypedAndTruthful(t *testing.T) {
	f := newHostedIssueFixture(t)
	number := f.fake.OpenIssue("will/flows", "will", "A hosted act", "Body")

	// A Smithers writer whose GitHub account cannot write the repository. The
	// roster says write; GitHub says read, and GitHub decides.
	_, err := f.pool.Exec(context.Background(), `UPDATE collaborators SET permission='write' WHERE repository_id=$1 AND user_id=$2`, f.flows, f.reader)
	require.NoError(t, err)
	writeInSmithers := f.session(f.reader, "ana")
	receipt, err := f.service.RequestGitHubIssueClose(writeInSmithers, f.flows, number, "ana-close")
	require.NoError(t, err, "Smithers admitted it: the roster allows the act")
	require.Equal(t, jobs.StateFailed, f.work(t, receipt.OperationID))
	require.Equal(t, "github_write_required", f.terminalCode(t, receipt.OperationID))
	open, ok := f.fake.Issue("will/flows", number)
	require.True(t, ok)
	require.Equal(t, "open", open.State, "GitHub refused, so nothing changed")

	// The outcome reads back as the refusal, with no provider prose in it.
	status, err := f.service.GitHubIssueRequestStatus(writeInSmithers, f.flows, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateFailed, status["state"])
	require.Equal(t, "github_write_required", status["code"])
	raw, err := json.Marshal(status)
	require.NoError(t, err)
	for _, leak := range []string{"ghu_", "ghs_", "Bearer", "http"} {
		require.NotContains(t, string(raw), leak)
	}

	// A person with no GitHub credential at all, on a repository they own.
	var noCredential int64
	require.NoError(t, f.pool.QueryRow(context.Background(),
		`INSERT INTO users(username, lower_username) VALUES ('nina','nina') RETURNING id`).Scan(&noCredential))
	owned := f.repository(noCredential, "notes", "will/flows")
	nina := f.session(noCredential, "nina")
	ninaReceipt, err := f.service.RequestGitHubIssueComment(nina, owned, number, "hello", "nina-comment")
	require.NoError(t, err)
	require.Equal(t, jobs.StateFailed, f.work(t, ninaReceipt.OperationID))
	require.Equal(t, "github_sign_in_required", f.terminalCode(t, ninaReceipt.OperationID))

	// A repository the App covers no installation for.
	appless := f.repository(f.writer, "offline", "will/offline")
	writer := f.session(f.writer, "will")
	aplessReceipt, err := f.service.RequestGitHubIssueClose(writer, appless, number, "offline-close")
	require.NoError(t, err)
	require.Equal(t, jobs.StateFailed, f.work(t, aplessReceipt.OperationID))
	require.Equal(t, "github_write_required", f.terminalCode(t, aplessReceipt.OperationID),
		"GitHub answers the actor's access first; the App's own coverage cannot be read past it")

	open, ok = f.fake.Issue("will/flows", number)
	require.True(t, ok)
	require.Equal(t, "open", open.State)
	require.Empty(t, open.Comments, "no refusal posted anything")
}

// An outcome GitHub never confirmed stays visible as uncertain and is NOT sent
// again, so a lost reply can never double a write.
func TestHostedGitHubIssueLostReplyStaysUncertain(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A hosted act", "Body")
	f.fake.LoseNextResponses(fmt.Sprintf("/repos/%s/issues/%d", repo, number), 1)

	receipt, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "lost-1")
	require.NoError(t, err)
	require.Equal(t, jobs.StateUncertain, f.work(t, receipt.OperationID))

	status, err := f.service.GitHubIssueRequestStatus(ctx, f.flows, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateUncertain, status["state"], "the unknown outcome stays checkable")

	var attempt int
	require.NoError(t, f.pool.QueryRow(context.Background(),
		"SELECT external_attempt FROM product_job_dispatches WHERE operation_id=$1", receipt.OperationID).Scan(&attempt))
	require.Equal(t, 1, attempt, "exactly one external attempt")

	applied, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	require.Equal(t, "closed", applied.State, "GitHub did apply it; nothing claimed success")

	// The same key still answers the same operation rather than sending again.
	replay, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "lost-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
}

// A credential revoked, or write access lost, between admission and the claim
// stops the act on the worker: the fences are re-read, not remembered.
func TestHostedGitHubIssueWriteStopsWhenAuthorityIsLost(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A hosted act", "Body")

	revoked, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "revoked-1")
	require.NoError(t, err)
	_, err = f.pool.Exec(context.Background(), `DELETE FROM auth_sessions WHERE user_id=$1`, f.writer)
	require.NoError(t, err)
	require.Equal(t, jobs.StateFailed, f.work(t, revoked.OperationID))
	open, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	require.Equal(t, "open", open.State, "a revoked credential sends nothing")

	// Write access lost after admission: the same stop, by the LIVE roster —
	// and the refusal is the roster's own, before GitHub is asked at all.
	_, err = f.pool.Exec(context.Background(),
		`UPDATE collaborators SET permission='write' WHERE repository_id=$1 AND user_id=$2`, f.flows, f.reader)
	require.NoError(t, err)
	ana := f.session(f.reader, "ana")
	lost, err := f.service.RequestGitHubIssueComment(ana, f.flows, number, "late", "lost-write-1")
	require.NoError(t, err)
	_, err = f.pool.Exec(context.Background(),
		`UPDATE collaborators SET permission='read' WHERE repository_id=$1 AND user_id=$2`, f.flows, f.reader)
	require.NoError(t, err)
	require.Equal(t, jobs.StateFailed, f.work(t, lost.OperationID))
	require.Equal(t, "permission", f.terminalCode(t, lost.OperationID),
		"the roster answered before GitHub was asked")
	open, ok = f.fake.Issue(repo, number)
	require.True(t, ok)
	require.Empty(t, open.Comments, "a person who lost write access posts nothing")
}

// A payload that names another repository than the operation's own tenant is
// refused BEFORE anything external starts: the worker trusts the scope it
// claimed, never the payload an admission wrote.
func TestHostedGitHubIssuePoisonedPayloadNeverReachesGitHub(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	number := f.fake.OpenIssue("will/flows", "will", "A hosted act", "Body")
	docsNumber := f.fake.OpenIssue("will/docs", "will", "In docs", "Body")

	receipt, err := f.service.RequestGitHubIssueClose(ctx, f.docs, docsNumber, "poison-1")
	require.NoError(t, err)
	// The admitted payload is rewritten to name the OTHER repository.
	_, err = f.pool.Exec(context.Background(),
		`UPDATE product_job_requests SET payload = jsonb_set(payload,'{repository}',to_jsonb($1::bigint)) WHERE id=$2`, f.flows, receipt.OperationID)
	require.NoError(t, err)

	require.Equal(t, jobs.StateFailed, f.work(t, receipt.OperationID))
	require.Equal(t, "permission", f.terminalCode(t, receipt.OperationID))
	// StartExternal is what stamps external_started_at; the attempt counter
	// is already 1 on the dispatch, so the stamp is the honest witness that
	// no external request was ever begun.
	var started int64
	require.NoError(t, f.pool.QueryRow(context.Background(),
		"SELECT count(*) FROM product_job_dispatches WHERE operation_id=$1 AND external_started_at IS NOT NULL", receipt.OperationID).Scan(&started))
	require.Zero(t, started, "nothing external was started")
	for _, pair := range [][2]any{{"will/flows", number}, {"will/docs", docsNumber}} {
		issue, ok := f.fake.Issue(pair[0].(string), pair[1].(int64))
		require.True(t, ok)
		require.Equal(t, "open", issue.State, "%s#%d must be untouched", pair[0], pair[1])
	}
}

// An operation name no issue act owns is refused rather than guessed at.
func TestHostedGitHubIssueUnknownOperationIsRefused(t *testing.T) {
	f := newHostedIssueFixture(t)
	ctx := f.session(f.writer, "will")
	number := f.fake.OpenIssue("will/flows", "will", "A hosted act", "Body")
	receipt, err := f.service.RequestGitHubIssueClose(ctx, f.flows, number, "unknown-1")
	require.NoError(t, err)
	_, err = f.pool.Exec(context.Background(),
		`UPDATE product_job_requests SET operation='github.issue.delete' WHERE id=$1`, receipt.OperationID)
	require.NoError(t, err)

	worker, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() {
		_ = f.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "unknown", Capacity: 1, Lease: time.Minute,
			PollInterval: 10 * time.Millisecond, Operations: append(IssueWriteOperations(), "github.issue.delete")}, f.service.HandleInstallIssueWrite)
	}()
	var state string
	require.Eventually(t, func() bool {
		_ = f.pool.QueryRow(context.Background(), "SELECT state FROM product_job_requests WHERE id=$1", receipt.OperationID).Scan(&state)
		return state == string(jobs.StateFailed)
	}, 4*time.Second, 20*time.Millisecond, "last state %q", state)
	require.Equal(t, "invalid_issue_operation", f.terminalCode(t, receipt.OperationID))
	open, ok := f.fake.Issue("will/flows", number)
	require.True(t, ok)
	require.Equal(t, "open", open.State)
}

// requireAccessOrControl accepts either typed refusal shape the hosted doors
// answer: AccessError for authority, TodoControlError for an unusable subject.
func requireAccessOrControl(t *testing.T, err error, status int, code string) {
	t.Helper()
	require.Error(t, err)
	var access *AccessError
	if errors.As(err, &access) {
		require.Equal(t, status, access.Status, access.Message)
		require.Equal(t, code, access.Code)
		return
	}
	requireTodoControl(t, err, status, code)
}
