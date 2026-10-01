package compose

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

type accountHTTPFixture struct {
	pool    *pgxpool.Pool
	q       *db.Queries
	store   *jobs.Store
	service *services.AccountOperationService
	server  *httptest.Server
	user    db.User
	token   string
	tokenID int64
}

func newAccountHTTPFixture(t *testing.T) *accountHTTPFixture {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	user, err := q.CreateUser(t.Context(), db.CreateUserParams{Username: "identity-owner", LowerUsername: "identity-owner", DisplayName: "identity-owner"})
	require.NoError(t, err)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	service, err := services.NewAccountOperationService(store, q)
	require.NoError(t, err)
	router := chi.NewRouter()
	cfg := &config.Config{Auth: config.AuthConfig{Mode: "multitenant", SessionSecret: "owned-session-secret"}, Server: config.ServerConfig{PublicURL: "http://127.0.0.1"}}
	mountBrowserFlow(router, cfg, q, &browserFlowAPI{accountOperations: service}, nil)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	f := &accountHTTPFixture{pool: pool, q: q, store: store, service: service, server: server, user: user}
	f.token, f.tokenID = f.mint(t, user.ID, "read:user", false)
	return f
}

func (f *accountHTTPFixture) mint(t *testing.T, userID int64, scopes string, system bool) (string, int64) {
	t.Helper()
	token := "smithers_" + strings.ReplaceAll(uuid.NewString(), "-", "") + "01234567"
	hash := sha256.Sum256([]byte(token))
	digest := hex.EncodeToString(hash[:])
	row, err := f.q.CreateAccessToken(t.Context(), db.CreateAccessTokenParams{UserID: userID, Name: uuid.NewString(), TokenHash: digest, TokenLastEight: digest[len(digest)-8:], Scopes: scopes, ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
	require.NoError(t, err)
	if system {
		_, err = f.pool.Exec(t.Context(), "UPDATE access_tokens SET system_issued=true WHERE id=$1", row.ID)
		require.NoError(t, err)
	}
	return token, row.ID
}

func (f *accountHTTPFixture) rpc(t *testing.T, token, procedure string, payload any) (int, []byte) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"procedure": procedure, "payload": payload})
	require.NoError(t, err)
	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, f.server.URL+"/api/workflow/rpc", bytes.NewReader(body))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "token "+token)
	}
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	return response.StatusCode, data
}

func (f *accountHTTPFixture) dispatch(t *testing.T, id string) jobs.RequestReceipt {
	t.Helper()
	status, body := f.rpc(t, f.token, "Operation.Dispatch", map[string]any{"name": "account.show", "requestId": id, "input": map[string]any{}})
	require.Equal(t, 200, status, string(body))
	var receipt jobs.RequestReceipt
	require.NoError(t, json.Unmarshal(body, &receipt))
	require.Equal(t, "requested", receipt.Kind)
	return receipt
}

func (f *accountHTTPFixture) worker(t *testing.T, handler jobs.Handler) func() {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() {
		done <- f.store.RunWorker(ctx, jobs.WorkerConfig{WorkerID: uuid.NewString(), Capacity: 1, Lease: time.Second, HeartbeatInterval: 10 * time.Millisecond, PollInterval: 5 * time.Millisecond, RetryDelay: 5 * time.Millisecond, RecoveryInterval: 10 * time.Millisecond, Operations: []string{f.service.OperationName()}}, handler)
	}()
	stopped := false
	stop := func() {
		if stopped {
			return
		}
		stopped = true
		cancel()
		select {
		case err := <-done:
			require.NoError(t, err)
		case <-time.After(5 * time.Second):
			t.Fatal("owned worker did not stop")
		}
	}
	t.Cleanup(stop)
	return stop
}

func accountSelection(id string) map[string]any {
	return map[string]any{"name": "account.show", "requestId": id}
}

