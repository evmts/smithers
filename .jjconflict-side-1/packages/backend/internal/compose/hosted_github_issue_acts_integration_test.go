package compose

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/githubfake"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/webhook"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
The hosted GitHub issue acts through the REAL composed router (#4030).

This is the hosted composition, not the install: `cfg.Auth.Mode` is
multitenant, `self_host_owners` and `install_settings` are empty, and the
routes under test mount only because the repo-scoped GitHub family is composed
there. The chain is the production one — RequireAuth, write:repository,
RequireRepoPermission(write), the loaded repository context — over real
PostgreSQL, with githubfake holding GitHub's own issues over real HTTP.

The whole path runs: the composed API admits, the SHARED issue-write worker
claims (the same operation list and handler compose/main.go starts), the
credential is reloaded and the actor re-authorized, exactly ONE external
request leaves, GitHub's object changes, and the receipt door answers
completed. It needs no bwrap: an issue act is HTTP and PostgreSQL.
*/

type hostedIssueComposition struct {
	t       *testing.T
	origin  string
	pool    *pgxpool.Pool
	queries *db.Queries
	fake    *githubfake.Server
	jobs    *jobs.Store
	service *services.MythicalService
	client  *http.Client
	writer  string // the writer's session cookie
	reader  string // the read-only collaborator's session cookie
}

func newHostedIssueComposition(t *testing.T) (*hostedIssueComposition, func(string) int64) {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	c := &hostedIssueComposition{t: t, pool: pool, queries: q, client: &http.Client{Timeout: 30 * time.Second}}

	person := func(login string, githubID int64) int64 {
		t.Helper()
		created, err := q.CreateUser(ctx, db.CreateUserParams{Username: login, LowerUsername: login, DisplayName: login})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO oauth_accounts(user_id, provider, provider_user_id, profile_data, access_token_encrypted)
			VALUES ($1,'github',$2,$3,$4)`, created.ID, fmt.Sprint(githubID), fmt.Sprintf(`{"login":%q}`, login), []byte(fmt.Sprintf("ghu_githubfake_user_%d", githubID)))
		require.NoError(t, err)
		return created.ID
	}
	writer := person("will", 7)
	reader := person("ana", 21)
	var repoID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id, name, lower_name, default_bookmark, mirror_destination)
		VALUES ($1,'flows','flows','main','will/flows') RETURNING id`, writer).Scan(&repoID))
	_, err := pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES ($1,$2,'read')`, repoID, reader)
	require.NoError(t, err)

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	app := services.GitHubAppCredentials{ID: 42, Slug: "smithers-hosted", OwnerLogin: "will", OwnerKind: "user", ClientID: "client",
		ClientSecret: "secret", WebhookSecret: "webhook", PEM: string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))}
	fake, err := githubfake.New(githubfake.Config{OAuthCode: "will-code", GitRoot: t.TempDir(), AppID: app.ID, Slug: app.Slug,
		OwnerLogin: app.OwnerLogin, OwnerKind: app.OwnerKind, ClientID: app.ClientID, ClientSecret: app.ClientSecret,
		WebhookSecret: app.WebhookSecret, PrivateKeyPEM: app.PEM, ConversionCode: "manifest-code",
		Installations: []githubfake.Installation{{ID: 9500, Repositories: []githubfake.Repository{{ID: 100, FullName: "will/flows"}}}}})
	require.NoError(t, err)
	t.Cleanup(fake.Close)
	c.fake = fake
	t.Setenv("SMITHERS_GITHUB_APP_API_BASE_URL", fake.URL)
	t.Setenv("SMITHERS_GITHUB_GIT_BASE_URL", fake.URL)
	fake.SetCollaborator(7, "will", "admin")
	fake.SetCollaborator(21, "ana", "read")

	codec, err := webhook.NewSecretCodec("hosted-compose-sealing-key")
	require.NoError(t, err)
	credentials := services.NewGitHubAppCredentialStore(pool, codec)
	require.NoError(t, credentials.Save(ctx, app))
	userRepos := services.NewGitHubUserReposService(q, hostedComposeOAuthToken{})
	connections := services.NewRepoConnectionService(pool, credentials)
	connections.SetGitHubRepoAccessVerifier(userRepos)
	_, err = connections.ConnectRepo(ctx, writer, "will", "flows", "MIT")
	require.NoError(t, err)
	require.NoError(t, connections.ReconcileGitHubAppInstallations(ctx))

	// The hosted service: no install authorization and no bound repository.
	service := services.NewMythicalService(pool, nil)
	service.SetOrchestration(services.NewMythicalGitHub(q, connections, userRepos, connections), nil, nil)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	service.SetInstallIssueJobs(store)
	c.service, c.jobs = service, store

	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	cfg.Auth.SessionCookieName = "session"
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	cfg.Server.PublicURL, cfg.Server.AllowedOrigins = origin, []string{origin}
	c.origin = origin
	server.Config.Handler = parallelInstallRouter(cfg, q, pool, nil, routerExtras{Mythical: &routes.MythicalHandler{Service: service}})
	server.Start()
	t.Cleanup(server.Close)

	session := func(user int64, login, cookie string) string {
		t.Helper()
		digest := sha256.Sum256([]byte(cookie))
		_, err := q.CreateAuthSession(ctx, db.CreateAuthSessionParams{UserID: user, Username: login,
			SessionKey: hex.EncodeToString(digest[:]), ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		return cookie
	}
	c.writer = session(writer, "will", "will-cookie")
	c.reader = session(reader, "ana", "ana-cookie")

	var installRows int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT (SELECT count(*) FROM self_host_owners) + (SELECT count(*) FROM install_settings)`).Scan(&installRows))
	require.Zero(t, installRows, "this is the hosted composition, not an install")
	return c, func(string) int64 { return repoID }
}

