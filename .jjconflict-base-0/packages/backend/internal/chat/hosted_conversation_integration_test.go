package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

// Exercise the same HTTP model stream and PostgreSQL producer callbacks as a
// hosted account. A synthetic Model stream misses framing and journal receipts.
func TestHostedLongRepliesThroughTypeScriptHost(t *testing.T) {
	for _, item := range []struct {
		size   int
		reason string
	}{{32, "stop"}, {1 << 20, "stop"}, {32, "length"}, {1 << 20, "length"}} {
		fragmentSize := item.size
		t.Run(fmt.Sprintf("fragment_%d_%s", fragmentSize, item.reason), func(t *testing.T) {
			pool, _ := postgresfixture.NewProductDatabase(t)
			user, err := seed.CreateUser(t.Context(), pool, "long-reply-owner")
			require.NoError(t, err)
			store, err := NewStore(pool)
			require.NoError(t, err)
			handler := &Handler{Store: store, PrivateConversations: true}
			router := chi.NewRouter()
			router.Group(func(public chi.Router) {
				public.Use(func(next http.Handler) http.Handler {
					return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						ctx := middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: &db.User{ID: user, Username: "long-reply-owner"}, SessionHash: strings.Repeat("a", 64)})
						next.ServeHTTP(w, r.WithContext(ctx))
					})
				})
				handler.MountPublic(public)
			})
			handler.MountProducerCallbacks(router)
			server := httptest.NewServer(router)
			defer server.Close()
			answer := strings.Repeat("Queue state — β <input> & retry.\n", 600)
			providerCancelled := make(chan struct{})
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				w.Header().Set("Content-Type", "text/event-stream")
				// Split by runes so the byte-fragment case preserves valid UTF-8.
				runes := []rune(answer)
				for at := 0; at < len(runes); at += fragmentSize {
					end := min(at+fragmentSize, len(runes))
					raw, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]string{"content": string(runes[at:end])}, "finish_reason": nil}}})
					fmt.Fprintf(w, "data: %s\n\n", raw)
				}
				fmt.Fprintf(w, "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":%q}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":4096}}\n\ndata: [DONE]\n\n", item.reason)
				w.(http.Flusher).Flush()
				// The proxy may retain the connection after its terminal SSE chunk.
				<-r.Context().Done()
				close(providerCancelled)
			}))
			defer provider.Close()
			defer provider.CloseClientConnections()
			fixture := startFixtureHost(t, server.URL, provider.URL)
			defer fixture.stop()
			host, err := NewHTTPChatHost(fixture.origin, nil, "deterministic-host-token")
			require.NoError(t, err)
			runtime, err := NewRuntime(pool, host, server.URL, RuntimeOptions{PrivateConversations: true, QueueSize: 8, Concurrency: 1, Lease: time.Minute})
			require.NoError(t, err)
			*handler = *runtime.Handler
			ctx, cancel := context.WithCancel(t.Context())
			finished := make(chan error, 1)
			go func() { finished <- runtime.Run(ctx) }()
			defer func() { cancel(); <-finished }()
			receipt := submitPrompt(t, server, "main", "long-reply-3812", "Write a long answer")
			deadline := time.Now().Add(20 * time.Second)
			for {
				requestCtx, stopRead := context.WithTimeout(t.Context(), 2*time.Second)
				request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, server.URL+"/api/conversations/main", nil)
				require.NoError(t, err)
				response, err := server.Client().Do(request)
				require.NoError(t, err)
				var view SharedConversation
				err = json.NewDecoder(response.Body).Decode(&view)
				response.Body.Close()
				stopRead()
				require.NoError(t, err)
				require.Equal(t, http.StatusOK, response.StatusCode)
				expectedState := StateCompleted
				if item.reason == "length" {
					expectedState = StateFailed
				}
				if len(view.Entries) > 0 && view.Entries[0].State == expectedState {
					require.Equal(t, receipt.TurnID, view.Entries[0].ID)
					var text strings.Builder
					for _, raw := range view.Entries[0].Frames {
						var frame struct{ Type, Kind, Text string }
						require.NoError(t, json.Unmarshal(raw, &frame))
						if frame.Type == "delta" && frame.Kind == "text" {
							text.WriteString(frame.Text)
						}
					}
					require.Equal(t, answer, text.String())
					select {
					case <-providerCancelled:
					case <-time.After(2 * time.Second):
						t.Fatal("host retained the finished model stream")
					}
					break
				}
				if time.Now().After(deadline) {
					t.Fatalf("long reply did not finish: entries=%d", len(view.Entries))
				}
				time.Sleep(20 * time.Millisecond)
			}
		})
	}
}

