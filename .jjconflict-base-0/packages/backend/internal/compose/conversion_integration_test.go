package compose

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/guest"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/stretchr/testify/require"
)

const conversionInput = `import { Effect } from "effect"; Effect.succeed(1)`
const conversionOutput = "const value = 1"

type conversionHost struct {
	guestMainHost
	changed bool
}

func (h conversionHost) GetFileAtCommit(ctx context.Context, owner, name, revision, path string) (repohost.FileContent, error) {
	if path == ".smithers/instructions/app.md" {
		return h.guestMainHost.GetFileAtCommit(ctx, owner, name, revision, path)
	}
	if revision != "main-tip" {
		panic("conversion did not pin main")
	}
	switch path {
	case ".smithers/flows/convert/flow.ts":
		code := guest.ConversionFlowDeclaration
		if h.changed {
			code += "\nthrow new Error('untrusted')"
		}
		return repohost.FileContent{Content: code}, nil
	case ".smithers/flows/convert/prompt.md":
		return repohost.FileContent{Content: "Fixture conversion prompt"}, nil
	default:
		panic("unexpected conversion source path")
	}
}
func conversionServer(t *testing.T, h http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewUnstartedServer(h)
	for i := 0; i < 30; i++ {
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", 49400+rand.IntN(2000)))
		if err == nil {
			server.Listener = listener
			server.Start()
			t.Cleanup(server.Close)
			return server
		}
	}
	t.Fatal("no lane port available")
	return nil
}

type conversionFixture struct {
	*guestFixture
	compiles atomic.Int64
	worker   *httptest.Server
}

