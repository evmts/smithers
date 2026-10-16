package modelproxy

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type observationCaller struct{}

func (observationCaller) ResolveModelCaller(*http.Request) (Caller, error) {
	return Caller{Source: SourceApp, Reference: "turn-1"}, nil
}

func TestProxyHandlerCorrelatesAnAuthenticatedRequestBeforeReadingItsBody(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	handler := &Handler{Keys: StaticKeys{"cerebras": "key-secret-sentinel"}, Callers: observationCaller{}}
	r := httptest.NewRequest("POST", Path+"/cerebras/v1/chat/completions", strings.NewReader("malformed-private-body-sentinel"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, r)
	require.Equal(t, 400, response.Code)
	var end map[string]any
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	require.Len(t, lines, 2)
	require.NoError(t, json.Unmarshal([]byte(lines[1]), &end))
	require.Equal(t, "turn-1", end["reference"])
	require.Equal(t, float64(400), end["status"])
	require.NotContains(t, logs.String(), "private-body-sentinel")
	require.NotContains(t, logs.String(), "key-secret-sentinel")
}

func TestProxyObservationPreservesFlushAndRecordsSafeAuthenticatedCorrelation(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	r := httptest.NewRequest("POST", Path+"/cerebras/v1/chat/completions?private=url-secret-sentinel", strings.NewReader("prompt-secret-sentinel"))
	r.Header.Set("Authorization", "Bearer caller-secret-sentinel")
	response := httptest.NewRecorder()
	w, finish := observeRequest(response, r, Caller{Source: SourceApp, Reference: "turn-1"}, "cerebras")
	w.Header().Set("Content-Type", "text/event-stream")
	_, err := io.WriteString(w, "data: response-secret-sentinel\n\n")
	require.NoError(t, err)
	w.(http.Flusher).Flush()
	require.True(t, response.Flushed, "instrumentation must not buffer SSE")
	finish()
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	require.Len(t, lines, 2)
	var start, end map[string]any
	require.NoError(t, json.Unmarshal([]byte(lines[0]), &start))
	require.NoError(t, json.Unmarshal([]byte(lines[1]), &end))
	require.Equal(t, "model proxy request started", start["msg"])
	require.Equal(t, "model proxy request finished", end["msg"])
	require.Equal(t, "turn-1", start["reference"])
	require.Equal(t, "turn-1", end["reference"])
	require.Equal(t, float64(200), end["status"])
	require.Equal(t, float64(response.Body.Len()), end["response_bytes"])
	require.Contains(t, end, "elapsed_ms")
	for _, secret := range []string{"caller-secret-sentinel", "prompt-secret-sentinel", "response-secret-sentinel", "url-secret-sentinel"} {
		require.NotContains(t, logs.String(), secret)
	}
}