func (f *accountHTTPFixture) outcome(t *testing.T, id string, state jobs.State) services.AccountOperationOutcome {
	t.Helper()
	var outcome services.AccountOperationOutcome
	require.Eventually(t, func() bool {
		status, body := f.rpc(t, f.token, "Operation.Read", accountSelection(id))
		if status != 200 {
			return false
		}
		require.NoError(t, json.Unmarshal(body, &outcome))
		return outcome.State == state
	}, 5*time.Second, 10*time.Millisecond)
	return outcome
}

func accountCLI(t *testing.T, f *accountHTTPFixture, home string, args ...string) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	cwd, err := os.Getwd()
	require.NoError(t, err)
	root := filepath.Clean(filepath.Join(cwd, "../../../.."))
	command := exec.CommandContext(ctx, "node", append([]string{"--experimental-ffi", "--disable-warning=ExperimentalWarning", filepath.Join(root, "packages/smithers/bin/smithers.mjs")}, append(args, "--json")...)...)
	command.Dir = root
	command.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + home, "SMITHERS_DISABLE_SYSTEM_KEYRING=1", "SMITHERS_API_ORIGIN=" + f.server.URL, "SMITHERS_TOKEN=" + f.token, "XDG_DATA_HOME=" + filepath.Join(home, "data"), "XDG_CONFIG_HOME=" + filepath.Join(home, "config")}
	output, err := command.CombinedOutput()
	require.NoError(t, err, string(output))
	return output
}

func TestAccountOperationRealHTTPCLIAdmissionReloadAndCompletion(t *testing.T) {
	f := newAccountHTTPFixture(t)
	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	stop := f.worker(t, func(ctx context.Context, lease *jobs.Lease) error {
		entered <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
		}
		return f.service.Handle(ctx, lease)
	})
	home := t.TempDir()
	body := accountCLI(t, f, home, "account", "show")
	var receipt jobs.RequestReceipt
	require.NoError(t, json.Unmarshal(body, &receipt))
	require.Equal(t, jobs.StateAccepted, receipt.State)
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("owned worker never claimed the accepted request")
	}
	// The public CLI returned while the real admitted worker remains unresolved.
	joined := f.dispatch(t, receipt.RequestID)
	require.Equal(t, receipt.OperationID, joined.OperationID)
	pending := accountCLI(t, f, home, "account", "show", "--request", receipt.RequestID)
	require.NotContains(t, string(pending), "identity-owner")
	require.Contains(t, string(pending), "dispatching")
	secondToken, _ := f.mint(t, f.user.ID, "read:user", false)
	status, data := f.rpc(t, secondToken, "Operation.Dispatch", map[string]any{"name": "account.show", "requestId": receipt.RequestID, "input": map[string]any{}})
	require.Equal(t, 409, status, string(data))
	status, data = f.rpc(t, secondToken, "Operation.Read", accountSelection(receipt.RequestID))
	require.Equal(t, 403, status, string(data))
	status, data = f.rpc(t, secondToken, "Operation.History", map[string]any{})
	require.Equal(t, 200, status, string(data))
	require.NotContains(t, string(data), receipt.RequestID)
	outsider, err := f.q.CreateUser(t.Context(), db.CreateUserParams{Username: "outsider", LowerUsername: "outsider", DisplayName: "outsider"})
	require.NoError(t, err)
	outsiderToken, _ := f.mint(t, outsider.ID, "read:user", false)
	status, data = f.rpc(t, outsiderToken, "Operation.Read", accountSelection(receipt.RequestID))
	require.Equal(t, 404, status, string(data))
	require.NotContains(t, string(data), "identity-owner")
	close(release)
	outcome := f.outcome(t, receipt.RequestID, jobs.StateCompleted)
	require.JSONEq(t, `{"login":"identity-owner"}`, string(outcome.Result))
	require.Equal(t, "api", outcome.Actor)
	terminal := accountCLI(t, f, home, "account", "show", "--request", receipt.RequestID)
	require.Contains(t, string(terminal), `"completed"`)
	require.Contains(t, string(terminal), `"identity-owner"`)
	history := accountCLI(t, f, home, "account", "show", "--history")
	require.Contains(t, string(history), receipt.RequestID)
	require.Contains(t, string(history), `"completed"`)
	require.NoError(t, filepath.WalkDir(home, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.Contains(path, string(filepath.Separator)+"requests"+string(filepath.Separator)) {
			return nil
		}
		retained, err := os.ReadFile(path)
		require.NoError(t, err)
		require.NotContains(t, string(retained), f.token)
		require.NotContains(t, string(retained), "identity-owner")
		require.NotContains(t, string(retained), "email")
		return nil
	}))
	stop()
	// A reconstructed service reads the same terminal receipt without launching again.
	reloaded, err := services.NewAccountOperationService(f.store, db.New(f.pool))
	require.NoError(t, err)
	require.Equal(t, "account.show", reloaded.OperationName())
}

