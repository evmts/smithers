package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/modelhost"
	"github.com/smithersai/smithers/packages/backend/ports"
)

type responseModelLease struct {
	server *httptest.Server
	closed bool
}

func (l *responseModelLease) Endpoint() (string, *http.Client, string) {
	return l.server.URL, l.server.Client(), "private-token"
}

func (l *responseModelLease) Close(context.Context) error {
	l.closed = true
	return errors.New("cleanup failure")
}

type responseModelLauncher struct{ lease *responseModelLease }

func (l responseModelLauncher) LaunchChatHost(context.Context, ports.ChatTurnGrant, modelhost.Binding) (modelhost.Lease, error) {
	return l.lease, nil
}

func TestModelStreamClassifiesPrivateHostRefusals(t *testing.T) {
	for _, tc := range []struct {
		upstream int
		status   int
		code     string
	}{
		{http.StatusBadRequest, http.StatusBadRequest, "request_invalid"},
		{http.StatusUnauthorized, http.StatusBadGateway, "model_unavailable"},
		{http.StatusTooManyRequests, http.StatusBadGateway, "model_unavailable"},
		{http.StatusBadGateway, http.StatusBadGateway, "model_unavailable"},
	} {
		t.Run(http.StatusText(tc.upstream), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/v1/model/stream", r.URL.Path)
				w.WriteHeader(tc.upstream)
				_, _ = io.WriteString(w, `{"status":"error"}`)
			}))
			defer server.Close()
			lease := &responseModelLease{server: server}
			host, err := modelhost.New(modelhost.ResolverFunc(func(context.Context, int64, int64, json.RawMessage) (modelhost.Binding, error) {
				return modelhost.Binding{}, nil
			}), responseModelLauncher{lease})
			require.NoError(t, err)
			w := httptest.NewRecorder()
			NewModelStreamHandler(host).ServeHTTP(w, signedIn(httptest.NewRequest(http.MethodPost, "/api/model/stream", strings.NewReader(`{}`))))
			require.Equal(t, tc.status, w.Code)
			require.JSONEq(t, `{"status":"error","code":"`+tc.code+`"}`, w.Body.String())
			require.True(t, lease.closed)
		})
	}
}

type unexpectedModelLauncher struct{ t *testing.T }

func (l unexpectedModelLauncher) LaunchChatHost(context.Context, ports.ChatTurnGrant, modelhost.Binding) (modelhost.Lease, error) {
	l.t.Fatal("invalid request launched a host")
	return nil, nil
}

func TestModelStreamRejectsInvalidJSONObjects(t *testing.T) {
	for _, body := range []string{"{", "null", "[]", `"text"`, "1", "true", "false", "{} {}", "{} trailing"} {
		t.Run(body, func(t *testing.T) {
			host, err := modelhost.New(modelhost.ResolverFunc(func(context.Context, int64, int64, json.RawMessage) (modelhost.Binding, error) {
				t.Fatal("invalid request reached model resolution")
				return modelhost.Binding{}, nil
			}), unexpectedModelLauncher{t})
			require.NoError(t, err)
			r := signedIn(httptest.NewRequest(http.MethodPost, "/api/model/stream", strings.NewReader(body)))
			w := httptest.NewRecorder()
			NewModelStreamHandler(host).ServeHTTP(w, r)
			require.Equal(t, http.StatusBadRequest, w.Code)
			require.JSONEq(t, `{"status":"error","code":"request_invalid"}`, w.Body.String())
		})
	}
}

type recordingModelStream struct{ request ports.ModelStreamGrant }

func (h *recordingModelStream) RunModelStream(_ context.Context, grant ports.ModelStreamGrant) (io.ReadCloser, error) {
	h.request = grant
	return io.NopCloser(strings.NewReader("{}\n")), nil
}

func TestModelStreamPreservesObjectBytesAtPortBoundaryAndLeavesSchemaToHost(t *testing.T) {
	for _, body := range []string{`{}`, " \n{\"messages\":[],\"number\":9007199254740993,\"future\":1e1000} \t"} {
		host := &recordingModelStream{}
		w := httptest.NewRecorder()
		NewModelStreamHandler(host).ServeHTTP(w, signedIn(httptest.NewRequest(http.MethodPost, "/api/model/stream", strings.NewReader(body))))
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, body, string(host.request.Request))
		require.EqualValues(t, 42, host.request.OwnerID)
	}
}

func TestModelStreamChecksMethodAndAuthenticationBeforeJSON(t *testing.T) {
	for _, tc := range []struct {
		method string
		status int
	}{{http.MethodGet, http.StatusMethodNotAllowed}, {http.MethodPost, http.StatusUnauthorized}} {
		w := httptest.NewRecorder()
		NewModelStreamHandler(nil).ServeHTTP(w, httptest.NewRequest(tc.method, "/api/model/stream", strings.NewReader("{")))
		require.Equal(t, tc.status, w.Code)
	}
}

