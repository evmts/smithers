package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// recordingIssueActs admits the issue acts and records what it was asked,
// including the idempotency key the door must forward unchanged.
type recordingIssueActs struct {
	recordingIssues
	admitted []string
	fail     error
}

func (s *recordingIssueActs) RequestInstallIssueClose(_ context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return s.admit(fmt.Sprintf("close %d %d %s", repository, number, key))
}

func (s *recordingIssueActs) RequestInstallIssueReopen(_ context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return s.admit(fmt.Sprintf("reopen %d %d %s", repository, number, key))
}

func (s *recordingIssueActs) RequestInstallIssueCommentEdit(_ context.Context, repository, comment int64, body, key string) (jobs.RequestReceipt, error) {
	return s.admit(fmt.Sprintf("edit %d comment:%d %q %s", repository, comment, body, key))
}

func (s *recordingIssueActs) admit(call string) (jobs.RequestReceipt, error) {
	if s.fail != nil {
		return jobs.RequestReceipt{}, s.fail
	}
	s.admitted = append(s.admitted, call)
	return jobs.RequestReceipt{Kind: "requested", OperationID: "op-1"}, nil
}

// The close, reopen and comment-edit doors through the production handlers on
// real PostgreSQL: a roster member acts, a person off the roster and a
// suspended member do not, the install's own repository is the subject, the
// act each door admits is fixed by the door (never by a body), and an
// admitted act answers 202 with its durable receipt rather than waiting on
// GitHub.
func TestInstallIssueActRoutes(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	person := func(login string) int64 {
		var id int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username,display_name) VALUES ($1,$1,$1) RETURNING id`, login).Scan(&id))
		return id
	}
	owner, alice, carol, dave := person("maya"), person("alice"), person("carol"), person("dave")
	var repo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'app','app') RETURNING id`, owner).Scan(&repo))
	_, err := pool.Exec(ctx, `INSERT INTO self_host_owners(singleton,user_id) VALUES (true,$1)`, owner)
	require.NoError(t, err)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: []byte(fmt.Sprintf(`{"owner_login":"maya","repository_name":"app","repository_id":%d}`, repo))}))
	for _, row := range []struct {
		user      int64
		suspended bool
	}{{alice, false}, {dave, true}} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission,suspended_at) VALUES ($1,$2,'write',CASE WHEN $3::boolean THEN now() END)`, repo, row.user, row.suspended)
		require.NoError(t, err)
	}
	service := &recordingIssueActs{}
	handler := &InstallIssuesHandler{Queries: q, Service: service}
	router := chi.NewRouter()
	router.Post("/api/issues/{number}/close", handler.Close)
	router.Post("/api/issues/{number}/reopen", handler.Reopen)
	router.Patch("/api/issues/comments/{id}", handler.EditComment)
	call := func(info *middleware.AuthInfo, method, path, body, key string) (int, string) {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(middleware.ContextWithAuthInfo(ctx, info))
		req.Header.Set("Content-Type", "application/json")
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		return res.Code, res.Body.String()
	}
	session := func(user int64) *middleware.AuthInfo {
		return &middleware.AuthInfo{User: &db.User{ID: user}, SessionHash: fmt.Sprintf("session-%d", user)}
	}

	for _, act := range []struct{ method, path, body, want string }{
		{http.MethodPost, "/api/issues/6/close", "", fmt.Sprintf("close %d 6 k1", repo)},
		{http.MethodPost, "/api/issues/6/reopen", "", fmt.Sprintf("reopen %d 6 k1", repo)},
		{http.MethodPatch, "/api/issues/comments/9", `{"body":"Edited"}`, fmt.Sprintf(`edit %d comment:9 "Edited" k1`, repo)},
	} {
		status, body := call(session(alice), act.method, act.path, act.body, "k1")
		require.Equal(t, http.StatusAccepted, status, body)
		var receipt map[string]any
		require.NoError(t, json.Unmarshal([]byte(body), &receipt))
		require.Equal(t, "requested", receipt["kind"])
		require.Equal(t, "op-1", receipt["operationId"], "the durable receipt, not a GitHub result")
		require.Equal(t, act.want, service.admitted[len(service.admitted)-1])
	}
	require.Len(t, service.admitted, 3)

	// Refused before any admission: off the roster, suspended, and a token.
	service.admitted = nil
	token := &middleware.AuthInfo{User: &db.User{ID: alice}, IsTokenAuth: true}
	for _, refused := range []*middleware.AuthInfo{session(carol), session(dave), token} {
		for _, act := range [][3]string{
			{http.MethodPost, "/api/issues/6/close", ""},
			{http.MethodPost, "/api/issues/6/reopen", ""},
			{http.MethodPatch, "/api/issues/comments/9", `{"body":"Edited"}`},
		} {
			status, body := call(refused, act[0], act[1], act[2], "k2")
			require.Equal(t, http.StatusForbidden, status, body)
			var envelope map[string]any
			require.NoError(t, json.Unmarshal([]byte(body), &envelope))
			require.Equal(t, "permission", envelope["class"])
		}
	}
	require.Empty(t, service.admitted)

	// An unusable subject is a user error, and nothing is admitted.
	for _, act := range [][4]string{
		{http.MethodPost, "/api/issues/0/close", "", "invalid_issue_state"},
		{http.MethodPost, "/api/issues/0/reopen", "", "invalid_issue_state"},
		{http.MethodPatch, "/api/issues/comments/0", `{"body":"Edited"}`, "invalid_issue_comment"},
		// The edit door carries a body and nothing else: a smuggled state
		// field is refused, so no act can arrive through the wrong door.
		{http.MethodPatch, "/api/issues/comments/9", `{"body":"Edited","state":"closed"}`, "unknown field"},
	} {
		status, body := call(session(owner), act[0], act[1], act[2], "k3")
		require.Equal(t, http.StatusBadRequest, status, body)
		require.Contains(t, body, act[3])
	}
	require.Empty(t, service.admitted)

	// The service's own refusal keeps its envelope; the door adds no prose.
	service.fail = &services.TodoControlError{Status: http.StatusServiceUnavailable, Code: "github_unavailable", Class: "infra", Message: "Could not reach GitHub"}
	status, body := call(session(owner), http.MethodPost, "/api/issues/6/close", "", "k4")
	require.Equal(t, http.StatusServiceUnavailable, status)
	require.JSONEq(t, `{"code":"github_unavailable","class":"infra","message":"Could not reach GitHub"}`, body)

	// Without the install's repository binding nothing is admitted.
	service.fail = nil
	_, err = pool.Exec(ctx, `DELETE FROM install_settings WHERE key='github.repository'`)
	require.NoError(t, err)
	status, _ = call(session(owner), http.MethodPost, "/api/issues/6/close", "", "k5")
	require.Equal(t, http.StatusServiceUnavailable, status)
	require.Empty(t, service.admitted)
}