func TestAccountOperationStrictInputScopesAndActors(t *testing.T) {
	f := newAccountHTTPFixture(t)
	for _, input := range []any{map[string]any{"unexpected": 1}, map[string]any{"": nil}, map[string]any{"__proto__": map[string]any{}}, []any{}, nil, true, "", 0} {
		status, body := f.rpc(t, f.token, "Operation.Dispatch", map[string]any{"name": "account.show", "requestId": uuid.NewString(), "input": input})
		require.Equal(t, 400, status, string(body))
	}
	for _, payload := range []any{map[string]any{"name": "account.show", "requestId": "same", "input": map[string]any{}, "actor": "user"}, map[string]any{"name": "account.show", "requestId": "../escape", "input": map[string]any{}}, map[string]any{"name": "account.other", "requestId": "same", "input": map[string]any{}}} {
		status, body := f.rpc(t, f.token, "Operation.Dispatch", payload)
		require.Equal(t, 400, status, string(body))
	}
	status, body := f.rpc(t, "", "Operation.Discover", map[string]any{})
	require.Equal(t, 401, status, string(body))
	status, body = f.rpc(t, f.token, "Operation.Discover", map[string]any{})
	require.Equal(t, 200, status, string(body))
	require.Contains(t, string(body), `"account.show"`)
	require.NotContains(t, string(body), "identity-owner")
	noIdentity, _ := f.mint(t, f.user.ID, "read:repository", false)
	status, body = f.rpc(t, noIdentity, "Operation.Discover", map[string]any{})
	require.Equal(t, 403, status, string(body))
	// An identity-scoped credential cannot cross into the previous repository workflow methods.
	for _, procedure := range []string{"List", "Run", "Cancel", "Registration.Reviews", "unknown"} {
		status, body = f.rpc(t, f.token, procedure, map[string]any{})
		require.Equal(t, 403, status, string(body))
	}
	agent, _ := f.mint(t, f.user.ID, "read:user", true)
	status, body = f.rpc(t, agent, "Operation.Dispatch", map[string]any{"name": "account.show", "requestId": "agent-request", "input": map[string]any{}})
	require.Equal(t, 200, status, string(body))
	stop := f.worker(t, f.service.Handle)
	var outcome services.AccountOperationOutcome
	require.Eventually(t, func() bool {
		status, body = f.rpc(t, agent, "Operation.Read", accountSelection("agent-request"))
		if status != 200 {
			return false
		}
		_ = json.Unmarshal(body, &outcome)
		return outcome.State == jobs.StateCompleted
	}, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, "agent", outcome.Actor)
	stop()
}

func TestAccountOperationRevocationBeforeWorkerAndBeforeRead(t *testing.T) {
	f := newAccountHTTPFixture(t)
	receipt := f.dispatch(t, "revoked-before-worker")
	_, err := f.pool.Exec(t.Context(), "DELETE FROM access_tokens WHERE id=$1", f.tokenID)
	require.NoError(t, err)
	stop := f.worker(t, f.service.Handle)
	require.Eventually(t, func() bool {
		operation, err := f.store.Get(t.Context(), jobs.Scope{TenantID: fmtUser(f.user.ID), PrincipalID: fmtUser(f.user.ID)}, receipt.OperationID)
		return err == nil && operation.State == jobs.StateFailed
	}, 5*time.Second, 10*time.Millisecond)
	status, body := f.rpc(t, f.token, "Operation.Read", accountSelection(receipt.RequestID))
	require.Equal(t, 401, status, string(body))
	require.NotContains(t, string(body), "identity-owner")
	stop()
}