// refusingModelLauncher is a deployment launcher that refuses the way the one
// that cost a release lane a day did: with store text of its own, naming the
// branch that refused. A launcher may also refuse without naming anything.
type refusingModelLauncher struct {
	named bool
	turns []string
}

const launcherRefusalText = "ERROR: relation \"repo_gateways\" does not exist (SQLSTATE 42P01)"

func (l *refusingModelLauncher) LaunchChatHost(_ context.Context, grant ports.ChatTurnGrant, _ modelhost.Binding) (modelhost.Lease, error) {
	l.turns = append(l.turns, grant.TurnID)
	err := errors.New("chat egress entitlement: " + launcherRefusalText)
	if !l.named {
		return nil, err
	}
	return nil, ports.RefuseModelStream(err, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, "")
}

// model_unavailable is the one code this route publishes for every cause
// nobody mapped, so the answer by itself names no branch. On 2026-10-15 a
// composed owner-chat test failed with exactly this answer and no provider
// event, identically on a new pin and on the pin production was serving: the
// A/B could prove it was not a regression and could not say what refused.
// The record has to, and in bounded words only — the error it accompanies
// carries a store's own text, which never belongs in a log line.
func TestModelStreamRecordsWhichBranchRefusedWithoutItsText(t *testing.T) {
	for _, tc := range []struct {
		name   string
		named  bool
		stage  ports.ChatStage
		reason ports.ModelStreamReason
	}{
		{"named by the launcher", true, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable},
		// A launcher that named nothing is labelled by its caller, which can
		// only say that the launch refused: sandbox_create, the stage the
		// launcher reports on entry. Coarse, and still the branch an operator
		// needs; the launcher's own step record, joined by the correlation
		// id, is what distinguishes the operations under it.
		{"named by its caller", false, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			launcher := &refusingModelLauncher{named: tc.named}
			host, err := modelhost.New(modelhost.ResolverFunc(func(context.Context, int64, int64, json.RawMessage) (modelhost.Binding, error) {
				return modelhost.Binding{}, nil
			}), launcher)
			require.NoError(t, err)

			var log bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&log, &slog.HandlerOptions{Level: slog.LevelDebug})))
			defer slog.SetDefault(previous)

			w := httptest.NewRecorder()
			NewModelStreamHandler(host).ServeHTTP(w, signedIn(httptest.NewRequest(http.MethodPost, "/api/model/stream", strings.NewReader(`{}`))))

			// The answer the serving UI protocol reads is unchanged.
			require.Equal(t, http.StatusBadGateway, w.Code)
			require.JSONEq(t, `{"status":"error","code":"model_unavailable"}`, w.Body.String())

			recorded := log.String()
			require.Contains(t, recorded, "model stream refused")
			require.Contains(t, recorded, "stage="+string(tc.stage))
			require.Contains(t, recorded, "reason="+string(tc.reason))
			require.NotContains(t, recorded, launcherRefusalText, "a refusal record carries bounded words, never the error's own text")
			require.NotContains(t, w.Body.String(), "repo_gateways")

			// The correlation id is the stream's own run id, which joins this
			// line to the deployment adapter's launch-step lines for the turn
			// "model-stream-"+id. It is a bounded identifier and nothing else.
			correlation := correlationOf(t, recorded)
			require.Len(t, correlation, 36)
			require.Regexp(t, `^[0-9a-f-]{36}$`, correlation)
			require.Equal(t, []string{"model-stream-" + correlation}, launcher.turns,
				"the record's correlation id must be the turn the deployment adapter logs against")
		})
	}
}

func correlationOf(t *testing.T, recorded string) string {
	t.Helper()
	_, after, found := strings.Cut(recorded, "correlation_id=")
	require.True(t, found, "a refusal record must carry the stream's correlation id: %s", recorded)
	field, _, _ := strings.Cut(strings.TrimSpace(after), " ")
	return field
}

// An error no branch named reports unclassified rather than borrowing the
// nearest cause: the catch-all already publishes one story for every unmapped
// cause, and a diagnostic that invents a second is worse than none.
func TestModelStreamReportsAnUnnamedRefusalAsUnclassified(t *testing.T) {
	stage, reason, correlation := ports.ModelStreamDiagnostic(errors.New("nobody named this"))
	require.Empty(t, string(stage))
	require.Equal(t, ports.ReasonUnclassified, reason)
	require.Empty(t, correlation)
}
