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

// recordingIssueTransitions admits the declared transition and records
// exactly what the door asked for, including the idempotency key it must
// forward unchanged and the transition id it must take from the path.
type recordingIssueTransitions struct {
	recordingIssues
	admitted []string
	fail     error
}

func (s *recordingIssueTransitions) RequestInstallIssueTransition(_ context.Context, repository, number int64, transition, key string) (jobs.RequestReceipt, error) {
	if s.fail != nil {
		return jobs.RequestReceipt{}, s.fail
	}
	s.admitted = append(s.admitted, fmt.Sprintf("transition %d %d %s %s", repository, number, transition, key))
	return jobs.RequestReceipt{Kind: "requested", OperationID: "op-t1"}, nil
}

// The install transition door's exact wire (#4067), through the production
// handler on real PostgreSQL: a roster member asks, somebody off the roster
// and a suspended member do not, the subject is the INSTALL's own repository
// rather than one a request names, the transition id and the issue number
// come from the path, the request carries no body at all, and an admitted act
// answers 202 with its durable receipt rather than waiting on GitHub.
func TestInstallIssueTransitionRoute(t *testing.T) {
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
	service := &recordingIssueTransitions{}
	handler := &InstallIssuesHandler{Queries: q, Service: service}
	router := chi.NewRouter()
	router.Post("/api/issues/{number}/transitions/{id}", handler.Transition)
	var last *httptest.ResponseRecorder
	call := func(info *middleware.AuthInfo, path, body, key string) (int, string) {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)).WithContext(middleware.ContextWithAuthInfo(ctx, info))
		req.Header.Set("Content-Type", "application/json")
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		last = httptest.NewRecorder()
		router.ServeHTTP(last, req)
		return last.Code, last.Body.String()
	}
	session := func(user int64) *middleware.AuthInfo {
		return &middleware.AuthInfo{User: &db.User{ID: user}, SessionHash: fmt.Sprintf("session-%d", user)}
	}

	// The subject is the install's repository and the path's own two
	// segments, and the key is forwarded byte for byte.
	status, body := call(session(alice), "/api/issues/6/transitions/accept", "", "k1")
	require.Equal(t, http.StatusAccepted, status, body)
	var receipt map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &receipt))
	require.Equal(t, "requested", receipt["kind"], "the acknowledgment precedes the network write")
	require.Equal(t, "op-t1", receipt["operationId"], "the durable receipt, not a GitHub result")
	require.Equal(t, fmt.Sprintf("transition %d 6 accept k1", repo), service.admitted[0])
	// A receipt is never cached: a client that re-reads it must see the
	// durable operation's real state.
	require.Equal(t, "no-store", last.Header().Get("Cache-Control"))
	require.Equal(t, "application/json", last.Header().Get("Content-Type"))

	// A declared id the person types is carried through unchanged, including
	// the hyphenated shape a repository's own declaration uses.
	status, body = call(session(alice), "/api/issues/42/transitions/e2e-accept", "", "k2")
	require.Equal(t, http.StatusAccepted, status, body)
	require.Equal(t, fmt.Sprintf("transition %d 42 e2e-accept k2", repo), service.admitted[1])
	require.Len(t, service.admitted, 2)

	// Refused before any admission: off the roster, suspended, and a token
	// standing in for the person.
	service.admitted = nil
	token := &middleware.AuthInfo{User: &db.User{ID: alice}, IsTokenAuth: true}
	for _, refused := range []*middleware.AuthInfo{session(carol), session(dave), token} {
		status, body := call(refused, "/api/issues/6/transitions/accept", "", "k3")
		require.Equal(t, http.StatusForbidden, status, body)
		var envelope map[string]any
		require.NoError(t, json.Unmarshal([]byte(body), &envelope))
		require.Equal(t, "permission", envelope["class"])
	}
	require.Empty(t, service.admitted)

	// An unusable issue number is a user error, and nothing is admitted.
	for _, path := range []string{"/api/issues/0/transitions/accept"} {
		status, body := call(session(owner), path, "", "k4")
		require.Equal(t, http.StatusBadRequest, status, body)
		require.Contains(t, body, "invalid_issue_state")
	}
	require.Empty(t, service.admitted)

	// The door carries NO body: a request that smuggles one is admitted
	// exactly as the bodyless one is, because nothing is read from it — the
	// declaration decides the labels, so no field can name a label, a
	// repository or an actor.
	status, body = call(session(alice), "/api/issues/6/transitions/accept", `{"to":"shipped","actor":"anyone","repository":99}`, "k5")
	require.Equal(t, http.StatusAccepted, status, body)
	require.Equal(t, fmt.Sprintf("transition %d 6 accept k5", repo), service.admitted[0],
		"the admitted act is the path's, never the body's")

	// The service's own refusals keep their envelope; the door adds no prose
	// and names no route, credential or provider sentence.
	service.admitted = nil
	for _, refusal := range []*services.TodoControlError{
		{Status: http.StatusNotFound, Code: "issue_transition_undeclared", Class: "user", Message: `This repository declares no issue transition "promote"`},
		{Status: http.StatusUnprocessableEntity, Code: "issue_transition_policy_unreadable", Class: "user", Message: "This repository's issue transitions could not be read"},
		{Status: http.StatusServiceUnavailable, Code: "github_unavailable", Class: "infra", Message: "GitHub issue writes are unavailable"},
	} {
		service.fail = refusal
		status, body := call(session(alice), "/api/issues/6/transitions/promote", "", "k6")
		require.Equal(t, refusal.Status, status, body)
		var envelope map[string]any
		require.NoError(t, json.Unmarshal([]byte(body), &envelope))
		require.Equal(t, refusal.Code, envelope["code"])
		require.Equal(t, refusal.Class, envelope["class"])
		require.Equal(t, refusal.Message, envelope["message"])
	}
	require.Empty(t, service.admitted)

	// A composition with no transition writer serves no transition: the door
	// refuses instead of pretending the act was taken.
	service.fail = nil
	bare := &InstallIssuesHandler{Queries: q, Service: &service.recordingIssues}
	bareRouter := chi.NewRouter()
	bareRouter.Post("/api/issues/{number}/transitions/{id}", bare.Transition)
	req := httptest.NewRequest(http.MethodPost, "/api/issues/6/transitions/accept", nil).
		WithContext(middleware.ContextWithAuthInfo(ctx, session(alice)))
	res := httptest.NewRecorder()
	bareRouter.ServeHTTP(res, req)
	require.Equal(t, http.StatusServiceUnavailable, res.Code, res.Body.String())

	// Without the install's repository binding there is no subject, so
	// nothing is admitted — the same answer the close door beside it gives.
	_, err = pool.Exec(ctx, `DELETE FROM install_settings WHERE key='github.repository'`)
	require.NoError(t, err)
	status, body = call(session(owner), "/api/issues/6/transitions/accept", "", "k7")
	require.Equal(t, http.StatusServiceUnavailable, status, body)
	require.Empty(t, service.admitted)
}