func fmtUser(id int64) string { return "user:" + fmt.Sprintf("%d", id) }

func TestAccountOperationCancellationBeforeDuringAndAfterRecovery(t *testing.T) {
	f := newAccountHTTPFixture(t)
	ready := f.dispatch(t, "cancel-ready")
	status, body := f.rpc(t, f.token, "Operation.Cancel", accountSelection(ready.RequestID))
	require.Equal(t, 200, status, string(body))
	require.Contains(t, string(body), `"cancelled"`)
	running := f.dispatch(t, "cancel-running")
	entered := make(chan struct{}, 1)
	stop := f.worker(t, func(ctx context.Context, lease *jobs.Lease) error {
		entered <- struct{}{}
		<-ctx.Done()
		return f.service.Handle(ctx, lease)
	})
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("worker not entered")
	}
	status, body = f.rpc(t, f.token, "Operation.Cancel", accountSelection(running.RequestID))
	require.Equal(t, 200, status, string(body))
	f.outcome(t, running.RequestID, jobs.StateCancelled)
	stop()
	recovered := f.dispatch(t, "cancel-recovered")
	claim, err := f.store.ClaimForOperations(t.Context(), "crashed-owned-worker", 80*time.Millisecond, []string{"account.show"})
	require.NoError(t, err)
	require.Equal(t, recovered.OperationID, claim.OperationID)
	status, body = f.rpc(t, f.token, "Operation.Cancel", accountSelection(recovered.RequestID))
	require.Equal(t, 200, status, string(body))
	time.Sleep(100 * time.Millisecond)
	_, err = f.store.RecoverExpired(t.Context(), 10)
	require.NoError(t, err)
	stop = f.worker(t, f.service.Handle)
	f.outcome(t, recovered.RequestID, jobs.StateCancelled)
	stop()
}

func TestAccountOperationChangedScopesRefuseReadAndExecution(t *testing.T) {
	f := newAccountHTTPFixture(t)
	receipt := f.dispatch(t, "scope-changed")
	_, err := f.pool.Exec(t.Context(), "UPDATE access_tokens SET scopes='read:user,read:repository' WHERE id=$1", f.tokenID)
	require.NoError(t, err)
	status, body := f.rpc(t, f.token, "Operation.Read", accountSelection(receipt.RequestID))
	require.Equal(t, 403, status, string(body))
	stop := f.worker(t, f.service.Handle)
	require.Eventually(t, func() bool {
		operation, err := f.store.Get(t.Context(), jobs.Scope{TenantID: fmtUser(f.user.ID), PrincipalID: fmtUser(f.user.ID)}, receipt.OperationID)
		return err == nil && operation.State == jobs.StateFailed
	}, 5*time.Second, 10*time.Millisecond)
	stop()
}

