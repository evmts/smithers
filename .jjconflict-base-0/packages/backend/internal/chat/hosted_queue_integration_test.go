package chat

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
)

func TestHostedQueuedPromptsArePrivateEditableAndRemovedWhenStarted(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	alice, err := seed.CreateUser(t.Context(), pool, "queue-alice")
	require.NoError(t, err)
	bob, err := seed.CreateUser(t.Context(), pool, "queue-bob")
	require.NoError(t, err)
	dispatcher, err := NewDispatcher(store, streamingHost{store: store, ticks: 1, every: time.Millisecond}, 8, time.Second)
	require.NoError(t, err)
	handler := &Handler{PrivateConversations: true, Store: store, Dispatcher: dispatcher, credentials: newTurnCredentials()}
	server := func(userID int64, owner string) *httptest.Server {
		r := chi.NewRouter()
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
				request = request.WithContext(middleware.ContextWithAuthInfo(request.Context(), &middleware.AuthInfo{User: &db.User{ID: userID, Username: owner}, SessionHash: strings.Repeat("a", 64)}))
				next.ServeHTTP(w, request)
			})
		})
		handler.MountPublic(r)
		s := httptest.NewServer(r)
		t.Cleanup(s.Close)
		return s
	}
	a, b := server(alice, "queue-alice"), server(bob, "queue-bob")
	// The real dispatcher is not running yet: every admission is durably queued.
	first := submitPrompt(t, a, "main", "first", "Alice first")
	second := submitPrompt(t, a, "main", "second", "Alice second")
	other := submitPrompt(t, b, "main", "first", "Bob private")
	type prompt struct {
		ID     string `json:"id"`
		Prompt string `json:"prompt"`
	}
	read := func(server *httptest.Server) []prompt {
		response, err := server.Client().Get(server.URL + "/api/conversations/main/view-state")
		require.NoError(t, err)
		defer response.Body.Close()
		require.Equal(t, http.StatusOK, response.StatusCode)
		var view struct {
			Queue []prompt `json:"queue"`
		}
		require.NoError(t, json.NewDecoder(response.Body).Decode(&view))
		return view.Queue
	}
	require.Equal(t, []prompt{{first.TurnID, "Alice first"}, {second.TurnID, "Alice second"}}, read(a))
	require.Equal(t, []prompt{{other.TurnID, "Bob private"}}, read(b))
	mutate := func(server *httptest.Server, method, id, body string, status int) {
		request, err := http.NewRequest(method, server.URL+"/api/conversations/main/turns/"+id, strings.NewReader(body))
		require.NoError(t, err)
		request.Header.Set("Content-Type", "application/json")
		response, err := server.Client().Do(request)
		require.NoError(t, err)
		response.Body.Close()
		require.Equal(t, status, response.StatusCode)
	}
	mutate(b, http.MethodPatch, first.TurnID, `{"prompt":"Forged"}`, http.StatusNotFound)
	mutate(a, http.MethodPatch, first.TurnID, `{"prompt":"Alice edited"}`, http.StatusOK)
	require.Equal(t, []prompt{{first.TurnID, "Alice edited"}, {second.TurnID, "Alice second"}}, read(a))
	mutate(a, http.MethodDelete, first.TurnID, `{}`, http.StatusOK)
	require.Equal(t, []prompt{{second.TurnID, "Alice second"}}, read(a))
	require.Equal(t, []prompt{{other.TurnID, "Bob private"}}, read(b))
	ctx, cancel := context.WithCancel(t.Context())
	finished := make(chan error, 1)
	go func() { finished <- dispatcher.Run(ctx, 2) }()
	t.Cleanup(func() { cancel(); <-finished })
	require.Equal(t, StateCompleted, awaitPrompt(t, a, second).State)
	require.Empty(t, read(a))
	mutate(a, http.MethodPatch, second.TurnID, `{"prompt":"Too late"}`, http.StatusConflict)
	_, err = pool.Exec(t.Context(), `UPDATE users SET prohibit_login=true WHERE id=$1`, alice)
	require.NoError(t, err)
	denied, err := a.Client().Get(a.URL + "/api/conversations/main/view-state")
	require.NoError(t, err)
	denied.Body.Close()
	require.Equal(t, http.StatusForbidden, denied.StatusCode)
}
