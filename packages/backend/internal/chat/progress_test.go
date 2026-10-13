package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/stretchr/testify/require"
)

type progressLogBuffer struct {
	mu sync.Mutex
	bytes.Buffer
}

func (b *progressLogBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.Write(p)
}

func (b *progressLogBuffer) text() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.String()
}

func TestBlockedHostReportsItsLastStageAndSafeCorrelation(t *testing.T) {
	arrived, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	finish := func() { once.Do(func() { close(release) }) }
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		close(arrived)
		<-release
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	defer finish()
	grant := ProducerGrant{TurnID: "turn-1", RunID: "run-1", Generation: 3, Token: "producer-secret-sentinel", Request: json.RawMessage(`{"prompt":"private-prompt-sentinel"}`)}
	var logs progressLogBuffer
	progress := newTurnProgress(grant, slog.New(slog.NewJSONHandler(&logs, nil)))
	ctx := ports.WithChatProgress(t.Context(), progress.observe)
	ports.ReportChatProgress(ctx, ports.ChatStageSandboxCreated, "sandbox-1")
	host, err := NewHTTPChatHost(server.URL, server.Client(), "host-secret-sentinel")
	require.NoError(t, err)
	done := make(chan error, 1)
	go func() { done <- host.RunChatTurn(ctx, grant) }()
	<-arrived
	progress.waiting()
	var waiting map[string]any
	for _, line := range strings.Split(strings.TrimSpace(logs.text()), "\n") {
		var record map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &record))
		if record["msg"] == "chat turn awaiting progress" {
			waiting = record
		}
	}
	require.Equal(t, "host_request", waiting["stage"], "the blocked HTTP request remains distinguishable from model resolution or sandbox creation")
	require.Equal(t, "turn-1", waiting["turn_id"])
	require.Equal(t, "run-1", waiting["run_id"])
	require.Equal(t, float64(3), waiting["generation"])
	require.Equal(t, "sandbox-1", waiting["sandbox_id"])
	require.Contains(t, waiting, "stage_elapsed_ms")
	finish()
	require.NoError(t, <-done)
	require.Contains(t, logs.text(), `"stage":"host_response"`)
	require.Contains(t, logs.text(), `"stage":"host_body"`)
	for _, secret := range []string{"producer-secret-sentinel", "host-secret-sentinel", "private-prompt-sentinel", server.URL} {
		require.NotContains(t, logs.text(), secret)
	}
}

func TestChatProgressObserversAreLocalAndOptional(t *testing.T) {
	ports.ReportChatProgress(context.Background(), ports.ChatStageModel, "")
	ports.ReportChatProgress(ports.WithChatProgress(context.Background(), nil), ports.ChatStageModel, "")
	var seen []ports.ChatProgress
	ctx := ports.WithChatProgress(context.Background(), func(event ports.ChatProgress) { seen = append(seen, event) })
	ports.ReportChatProgress(ctx, ports.ChatStageModel, "")
	ports.ReportChatProgress(context.Background(), ports.ChatStageCleanup, "")
	require.Equal(t, []ports.ChatProgress{{Stage: ports.ChatStageModel}}, seen)
}

func TestProducerCallbackLogsRejectArbitraryIdentityAndExcludeRequestSecrets(t *testing.T) {
	var logs progressLogBuffer
	handler := &Handler{logger: slog.New(slog.NewJSONHandler(&logs, nil))}
	r := httptest.NewRequest("POST", ProviderStartedPath+"?credential=url-secret-sentinel", strings.NewReader("private-body-sentinel"))
	r.Header.Set("Authorization", "Bearer producer-secret-sentinel")
	handler.logProducerCallback(r, "commit", "invalid\nprivate-identity-sentinel", 1, "invalid", 2)
	require.Empty(t, logs.text())
	handler.logProducerCallback(r, "commit", "7e5fc00f-8f6b-47ca-9149-c9554031a2b4", 3, "producer_fenced", 2)
	var record map[string]any
	require.NoError(t, json.Unmarshal([]byte(logs.text()), &record))
	require.Equal(t, "producer_fenced", record["code"])
	require.Equal(t, float64(2), record["frame_count"])
	for _, secret := range []string{"url-secret-sentinel", "producer-secret-sentinel", "private-body-sentinel", "private-identity-sentinel"} {
		require.NotContains(t, logs.text(), secret)
	}
}