// hostedComposeOAuthToken stores each person's GitHub token verbatim, so the
// three identities in this composition stay three identities.
type hostedComposeOAuthToken struct{}

func (hostedComposeOAuthToken) DecryptOAuthAccessToken(ciphertext []byte) (string, error) {
	return string(ciphertext), nil
}

// request sends one API request as cookie's person, through the composed
// router, with the CSRF pair a browser session carries.
func (c *hostedIssueComposition) request(cookie, method, path, body string) (int, map[string]any) {
	c.t.Helper()
	req, err := http.NewRequest(method, c.origin+path, strings.NewReader(body))
	require.NoError(c.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", c.origin)
	req.Header.Set("Idempotency-Key", method+" "+path+" "+body)
	req.Header.Set("X-CSRF-Token", "csrf-fixture")
	req.AddCookie(&http.Cookie{Name: "__csrf", Value: "csrf-fixture"})
	req.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	response, err := c.client.Do(req)
	require.NoError(c.t, err)
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(response.Body)
	require.NoError(c.t, err)
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	return response.StatusCode, decoded
}

// work runs the SHARED issue-write worker — the operation list and handler
// compose/main.go registers — until the operation settles.
func (c *hostedIssueComposition) work(id string) string {
	c.t.Helper()
	worker, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	go func() {
		_ = c.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "composed-" + id, Capacity: 1, Lease: time.Minute,
			PollInterval: 10 * time.Millisecond, Operations: services.IssueWriteOperations()}, c.service.HandleInstallIssueWrite)
	}()
	var state string
	require.True(c.t, assertEventually(25*time.Second, func() bool {
		_ = c.pool.QueryRow(context.Background(), "SELECT state FROM product_job_requests WHERE id=$1", id).Scan(&state)
		return state == "completed" || state == "failed" || state == "uncertain"
	}), "operation %s must settle, last state %q", id, state)
	return state
}