func newConversionFixture(t *testing.T, worker http.HandlerFunc) *conversionFixture {
	t.Helper()
	f := &conversionFixture{}
	f.guestFixture = newGuestFixture(t, config.AuthModeMultitenant, func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		require.Equal(t, false, request["stream"])
		require.Equal(t, float64(4096), request["max_completion_tokens"])
		require.Nil(t, request["tools"])
		require.Nil(t, request["tool_choice"])
		require.Equal(t, "gpt-6-sol", request["model"])
		messages := request["messages"].([]any)
		require.Equal(t, "Fixture conversion prompt", messages[0].(map[string]any)["content"])
		require.Equal(t, conversionInput, messages[1].(map[string]any)["content"])
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": "```effeck\n" + conversionOutput + "\n```"}, "finish_reason": "stop"}}, "usage": map[string]int{"prompt_tokens": 12, "completion_tokens": 6}})
	})
	f.handler.Source = guestRepositorySource{queries: db.New(f.pool), host: conversionHost{}}
	f.handler.Config.ReceiptSeed = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, ed25519.SeedSize))
	f.worker = conversionServer(t, func(w http.ResponseWriter, r *http.Request) {
		f.compiles.Add(1)
		require.Empty(t, r.Header.Get("Authorization"))
		require.Empty(t, r.Header.Get("Cookie"))
		var body map[string]string
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, map[string]string{"code": conversionOutput}, body)
		if worker != nil {
			worker(w, r)
			return
		}
		compileReply(w, 0)
	})
	f.handler.Config.CompileEndpoint = f.worker.URL
	f.recompose(t)
	return f
}
func compileReply(w http.ResponseWriter, exit int) {
	_ = json.NewEncoder(w).Encode(map[string]any{"exitCode": exit, "diagnostics": []any{map[string]any{"line": 1, "column": 2, "code": "E1", "message": "Fixture diagnostic"}}, "effeckVersion": "0.0.1", "compilerDigest": "sha256:" + strings.Repeat("a", 64), "dependenciesDigest": strings.Repeat("b", 64)})
}
func (f *conversionFixture) convert(key, source string) *httptest.ResponseRecorder {
	return f.request("POST", "/api/repos/sponsor/public/guest/conversions", map[string]string{"input": source, "idempotencyKey": key, "sourceLabel": "direct"}, key)
}
func conversionValue(t *testing.T, response *httptest.ResponseRecorder) guest.ConversionResult {
	t.Helper()
	require.Equal(t, 200, response.Code, response.Body.String())
	var result guest.ConversionResult
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	return result
}
func TestConversionFreeValidationAndDeclaration(t *testing.T) {
	f := newConversionFixture(t, nil)
	for _, tc := range []struct{ source, code string }{
		{"const x=1", "not_effect"}, {strings.Repeat("a", 8193), "too_large"}, {conversionInput + "\x00", "invalid_source"},
		{`// import { Effect } from "effect"`, "not_effect"}, {"const example = `import { Effect } from \"effect\"`", "not_effect"},
		{`const example = 'import { Effect } from "effect"'`, "not_effect"},
		{`const example = /import { Effect } from "effect"/`, "not_effect"},
	} {
		result := conversionValue(t, f.convert(uuid.NewString(), tc.source))
		require.Equal(t, "refused", result.State)
		require.Equal(t, tc.code, result.Refusal)
	}
	for _, body := range []string{`{"input":"import \ud800","idempotencyKey":"utf8-a","sourceLabel":"direct"}`, "{\"input\":\"" + string([]byte{0xff}) + "\",\"idempotencyKey\":\"utf8-b\",\"sourceLabel\":\"direct\"}"} {
		r := httptest.NewRequest("POST", "/api/repos/sponsor/public/guest/conversions", strings.NewReader(body))
		r.RemoteAddr = "192.0.2.1:1234"
		r.Header.Set("Content-Type", "application/json")
		r.AddCookie(f.cookie)
		response := httptest.NewRecorder()
		f.router.ServeHTTP(response, r)
		require.Contains(t, response.Body.String(), "invalid_source")
	}
	require.Zero(t, f.calls.Load())
	require.Zero(t, f.compiles.Load())
	var reservations int
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*) FROM guest_reservations`).Scan(&reservations))
	require.Zero(t, reservations)
	f.handler.Source = guestRepositorySource{queries: db.New(f.pool), host: conversionHost{changed: true}}
	result := conversionValue(t, f.convert(uuid.NewString(), conversionInput))
	require.Equal(t, "conversion_unavailable", result.Refusal)
	require.Zero(t, f.calls.Load())
}
func TestConversionCompiledReceiptReplayAndIsolation(t *testing.T) {
	f := newConversionFixture(t, nil)
	key := "one-conversion"
	first := f.convert(key, conversionInput)
	result := conversionValue(t, first)
	require.Equal(t, "compiled", result.State)
	require.Equal(t, conversionOutput, result.Effeck)
	require.NotNil(t, result.Receipt)
	keyResponse := f.request("GET", "/api/repos/sponsor/public/guest/conversions/key", nil, "")
	require.Equal(t, 200, keyResponse.Code)
	var public struct {
		PublicKey string `json:"publicKey"`
	}
	require.NoError(t, json.Unmarshal(keyResponse.Body.Bytes(), &public))
	pub, err := base64.StdEncoding.DecodeString(public.PublicKey)
	require.NoError(t, err)
	sig, err := base64.StdEncoding.DecodeString(result.Receipt.Signature)
	require.NoError(t, err)
	require.True(t, ed25519.Verify(pub, guest.ReceiptMessage(result), sig))
	result.Receipt.InputSha = strings.Repeat("c", 64)
	require.False(t, ed25519.Verify(pub, guest.ReceiptMessage(result), sig))
	duplicate := f.convert(key, "different input")
	require.JSONEq(t, first.Body.String(), duplicate.Body.String())
	// Recomposition is a new router after process/browser reconnect, same DB/key.
	copied := *f.handler
	f.handler = &copied
	f.recompose(t)
	receipt := f.request("GET", "/api/repos/sponsor/public/guest/conversions/"+key, nil, "")
	require.JSONEq(t, first.Body.String(), receipt.Body.String())
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, true))
	require.JSONEq(t, first.Body.String(), f.convert(key, conversionInput).Body.String())
	require.Equal(t, int64(1), f.calls.Load())
	require.Equal(t, int64(1), f.compiles.Load())
	var count int
	var bound, charged int64
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*),sum(bound_nanos)::bigint,sum(charged_nanos)::bigint FROM guest_reservations`).Scan(&count, &bound, &charged))
	require.Equal(t, 1, count)
	require.Equal(t, int64(100_000_000), bound)
	require.Equal(t, bound, charged)
	f.cookie = &http.Cookie{Name: f.cookie.Name, Value: strings.Repeat("0", 64)}
	require.Equal(t, 404, f.request("GET", "/api/repos/sponsor/public/guest/conversions/"+key, nil, "").Code)
}
func TestConversionWorkerBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name, state, code string
		worker            http.HandlerFunc
		timeout           time.Duration
	}{
		{name: "diagnostics", state: "diagnostics", worker: func(w http.ResponseWriter, _ *http.Request) { compileReply(w, 1) }},
		{name: "timeout", state: "failed", code: "compile_unavailable", timeout: 25 * time.Millisecond, worker: func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }},
		{name: "oversize", state: "failed", code: "compile_response_invalid", worker: func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, strings.Repeat("x", 65537)) }},
		{name: "missing-exit", state: "failed", code: "compile_response_invalid", worker: func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, `{"effeckVersion":"0.0.1"}`) }},
		{name: "redirect", state: "failed", code: "compile_unavailable", worker: func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/credential-leak", 302) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newConversionFixture(t, tc.worker)
			f.handler.CompileTimeout = tc.timeout
			key := uuid.NewString()
			response := f.convert(key, conversionInput)
			result := conversionValue(t, response)
			require.Equal(t, tc.state, result.State)
			require.Equal(t, tc.code, result.Refusal)
			require.JSONEq(t, response.Body.String(), f.convert(key, conversionInput).Body.String())
			require.Equal(t, int64(1), f.calls.Load())
			require.Equal(t, int64(1), f.compiles.Load())
		})
	}
}
func TestConversionAdmissionSharedWithChat(t *testing.T) {
	t.Run("nonallowlisted", func(t *testing.T) {
		f := newConversionFixture(t, nil)
		f.handler.Config.Repositories = nil
		require.Equal(t, 403, f.convert(uuid.NewString(), conversionInput).Code)
		require.Zero(t, f.calls.Load())
	})
	t.Run("kill-switch", func(t *testing.T) {
		f := newConversionFixture(t, nil)
		require.NoError(t, guest.SetSuspended(context.Background(), f.pool, true))
		result := conversionValue(t, f.convert(uuid.NewString(), conversionInput))
		require.Equal(t, "guest_disabled", result.Refusal)
		require.Zero(t, f.calls.Load())
	})
	t.Run("conversion-blocks-chat", func(t *testing.T) {
		f := newConversionFixture(t, nil)
		f.handler.Config.DailyNanos = 100_000_000
		require.Equal(t, "compiled", conversionValue(t, f.convert(uuid.NewString(), conversionInput)).State)
		require.Equal(t, 429, f.chat(uuid.NewString()).Code)
		require.Equal(t, int64(1), f.calls.Load())
	})
	t.Run("chat-blocks-conversion", func(t *testing.T) {
		f := newGuestFixture(t, config.AuthModeMultitenant, nil)
		require.Equal(t, 200, f.chat(uuid.NewString()).Code)
		f.handler.Source = guestRepositorySource{queries: db.New(f.pool), host: conversionHost{}}
		f.handler.Config.ReceiptSeed = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
		f.handler.Config.CompileEndpoint = "http://127.0.0.1:49401"
		f.handler.Config.DailyNanos = 100_000_000
		result := conversionValue(t, f.request("POST", "/api/repos/sponsor/public/guest/conversions", map[string]string{"input": conversionInput, "idempotencyKey": uuid.NewString(), "sourceLabel": "hn"}, ""))
		require.Equal(t, "guest_daily_cap", result.Refusal)
		require.Equal(t, int64(1), f.calls.Load())
	})
	t.Run("ip-cap", func(t *testing.T) {
		f := newConversionFixture(t, nil)
		f.handler.Config.RequestsPerIP = 1
		require.Equal(t, "compiled", conversionValue(t, f.convert(uuid.NewString(), conversionInput)).State)
		require.Equal(t, "guest_ip_cap", conversionValue(t, f.convert(uuid.NewString(), conversionInput)).Refusal)
		require.Equal(t, int64(1), f.calls.Load())
	})
}
func TestConversionConcurrentReconnectAndInterruptedClaim(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	f := newConversionFixture(t, func(w http.ResponseWriter, r *http.Request) { close(entered); <-release; compileReply(w, 0) })
	key := uuid.NewString()
	done := make(chan *httptest.ResponseRecorder, 1)
	body, _ := json.Marshal(map[string]string{"input": conversionInput, "idempotencyKey": key, "sourceLabel": "direct"})
	request := httptest.NewRequest("POST", "/api/repos/sponsor/public/guest/conversions", bytes.NewReader(body))
	request.RemoteAddr = "192.0.2.1:1234"
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(f.cookie)
	callCtx, cancel := context.WithCancel(request.Context())
	defer cancel()
	go func() {
		response := httptest.NewRecorder()
		f.router.ServeHTTP(response, request.WithContext(callCtx))
		done <- response
	}()
	<-entered
	cancel() // Disconnect after dispatch; the claimed result must still persist.
	pending := f.convert(key, conversionInput)
	require.Equal(t, 202, pending.Code)
	require.Equal(t, int64(1), f.calls.Load())
	close(release)
	require.Equal(t, "compiled", conversionValue(t, <-done).State)
	orphan := uuid.NewString()
	_, err := f.pool.Exec(context.Background(), `INSERT INTO guest_conversions(repository_id,session_hash,request_key,id,revision,created_at) SELECT repository_id,session_hash,$1,$2,revision,now()-interval '2 minutes' FROM guest_conversions LIMIT 1`, orphan, uuid.NewString())
	require.NoError(t, err)
	result := conversionValue(t, f.convert(orphan, conversionInput))
	require.Equal(t, "conversion_interrupted", result.Refusal)
	require.Equal(t, int64(1), f.calls.Load())
}
func TestConversionDiagnosticsExcludeContentAndAlert(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	f := newConversionFixture(t, nil)
	f.handler.Config.DailyNanos = 200_000_000
	require.Equal(t, "compiled", conversionValue(t, f.convert(uuid.NewString(), conversionInput)).State)
	for _, secret := range []string{conversionInput, conversionOutput, "Fixture conversion prompt", f.cookie.Value, "192.0.2.1"} {
		require.NotContains(t, logs.String(), secret)
	}
	require.Contains(t, logs.String(), "duration_ms")
	require.Contains(t, logs.String(), "compile")
	var alerts int
	require.NoError(t, f.pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE source_type='guest_spend'`).Scan(&alerts))
	require.Equal(t, 1, alerts)
}
func TestConversionWorkerProxyBoundary(t *testing.T) {
	f := newConversionFixture(t, nil)
	f.handler.Config.ProxyOrigin = "https://effeck.dev"
	f.handler.Config.ProxySecret = strings.Repeat("p", 32)
	request := func(method, path, session string, body any, authorized bool) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "/api/guest-proxy/repos/sponsor/public/"+path, bytes.NewReader(raw))
		r.Header.Set("Origin", "https://effeck.dev")
		r.Header.Set("X-Smithers-Guest-IP", "198.51.100.2")
		if authorized {
			r.Header.Set("X-Smithers-Guest-Proxy", f.handler.Config.ProxySecret)
		}
		r.Header.Set("X-Smithers-Guest-Session", session)
		r.Header.Set("Content-Type", "application/json")
		r.AddCookie(f.cookie)
		w := httptest.NewRecorder()
		f.router.ServeHTTP(w, r)
		return w
	}
	require.Equal(t, 403, request("GET", "session", "", nil, false).Code)
	boot := request("GET", "session", "", nil, true)
	require.Equal(t, 200, boot.Code, boot.Body.String())
	require.Empty(t, boot.Header().Get("Set-Cookie"))
	session := boot.Header().Get("X-Smithers-Guest-Session")
	require.Len(t, session, 64)
	payload := map[string]string{"input": conversionInput, "idempotencyKey": uuid.NewString(), "sourceLabel": "share"}
	result := conversionValue(t, request("POST", "conversions", session, payload, true))
	require.Equal(t, "compiled", result.State)
	require.Equal(t, int64(1), f.calls.Load())
	require.Equal(t, 429, request("POST", "conversions", "", payload, true).Code, "a forwarded host cookie cannot supply the guest capability")
}

func TestConversionKillSwitchCancelsCompiler(t *testing.T) {
	entered := make(chan struct{})
	f := newConversionFixture(t, func(w http.ResponseWriter, r *http.Request) { close(entered); <-r.Context().Done() })
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- f.convert("kill-active", conversionInput) }()
	<-entered
	require.NoError(t, guest.SetSuspended(context.Background(), f.pool, true))
	select {
	case response := <-done:
		require.Equal(t, "failed", conversionValue(t, response).State)
	case <-time.After(3 * time.Second):
		t.Fatal("compiler was not cancelled by shared kill switch")
	}
	require.Equal(t, int64(1), f.calls.Load())
	require.Equal(t, int64(1), f.compiles.Load())
}