func TestHostedConversationWithoutInstallOwnsAdmissionOutputAndView(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	alice, err := seed.CreateUser(t.Context(), pool, "hosted-alice")
	require.NoError(t, err)
	bob, err := seed.CreateUser(t.Context(), pool, "hosted-bob")
	require.NoError(t, err)
	dispatcher, err := NewDispatcher(store, streamingHost{store: store, ticks: 1, every: time.Millisecond}, 8, time.Second)
	require.NoError(t, err)
	handler := &Handler{PrivateConversations: true, Store: store, Dispatcher: dispatcher, credentials: newTurnCredentials()}
	ctx, cancel := context.WithCancel(t.Context())
	finished := make(chan error, 1)
	go func() { finished <- dispatcher.Run(ctx, 2) }()
	t.Cleanup(func() { cancel(); <-finished })
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
	a, b := server(alice, "hosted-alice"), server(bob, "hosted-bob")
	first := submitPrompt(t, a, "main", "same-key", "Alice private prompt")
	result := awaitPrompt(t, a, first)
	require.Equal(t, StateCompleted, result.State)
	require.Equal(t, "hosted-alice", result.AuthorLogin)
	require.Equal(t, "Alice private prompt", result.Prompt)
	require.Len(t, result.Frames, 2)
	progress, err := store.SharedEntries(ctx, Scope{UserID: alice, Owner: "hosted-alice"}, "main", true)
	require.NoError(t, err)
	require.Len(t, progress.Entries, 1)
	require.Greater(t, progress.Entries[0].StartedAt, int64(0))
	require.GreaterOrEqual(t, progress.Entries[0].FinishedAt, progress.Entries[0].StartedAt)
	require.Equal(t, first.TurnID, submitPrompt(t, a, "main", "same-key", "Alice private prompt").TurnID)
	other := submitPrompt(t, b, "main", "same-key", "Bob private prompt")
	require.NotEqual(t, first.TurnID, other.TurnID)
	awaitPrompt(t, b, other)
	for _, user := range []struct {
		server       *httptest.Server
		own, foreign string
	}{{a, "Alice private prompt", "Bob private prompt"}, {b, "Bob private prompt", "Alice private prompt"}} {
		response, err := user.server.Client().Get(user.server.URL + "/api/conversations/main")
		require.NoError(t, err)
		var conversation SharedConversation
		require.NoError(t, json.NewDecoder(response.Body).Decode(&conversation))
		response.Body.Close()
		raw, err := json.Marshal(conversation)
		require.NoError(t, err)
		require.Contains(t, string(raw), user.own)
		require.NotContains(t, string(raw), user.foreign)
		require.NotContains(t, string(raw), "writer_hash")
		require.NotContains(t, string(raw), "access_hash")
	}
	for _, branch := range []string{"feature", "account-" + strings.Repeat("0", 2) + "-main"} {
		response, err := a.Client().Get(a.URL + "/api/conversations/" + branch)
		require.NoError(t, err)
		response.Body.Close()
		require.Equal(t, http.StatusForbidden, response.StatusCode)
	}
	request, err := http.NewRequest(http.MethodPut, a.URL+"/api/conversations/main/view-state", strings.NewReader(`{"last_seen_seq":3,"toasts_hidden":true}`))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	response, err := a.Client().Do(request)
	require.NoError(t, err)
	response.Body.Close()
	require.Equal(t, http.StatusOK, response.StatusCode)
	view, err := b.Client().Get(b.URL + "/api/conversations/main/view-state")
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, json.NewDecoder(view.Body).Decode(&body))
	view.Body.Close()
	require.Empty(t, body)
	for _, raw := range []string{`{"queue":[]}`, `{"instructions":[]}`, `{"last_seen_seq":"3"}`, `{"last_seen_seq":1.5}`, `{"toasts_hidden":"yes"}`} {
		request, err := http.NewRequest(http.MethodPut, a.URL+"/api/conversations/main/view-state", strings.NewReader(raw))
		require.NoError(t, err)
		request.Header.Set("Content-Type", "application/json")
		response, err := a.Client().Do(request)
		require.NoError(t, err)
		response.Body.Close()
		require.Equal(t, http.StatusBadRequest, response.StatusCode)
	}
	request, err = http.NewRequest(http.MethodPut, a.URL+"/api/conversations/main/view-state", strings.NewReader(`{"last_seen_seq":1}`))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	response, err = a.Client().Do(request)
	require.NoError(t, err)
	var saved map[string]any
	require.NoError(t, json.NewDecoder(response.Body).Decode(&saved))
	response.Body.Close()
	require.Equal(t, float64(3), saved["last_seen_seq"])
	// An account cannot use another account's opaque turn ID to stop it.
	foreign := postJSON(t, b.Client(), b.URL+"/api/conversations/main/turns/"+first.TurnID+"/stop", []byte(`{}`))
	foreign.Body.Close()
	require.Equal(t, http.StatusNotFound, foreign.StatusCode)
	// The database rechecks account suspension, including a captured HTTP identity.
	_, err = pool.Exec(t.Context(), `UPDATE users SET prohibit_login=true WHERE id=$1`, alice)
	require.NoError(t, err)
	denied, err := a.Client().Get(a.URL + "/api/conversations/main")
	require.NoError(t, err)
	denied.Body.Close()
	require.Equal(t, http.StatusForbidden, denied.StatusCode)
}