func TestHostedGitHubIssueActsComposedMultitenantPostgres(t *testing.T) {
	c, repo := newHostedIssueComposition(t)
	repositoryID := repo("will/flows")
	number := c.fake.OpenIssue("will/flows", "will", "A composed act", "Body")

	// A read-only collaborator is refused by the ordinary chain, and nothing
	// is admitted: the refusal happens before any durable row exists.
	status, _ := c.request(c.reader, http.MethodPost, fmt.Sprintf("/api/repos/will/flows/github/issues/%d/close", number), "")
	require.Equal(t, http.StatusForbidden, status)

	// The writer's close is admitted and acknowledged, and GitHub is untouched.
	status, admitted := c.request(c.writer, http.MethodPost, fmt.Sprintf("/api/repos/will/flows/github/issues/%d/close", number), "")
	require.Equal(t, http.StatusAccepted, status, "%v", admitted)
	operation, ok := admitted["operationId"].(string)
	require.True(t, ok, "%v", admitted)
	open, found := c.fake.Issue("will/flows", number)
	require.True(t, found)
	require.Equal(t, "open", open.State, "the admission alone writes nothing to GitHub")

	// The shared worker does the one write; GitHub's own object changes.
	require.Equal(t, "completed", c.work(operation))
	closed, found := c.fake.Issue("will/flows", number)
	require.True(t, found)
	require.Equal(t, "closed", closed.State)
	require.Equal(t, "completed", closed.StateReason)

	// The receipt door answers the outcome for the actor that admitted it.
	status, receipt := c.request(c.writer, http.MethodGet, "/api/repos/will/flows/github/issues/requests/"+operation, "")
	require.Equal(t, http.StatusOK, status, "%v", receipt)
	require.Equal(t, "completed", receipt["state"])

	// Another person cannot read this credential's receipt.
	status, _ = c.request(c.reader, http.MethodGet, "/api/repos/will/flows/github/issues/requests/"+operation, "")
	require.Equal(t, http.StatusNotFound, status)

	// A comment and its edit, through the same composed doors.
	status, commented := c.request(c.writer, http.MethodPost, fmt.Sprintf("/api/repos/will/flows/github/issues/%d/comments", number), `{"body":"Composed"}`)
	require.Equal(t, http.StatusAccepted, status, "%v", commented)
	require.Equal(t, "completed", c.work(commented["operationId"].(string)))
	withComment, found := c.fake.Issue("will/flows", number)
	require.True(t, found)
	require.Len(t, withComment.Comments, 1)
	require.Contains(t, withComment.Comments[0].Body, "Composed")
	require.Contains(t, withComment.Comments[0].Body, "Requested by @will")

	status, edited := c.request(c.writer, http.MethodPatch,
		fmt.Sprintf("/api/repos/will/flows/github/issues/comments/%d", withComment.Comments[0].ID), `{"body":"Composed again"}`)
	require.Equal(t, http.StatusAccepted, status, "%v", edited)
	require.Equal(t, "completed", c.work(edited["operationId"].(string)))
	reread, found := c.fake.Issue("will/flows", number)
	require.True(t, found)
	require.Len(t, reread.Comments, 1, "an edit replaces the comment; it never posts another")
	require.Contains(t, reread.Comments[0].Body, "Composed again")

	// A reopen, then a create GitHub numbers itself.
	status, reopened := c.request(c.writer, http.MethodPost, fmt.Sprintf("/api/repos/will/flows/github/issues/%d/reopen", number), "")
	require.Equal(t, http.StatusAccepted, status, "%v", reopened)
	require.Equal(t, "completed", c.work(reopened["operationId"].(string)))
	again, found := c.fake.Issue("will/flows", number)
	require.True(t, found)
	require.Equal(t, "open", again.State)

	status, created := c.request(c.writer, http.MethodPost, "/api/repos/will/flows/github/issues", `{"title":"Composed issue","body":"Please look."}`)
	require.Equal(t, http.StatusAccepted, status, "%v", created)
	require.Equal(t, "completed", c.work(created["operationId"].(string)))
	status, createdReceipt := c.request(c.writer, http.MethodGet, "/api/repos/will/flows/github/issues/requests/"+created["operationId"].(string), "")
	require.Equal(t, http.StatusOK, status)
	opened, ok := createdReceipt["number"].(float64)
	require.True(t, ok, "the create's receipt names GitHub's own number: %v", createdReceipt)
	fresh, found := c.fake.Issue("will/flows", int64(opened))
	require.True(t, found)
	require.Equal(t, "Composed issue", fresh.Title)

	// Smithers Cloud's own tracker beside it still means itself: no act
	// invented a Cloud row, and none of this started a workspace or a box.
	var cloudIssues int64
	require.NoError(t, c.pool.QueryRow(context.Background(), "SELECT count(*) FROM issues WHERE repository_id=$1", repositoryID).Scan(&cloudIssues))
	require.Zero(t, cloudIssues, "the GitHub acts wrote GitHub, never Smithers Cloud's tracker")
	for _, table := range []string{"workspaces", "workspace_sessions"} {
		var rows int64
		require.NoError(t, c.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&rows))
		require.Zero(t, rows, "%s must be untouched by an issue write", table)
	}
}
