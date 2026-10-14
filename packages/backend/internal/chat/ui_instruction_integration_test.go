package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
)

// A committed UI request reaches only its author's view state, as its command
// and payload; the shared conversation carries neither.
func TestUIInstructionsReachOnlyTheirAuthorsView(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	ben, err := seed.CreateUser(ctx, pool, "ui-ben")
	require.NoError(t, err)
	alice, err := seed.CreateUser(ctx, pool, "ui-alice")
	require.NoError(t, err)
	q := db.New(pool)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: ben, Valid: true}, Name: "ui", LowerName: "ui", DefaultBookmark: "main"})
	require.NoError(t, err)
	for _, user := range []int64{ben, alice} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'write')`, repo.ID, user)
		require.NoError(t, err)
	}
	setting, _ := json.Marshal(map[string]any{"owner_login": "ui-ben", "repository_name": "ui", "repository_id": repo.ID})
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: setting}))
	store, err := NewStore(pool)
	require.NoError(t, err)
	scope := Scope{RepositoryID: repo.ID, UserID: ben, Owner: "ui-ben"}
	request := json.RawMessage(`{"runId":"ui-run","conversationId":"main","sharedConversation":true,"instructions":"Answer","messages":[{"role":"user","content":"Dismiss the run card and go dark"}]}`)
	admitted, err := store.Admit(ctx, AdmitInput{Scope: scope, RunID: "ui-run", Journal: testJournal(), Request: request})
	require.NoError(t, err)
	grant, err := store.Claim(ctx, scope, admitted.TurnID, time.Minute)
	require.NoError(t, err)
	_, err = store.Commit(ctx, CommitInput{TurnID: grant.TurnID, Generation: grant.Generation, Token: grant.Token, Expected: grant.Cursor, Frames: []json.RawMessage{
		json.RawMessage(`{"runId":"ui-run","type":"call.settled","link":0,"ordinal":0,"name":"card.dismiss","verdict":"run","ui":{"command":"card.dismiss","cardId":"card-7"}}`),
		json.RawMessage(`{"runId":"ui-run","type":"call.settled","link":0,"ordinal":1,"name":"theme","verdict":"run","ui":{"command":"theme","mode":"dark"}}`),
		json.RawMessage(`{"runId":"ui-run","type":"call.settled","link":0,"ordinal":2,"name":"runs.trace.view","verdict":"run","ui":{"command":"runs.trace.view","runId":"monitor-9","view":"turns","state":{"selected":"cell-1","at":3,"tab":"journal"}}}`),
		frame("ui-run", "Done"), done("ui-run", "stop"),
	}})
	require.NoError(t, err)
	read := func(user int64, login, path string) string {
		handler := &Handler{Store: store, ResolveBranch: func(context.Context, Scope, string) (string, error) { return "main", nil }}
		server := httptest.NewServer(authenticatedRoutes(handler, user, login))
		defer server.Close()
		response, err := server.Client().Get(server.URL + path)
		require.NoError(t, err)
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, response.StatusCode, string(body))
		return string(body)
	}
	var view struct {
		Instructions []json.RawMessage `json:"instructions"`
	}
	require.NoError(t, json.Unmarshal([]byte(read(ben, "ui-ben", "/api/conversations/main/view-state")), &view))
	require.Len(t, view.Instructions, 3)
	require.JSONEq(t, `{"id":"`+admitted.TurnID+`:1:0","command":"card.dismiss","payload":{"cardId":"card-7"}}`, string(view.Instructions[0]))
	require.JSONEq(t, `{"id":"`+admitted.TurnID+`:1:1","command":"theme","payload":{"mode":"dark"}}`, string(view.Instructions[1]))
	require.JSONEq(t, `{"id":"`+admitted.TurnID+`:1:2","command":"runs.trace.view","payload":{"runId":"monitor-9","view":"turns","state":{"selected":"cell-1","at":3,"tab":"journal"}}}`, string(view.Instructions[2]))
	require.NotContains(t, read(alice, "ui-alice", "/api/conversations/main/view-state"), `"instructions"`)
	shared := read(alice, "ui-alice", "/api/conversations/main")
	require.Contains(t, shared, "Done")
	require.NotContains(t, shared, `"ui"`)
	require.NotContains(t, shared, "card-7")
	require.NotContains(t, shared, "monitor-9")
}

// #3823: on Smithers Cloud an account conversation has no install API, so its
// agent asks for a new flow with the form on its author's own screen. The
// production prompt route admits the turn, the packaged TypeScript host runs
// flow.new and commits the request through the real producer callbacks, and
// the account's view state serves it to that account alone. Only the model
// endpoint is scripted. Saved browser input still supplies no instruction.
func TestHostedAccountAgentAsksForANewFlowWithItsForm(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	author, err := seed.CreateUser(t.Context(), pool, "flow-asker")
	require.NoError(t, err)
	other, err := seed.CreateUser(t.Context(), pool, "flow-other")
	require.NoError(t, err)
	handler := &Handler{Store: store, PrivateConversations: true}
	router := chi.NewRouter()
	router.Group(func(public chi.Router) {
		public.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				user := &db.User{ID: author, Username: "flow-asker"}
				if r.Header.Get("X-Test-Account") == "other" {
					user = &db.User{ID: other, Username: "flow-other"}
				}
				next.ServeHTTP(w, r.WithContext(middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: user, SessionHash: strings.Repeat("a", 64)})))
			})
		})
		handler.MountPublic(public)
	})
	handler.MountProducerCallbacks(router)
	server := httptest.NewServer(router)
	defer server.Close()

	const said = "label new issues by area"
	var mu sync.Mutex
	var systems, results []string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if json.NewDecoder(r.Body).Decode(&input) != nil {
			http.Error(w, "json", http.StatusBadRequest)
			return
		}
		var system, result string
		for _, message := range input.Messages {
			var text string
			if json.Unmarshal(message.Content, &text) != nil {
				continue
			}
			switch message.Role {
			case "system":
				system = text
			case "tool":
				result = text
			}
		}
		mu.Lock()
		systems = append(systems, system)
		if result != "" {
			results = append(results, result)
		}
		mu.Unlock()
		delta, finish := map[string]any{"content": "The form is on your screen."}, "stop"
		if result == "" {
			args, _ := json.Marshal(map[string]string{"description": said})
			arguments, _ := json.Marshal(map[string]string{"action": "execute", "name": "flow.new", "args": string(args)})
			delta = map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"index": 0, "id": "flow-call", "type": "function",
				"function": map[string]string{"name": "commands", "arguments": string(arguments)}}}}
			finish = "tool_calls"
		}
		chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": finish}}})
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", chunk)
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

	view := func(account, method, body string) (int, string) {
		t.Helper()
		request, err := http.NewRequest(method, server.URL+"/api/conversations/main/view-state", strings.NewReader(body))
		require.NoError(t, err)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Test-Account", account)
		response, err := server.Client().Do(request)
		require.NoError(t, err)
		defer response.Body.Close()
		raw, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		return response.StatusCode, string(raw)
	}
	status, before := view("author", http.MethodGet, "")
	require.Equal(t, http.StatusOK, status, before)
	require.NotContains(t, before, `"instructions"`)

	receipt := submitPrompt(t, server, "main", "flow-new-3823", "make me a flow that labels new issues by area")
	turn := awaitPrompt(t, server, receipt)
	require.Equal(t, StateCompleted, turn.State)

	// The host offered flow.new to the account conversation and told the model the form is open.
	mu.Lock()
	require.Len(t, systems, 2, "one leg asks, one answers from the result")
	require.Contains(t, systems[0], "- /flow.new — Create a new flow")
	require.Contains(t, systems[0], "run flow.new in that turn")
	require.Equal(t, []string{`The "Create a new flow" form is open on the author's screen, with description filled in. Nothing is created until they press Submit: tell them the form is on their screen, and never ask them to type arguments.`}, results)
	mu.Unlock()

	var served struct {
		Instructions []struct {
			ID      string          `json:"id"`
			Command string          `json:"command"`
			Payload json.RawMessage `json:"payload"`
		} `json:"instructions"`
	}
	status, body := view("author", http.MethodGet, "")
	require.Equal(t, http.StatusOK, status, body)
	require.NoError(t, json.Unmarshal([]byte(body), &served))
	require.Len(t, served.Instructions, 1, body)
	require.Equal(t, "flow.new", served.Instructions[0].Command)
	require.JSONEq(t, `{"description":"`+said+`"}`, string(served.Instructions[0].Payload))
	require.True(t, strings.HasPrefix(served.Instructions[0].ID, receipt.TurnID+":"), served.Instructions[0].ID)

	// Another account reads its own empty view, never this one's request.
	status, foreign := view("other", http.MethodGet, "")
	require.Equal(t, http.StatusOK, status, foreign)
	require.NotContains(t, foreign, `"instructions"`)
	require.NotContains(t, foreign, said)

	// A browser cannot write an instruction, and its own saved view keeps none.
	status, _ = view("author", http.MethodPut, `{"instructions":[{"id":"forged","command":"flow.new","payload":{"description":"forged"}}]}`)
	require.Equal(t, http.StatusBadRequest, status)
	status, saved := view("author", http.MethodPut, `{"last_seen_seq":1}`)
	require.Equal(t, http.StatusOK, status, saved)
	require.NotContains(t, saved, `"instructions"`)
	var stored string
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT view_state::text FROM chat_account_views WHERE user_id=$1`, author).Scan(&stored))
	require.NotContains(t, stored, "instructions")
	// The committed request keeps its identity across reads: the browser applies it at most once.
	status, again := view("author", http.MethodGet, "")
	require.Equal(t, http.StatusOK, status, again)
	var reread struct {
		Instructions []struct {
			ID string `json:"id"`
		} `json:"instructions"`
		LastSeenSeq float64 `json:"last_seen_seq"`
	}
	require.NoError(t, json.Unmarshal([]byte(again), &reread))
	require.Len(t, reread.Instructions, 1, again)
	require.Equal(t, served.Instructions[0].ID, reread.Instructions[0].ID)
	require.Equal(t, float64(1), reread.LastSeenSeq)
}
