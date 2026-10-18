package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/guest"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

type guestMainHost struct{}

func (guestMainHost) GetBookmark(_ context.Context, _, _, name string) (repohost.Bookmark, error) {
	if name != "main" {
		panic("guest read outside main")
	}
	return repohost.Bookmark{TargetCommitID: "main-tip"}, nil
}
func (guestMainHost) GetFileAtCommit(_ context.Context, _, _, revision, path string) (repohost.FileContent, error) {
	if revision != "main-tip" || path != ".smithers/instructions/app.md" {
		panic("guest read outside instructions")
	}
	return repohost.FileContent{Content: "Reply in the repository's language."}, nil
}

type guestFixture struct {
	pool    *pgxpool.Pool
	handler *guest.Handler
	cfg     *config.Config
	router  *chi.Mux
	cookie  *http.Cookie
	calls   atomic.Int64
	users   int
}

func newGuestFixture(t *testing.T, mode string, provider func(http.ResponseWriter, *http.Request)) *guestFixture {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	q := db.New(pool)
	ctx := context.Background()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "sponsor", LowerUsername: "sponsor", DisplayName: "Sponsor"})
	require.NoError(t, err)
	_, err = q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "public", LowerName: "public", IsPublic: true, DefaultBookmark: "main"})
	require.NoError(t, err)
	f := &guestFixture{pool: pool, cfg: testConfigAllFlagsOn()}
	f.cfg.Auth.Mode = mode
	f.cfg.Server.PublicURL = "https://example.com"
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&f.users))
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls.Add(1)
		if provider != nil {
			provider(w, r)
			return
		}
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "Bearer fixture-provider-key", r.Header.Get("Authorization"))
		require.Nil(t, body["tools"])
		require.Nil(t, body["tool_choice"])
		require.Equal(t, "gpt-6-sol", body["model"])
		messages := body["messages"].([]any)
		require.Equal(t, ports.BuiltinAppInstructions+"\n\nReply in the repository's language.", messages[0].(map[string]any)["content"])
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Guest answer\"}}]}\n\ndata: {\"choices\":[],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n")
	}))
	var listener net.Listener
	for i := 0; i < 20; i++ {
		listener, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", 49400+rand.IntN(2000)))
		if err == nil {
			break
		}
	}
	require.NoError(t, err)
	upstream.Listener = listener
	upstream.Start()
	t.Cleanup(upstream.Close)
	now := time.Now().UTC()
	f.handler = &guest.Handler{DB: pool, Source: guestRepositorySource{queries: q, host: guestMainHost{}}, Keys: modelproxy.StaticKeys{modelproxy.ProviderOpenAI: "fixture-provider-key"}, Upstreams: map[string]string{modelproxy.ProviderOpenAI: upstream.URL}, Config: config.GuestConfig{Repositories: []string{"sponsor/public"}, Provider: modelproxy.ProviderOpenAI, Model: "gpt-6-sol", SponsorID: owner.ID, IPSecret: strings.Repeat("s", 32), RequestNanos: 100_000_000, DailyNanos: 100_000_000_000, WindowNanos: 500_000_000_000, WindowStart: now.Add(-time.Hour).Format(time.RFC3339), WindowEnd: now.Add(time.Hour).Format(time.RFC3339), RequestsPerIP: 100, OutputTokens: 1024}}
	f.recompose(t)
	boot := f.request("GET", "/api/repos/sponsor/public/guest", nil, "")
	require.Equal(t, 200, boot.Code, boot.Body.String())
	require.Len(t, boot.Result().Cookies(), 1)
	f.cookie = boot.Result().Cookies()[0]
	return f
}
func (f *guestFixture) recompose(t *testing.T) {
	t.Helper()
	// Use the complete product router, with the same guest mount used by both
	// compositions. Its ordinary auth and write routes remain in the router.
	f.router = defaultRouterForConfig(f.cfg, nil, nil).(*chi.Mux)
	mountGuestPublic(f.router, f.handler, db.New(f.pool), f.cfg)
}
func (f *guestFixture) request(method, path string, body any, key string) *httptest.ResponseRecorder {
	var encoded string
	if body != nil {
		b, _ := json.Marshal(body)
		encoded = string(b)
	}
	r := httptest.NewRequest(method, path, strings.NewReader(encoded))
	r.RemoteAddr = "192.0.2.1:1234"
	r.Header.Set("Content-Type", "application/json")
	if f.cookie != nil {
		r.AddCookie(f.cookie)
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	return w
}
func (f *guestFixture) chat(key string) *httptest.ResponseRecorder {
	return f.request("POST", "/api/repos/sponsor/public/guest/chat", map[string]any{"prompt": "A repository question", "idempotencyKey": key, "landingId": "b0c8af15-f9cc-4325-b383-149c13144913"}, key)
}

func TestGuestComposedChatAndIsolation(t *testing.T) {
	for _, mode := range []string{config.AuthModeSelfHosted, config.AuthModeMultitenant} {
		t.Run(mode, func(t *testing.T) {
			f := newGuestFixture(t, mode, nil)
			response := f.chat(uuid.NewString())
			require.Equal(t, 200, response.Code, response.Body.String())
			require.Contains(t, response.Body.String(), "Guest answer")
			id := response.Header().Get("X-Smithers-Run-Id")
			require.NotEmpty(t, id)
			run := f.request("GET", "/api/repos/sponsor/public/guest/runs/"+id, nil, "")
			require.Equal(t, 200, run.Code)
			require.Contains(t, run.Body.String(), "completed")
			cookie := f.cookie
			f.cookie = nil
			require.Equal(t, 429, f.request("GET", "/api/repos/sponsor/public/guest/runs/"+id, nil, "").Code)
			require.Equal(t, 429, f.chat(uuid.NewString()).Code)
			f.cookie = cookie
			require.Equal(t, 403, f.request("POST", "/api/repos/other/public/guest/chat", map[string]any{}, "").Code)
			for _, path := range []string{"/api/conversations/main/prompt", "/api/repos/sponsor/public/secrets"} {
				result := f.request("POST", path, map[string]string{"prompt": "no authority"}, "")
				require.NotEqual(t, 200, result.Code)
				require.NotEqual(t, 202, result.Code)
			}
			require.Equal(t, int64(1), f.calls.Load())
			var members int
			require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*) FROM users`).Scan(&members))
			require.Equal(t, f.users, members, "no guest user was created")
			f.handler.Config.Repositories = nil
			require.Equal(t, 403, f.chat(uuid.NewString()).Code)
			require.Equal(t, int64(1), f.calls.Load())
		})
	}
}

func TestGuestConcurrentReservationsNeverExceedPool(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	f := newGuestFixture(t, config.AuthModeMultitenant, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
		w.WriteHeader(503)
	})
	f.handler.Client = &http.Client{Timeout: 500 * time.Millisecond}
	f.handler.Config.DailyNanos = 300_000_000
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result := f.chat(uuid.NewString())
			require.Contains(t, []int{429, 502, 503, 504}, result.Code, result.Body.String())
		}()
	}
	wg.Wait()
	var bound, charged int64
	var count int
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*),COALESCE(sum(bound_nanos),0)::bigint,COALESCE(sum(charged_nanos),0)::bigint FROM guest_reservations`).Scan(&count, &bound, &charged))
	require.Greater(t, count, 0)
	require.Less(t, count, 20)
	require.LessOrEqual(t, bound, int64(300_000_000))
	require.Equal(t, bound, charged)
	require.Equal(t, int64(count), f.calls.Load())
	var alerts int
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE source_type='guest_spend'`).Scan(&alerts))
	require.Equal(t, 1, alerts)
}

func TestGuestDuplicateRestartTimeoutAndKillSwitch(t *testing.T) {
	f := newGuestFixture(t, config.AuthModeSelfHosted, nil)
	key := uuid.NewString()
	require.Equal(t, 200, f.chat(key).Code)
	// A new handler/router over the same durable ledger cannot buy a retry.
	copy := *f.handler
	f.handler = &copy
	f.recompose(t)
	require.Equal(t, 409, f.chat(key).Code)
	require.Equal(t, int64(1), f.calls.Load())
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, true))
	refused := f.chat(uuid.NewString())
	require.Equal(t, 503, refused.Code)
	require.Contains(t, refused.Body.String(), "signIn")
	require.Equal(t, int64(1), f.calls.Load())
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, false))
	f.handler.Config.Model = "unpriced"
	require.Equal(t, 503, f.chat(uuid.NewString()).Code)
	require.Equal(t, int64(1), f.calls.Load())
}

func TestGuestKillSwitchCancelsActiveProvider(t *testing.T) {
	entered, stopped := make(chan struct{}), make(chan struct{})
	f := newGuestFixture(t, config.AuthModeMultitenant, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		close(entered)
		select {
		case <-r.Context().Done():
			close(stopped)
		case <-time.After(5 * time.Second):
		}
	})
	finished := make(chan struct{})
	key := uuid.NewString()
	go func() { defer close(finished); f.chat(key) }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("provider never entered")
	}
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, true))
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("switch did not cancel provider")
	}
	<-finished
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, false))
	require.Equal(t, 409, f.chat(key).Code)
	require.Equal(t, int64(1), f.calls.Load())
	var state string
	var bound, charged int64
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT state,bound_nanos,charged_nanos FROM guest_reservations`).Scan(&state, &bound, &charged))
	require.Equal(t, "uncertain", state)
	require.Equal(t, bound, charged)
}