func TestAccountOperationCookieIdentityCSRFAndRevocation(t *testing.T) {
	f := newAccountHTTPFixture(t)
	key := uuid.NewString()
	digest := sha256.Sum256([]byte(key))
	stored := hex.EncodeToString(digest[:])
	_, err := f.q.CreateAuthSession(t.Context(), db.CreateAuthSessionParams{SessionKey: stored, UserID: f.user.ID, Username: f.user.Username, ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	cookieRPC := func(procedure string, payload any, csrf bool) (int, []byte) {
		raw, err := json.Marshal(map[string]any{"procedure": procedure, "payload": payload})
		require.NoError(t, err)
		request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, f.server.URL+"/api/workflow/rpc", bytes.NewReader(raw))
		require.NoError(t, err)
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(&http.Cookie{Name: "smithers_session", Value: key})
		if csrf {
			request.AddCookie(&http.Cookie{Name: "__csrf", Value: "owned-csrf"})
			request.Header.Set("X-CSRF-Token", "owned-csrf")
		}
		response, err := http.DefaultClient.Do(request)
		require.NoError(t, err)
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		return response.StatusCode, body
	}
	payload := map[string]any{"name": "account.show", "requestId": "cookie-read", "input": map[string]any{}}
	status, body := cookieRPC("Operation.Dispatch", payload, false)
	require.Equal(t, 403, status, string(body))
	status, body = cookieRPC("Operation.Dispatch", payload, true)
	require.Equal(t, 200, status, string(body))
	stop := f.worker(t, f.service.Handle)
	var outcome services.AccountOperationOutcome
	require.Eventually(t, func() bool {
		status, body = cookieRPC("Operation.Read", accountSelection("cookie-read"), true)
		if status != 200 {
			return false
		}
		_ = json.Unmarshal(body, &outcome)
		return outcome.State == jobs.StateCompleted
	}, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, "user", outcome.Actor)
	require.JSONEq(t, `{"login":"identity-owner"}`, string(outcome.Result))
	_, err = f.pool.Exec(t.Context(), "DELETE FROM auth_sessions WHERE session_key=$1", stored)
	require.NoError(t, err)
	status, body = cookieRPC("Operation.Read", accountSelection("cookie-read"), true)
	require.Equal(t, 401, status, string(body))
	require.NotContains(t, string(body), "identity-owner")
	stop()
}

func TestAccountOperationCookieOwnerChangeInvalidatesQueuedAuthority(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprintf("legacy=%v", legacy), func(t *testing.T) {
			f := newAccountHTTPFixture(t)
			key := uuid.NewString()
			digest := sha256.Sum256([]byte(key))
			stored := hex.EncodeToString(digest[:])
			if legacy {
				stored = key
			}
			_, err := f.q.CreateAuthSession(t.Context(), db.CreateAuthSessionParams{SessionKey: stored, UserID: f.user.ID, Username: f.user.Username, ExpiresAt: time.Now().Add(time.Hour)})
			require.NoError(t, err)
			raw := `{"procedure":"Operation.Dispatch","payload":{"name":"account.show","requestId":"owner-changed","input":{}}}`
			request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, f.server.URL+"/api/workflow/rpc", strings.NewReader(raw))
			require.NoError(t, err)
			request.Header.Set("Content-Type", "application/json")
			request.AddCookie(&http.Cookie{Name: "smithers_session", Value: key})
			request.AddCookie(&http.Cookie{Name: "__csrf", Value: "owned-csrf"})
			request.Header.Set("X-CSRF-Token", "owned-csrf")
			response, err := http.DefaultClient.Do(request)
			require.NoError(t, err)
			body, err := io.ReadAll(response.Body)
			require.NoError(t, err)
			require.NoError(t, response.Body.Close())
			require.Equal(t, 200, response.StatusCode, string(body))
			var receipt jobs.RequestReceipt
			require.NoError(t, json.Unmarshal(body, &receipt))
			next, err := f.q.CreateUser(t.Context(), db.CreateUserParams{Username: "changed-owner", LowerUsername: "changed-owner", DisplayName: "changed-owner"})
			require.NoError(t, err)
			_, err = f.pool.Exec(t.Context(), "UPDATE auth_sessions SET user_id=$1 WHERE session_key=$2", next.ID, stored)
			require.NoError(t, err)
			stop := f.worker(t, f.service.Handle)
			require.Eventually(t, func() bool {
				operation, err := f.store.Get(t.Context(), jobs.Scope{TenantID: fmtUser(f.user.ID), PrincipalID: fmtUser(f.user.ID)}, receipt.OperationID)
				return err == nil && operation.State == jobs.StateFailed
			}, 5*time.Second, 10*time.Millisecond)
			stop()
			var authorization string
			err = f.pool.QueryRow(t.Context(), "SELECT authorization_context::text FROM product_job_requests WHERE id=$1", receipt.OperationID).Scan(&authorization)
			require.NoError(t, err)
			require.NotContains(t, authorization, key)
			require.NotContains(t, authorization, "identity-owner")
			require.NotContains(t, authorization, "changed-owner")
		})
	}
}
