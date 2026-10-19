package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// capturedLog is one slog record flattened to the text an operator would
// actually read: the message plus every attribute key and rendered value.
// Asserting on the flattened text, rather than on a chosen attribute, is the
// point — a leak that arrived through an unexpected key is still a leak.
type capturedLog struct {
	level slog.Level
	msg   string
	attrs map[string]string
	text  string
}

type capturingLogHandler struct {
	mu      sync.Mutex
	records *[]capturedLog
}

func (h *capturingLogHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *capturingLogHandler) Handle(_ context.Context, r slog.Record) error {
	entry := capturedLog{level: r.Level, msg: r.Message, attrs: map[string]string{}}
	parts := []string{r.Message}
	r.Attrs(func(a slog.Attr) bool {
		value := a.Value.String()
		entry.attrs[a.Key] = value
		parts = append(parts, a.Key+"="+value)
		return true
	})
	entry.text = strings.Join(parts, " ")
	h.mu.Lock()
	defer h.mu.Unlock()
	*h.records = append(*h.records, entry)
	return nil
}

func (h *capturingLogHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *capturingLogHandler) WithGroup(string) slog.Handler      { return h }

// captureReconcilerLogs installs the capturing handler as the default logger
// for one test. The reconciler logs through the package-level slog, so this is
// the real logging boundary and not a seam introduced for the test.
func captureReconcilerLogs(t *testing.T) *[]capturedLog {
	t.Helper()
	records := &[]capturedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(&capturingLogHandler{records: records}))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return records
}

func warnings(records *[]capturedLog, msg string) []capturedLog {
	var out []capturedLog
	for _, record := range *records {
		if record.level == slog.LevelWarn && record.msg == msg {
			out = append(out, record)
		}
	}
	return out
}

// maliciousAdapterError is what a hosted runtime is actually allowed to hand
// back. Its Error() is arbitrary text, and the recovery runs against a worker
// over HTTP, so the text can carry an endpoint, a bearer credential, a request
// id and a customer's own prose — plus the ids the adapter was called with.
const (
	leakURL      = "https://worker-17.internal.smithers.example/v1/sandboxes/stop"
	leakToken    = "Bearer sk-live-c0ffee-DO-NOT-LOG"
	leakProse    = "while finishing Acme Corp's payroll migration branch"
	leakHeader   = "x-smithers-request-id: 4f9a1d22-prod"
	leakRowID    = "ws-interrupted-diagnostics"
	leakVMID     = "vm-interrupted-diagnostics"
	leakSentence = "POST " + leakURL + " failed: " + leakToken + "; " + leakHeader +
		"; workspace=" + leakRowID + " vm=" + leakVMID + "; " + leakProse
)

func maliciousAdapterError() error { return errors.New(leakSentence) }

// requireNoLeak holds the whole contract in one place: every secret, every
// identifier and every fragment of customer prose is absent from the rendered
// record, and the record is not empty of diagnosis either.
func requireNoLeak(t *testing.T, record capturedLog) {
	t.Helper()
	for _, secret := range []string{
		leakSentence, leakURL, leakToken, leakProse, leakHeader,
		leakRowID, leakVMID,
		// Fragments, so a partial or truncated copy is caught too.
		"worker-17", "sk-live-c0ffee", "Acme", "4f9a1d22", "payroll",
		"https://", "Bearer", "POST ",
	} {
		require.NotContainsf(t, record.text, secret,
			"the reconciler's diagnostic leaked %q", secret)
	}
	require.NotEmpty(t, record.attrs["stage"], "a refusal with no stage diagnoses nothing")
	require.NotEmpty(t, record.attrs["reason"], "a refusal with no reason diagnoses nothing")
	require.NotContains(t, record.attrs, "error", "the raw error is never an attribute")
	require.NotContains(t, record.attrs, "workspace_id", "the raw owner id is never an attribute")
}

// THE SENTINEL. An interrupted-release stop that refuses must be diagnosable
// without publishing what the adapter said. This drives the REAL reconciler
// (ReconcileWorkspaceProvisioning) over the REAL logging boundary with an
// adapter error built to leak, and proves that nothing of it — and not the
// owner's id or its placement's id — reaches the record, while the stage and
// the finite reason do.
func TestInterruptedReleaseStopDiagnosticNeverLeaksTheAdapterErrorOrTheOwnerID(t *testing.T) {
	records := captureReconcilerLogs(t)

	guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained"}
	runtime := &interruptedReleaseRuntime{guest: guest, stopErrs: []error{maliciousAdapterError()}}
	svc, q := interruptedReleaseService(t, interruptedReleaseRow(leakRowID, leakVMID), runtime)

	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	require.Empty(t, q.fence, "a refused stop is never sealed as finished")
	require.True(t, interruptedReleaseStopPending(*q.live), "the row stays in the cohort and is retried")

	logged := warnings(records, "interrupted release stop retry failed")
	require.Len(t, logged, 1, "the refusal is reported exactly once per tick")
	requireNoLeak(t, logged[0])

	require.Equal(t, string(interruptedReleaseStageStop), logged[0].attrs["stage"],
		"the stage names the step that refused")
	require.Equal(t, "internal", logged[0].attrs["reason"],
		"an unclassifiable adapter refusal still reports a REGISTERED code, not its sentence")
	require.NotContains(t, logged[0].attrs, "stop_evidence",
		"no confirming read ran, so there is no evidence to report")

	// The correlation identifies the row across ticks without being its id.
	digest := sha256.Sum256([]byte(leakRowID))
	require.Equal(t, hex.EncodeToString(digest[:])[:12], logged[0].attrs["workspace"])
	require.NotEqual(t, leakRowID, logged[0].attrs["workspace"])

	// Stable: the second tick's refusal correlates with the first.
	runtime.stopErrs = []error{maliciousAdapterError()}
	require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
	logged = warnings(records, "interrupted release stop retry failed")
	require.Len(t, logged, 2)
	requireNoLeak(t, logged[1])
	require.Equal(t, logged[0].attrs["workspace"], logged[1].attrs["workspace"])
}

// The confirming read's ten-value vocabulary is a diagnosis, not a status
// flag: "the guest is still running" and "the host never answered" need
// different operator actions, so the record must keep them apart instead of
// collapsing every unconfirmed attempt into one opaque failure. Every
// non-receipt value reaches the log as itself, with no adapter text beside it.
func TestInterruptedReleaseStopDiagnosticKeepsEveryStopEvidenceDistinct(t *testing.T) {
	for _, tc := range []struct {
		name     string
		state    workspaceapi.WorkspaceState
		observed string
		inspect  error
		evidence releaseStopEvidence
	}{
		{name: "running", state: workspaceapi.WorkspaceRunning, evidence: releaseStopObservedRunning},
		{name: "starting", state: workspaceapi.WorkspaceStarting, evidence: releaseStopObservedStarting},
		{name: "stopping", state: workspaceapi.WorkspaceStopping, evidence: releaseStopObservedStopping},
		{name: "other", state: workspaceapi.WorkspaceRecoveryRequired, evidence: releaseStopObservedOther},
		{name: "identity mismatch", state: workspaceapi.WorkspaceStopped,
			observed: "ws-somebody-else", evidence: releaseStopIdentityMismatch},
		{name: "ambiguous absence", inspect: workspaceapi.ErrWorkspaceNotFound,
			evidence: releaseStopAbsenceAmbiguous},
		{name: "typed lost worker", evidence: releaseStopWorkerLost,
			inspect: &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "host_lease_lost"}},
		{name: "unreadable", inspect: maliciousAdapterError(), evidence: releaseStopUnreadable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			records := captureReconcilerLogs(t)
			guest := &interruptedReleaseGuest{state: tc.state, disk: "retained"}
			runtime := &interruptedReleaseRuntime{
				guest: guest, observedID: tc.observed, inspectErr: tc.inspect,
				// The stop answers the way an adapter answers one it could not
				// confirm, so the attempt reaches the confirming read.
				stopErrs: []error{workspaceapi.ErrWorkspaceStopped},
			}
			svc, q := interruptedReleaseService(t, interruptedReleaseRow(leakRowID, leakVMID), runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Empty(t, q.fence)

			logged := warnings(records, "interrupted release stop retry failed")
			require.Len(t, logged, 1)
			requireNoLeak(t, logged[0])
			require.Equal(t, string(interruptedReleaseStageConfirm), logged[0].attrs["stage"])
			require.Equal(t, string(tc.evidence), logged[0].attrs["stop_evidence"],
				"the specific evidence survives to the operator, uncollapsed")
			require.Equal(t, "service_unavailable", logged[0].attrs["reason"],
				"an unconfirmed stop is the retryable refusal, by its registered code")
		})
	}
}

// The vocabulary itself stays closed and ten values wide. A later change that
// merges two labels, or adds an eleventh without a decision, fails here.
func TestReleaseStopEvidenceVocabularyStaysClosedAndDistinct(t *testing.T) {
	all := []releaseStopEvidence{
		releaseStopConfirmedStopped, releaseStopConfirmedUnbound,
		releaseStopObservedRunning, releaseStopObservedStarting,
		releaseStopObservedStopping, releaseStopObservedOther,
		releaseStopIdentityMismatch, releaseStopAbsenceAmbiguous,
		releaseStopWorkerLost, releaseStopUnreadable,
	}
	seen := map[releaseStopEvidence]bool{}
	for _, evidence := range all {
		require.NotEmpty(t, string(evidence))
		require.False(t, seen[evidence], "two stop-evidence values collapsed onto %q", evidence)
		seen[evidence] = true
	}
	require.Len(t, seen, 10, "the closed stop-evidence vocabulary is ten values wide")
}

// Only a registered pkgerrors code reaches the log as a reason, because the
// registry is the closed vocabulary. An unregistered code, and a bare error
// with no code at all, both read as a written label.
func TestInterruptedReleaseStopReasonIsAlwaysFinite(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want interruptedReleaseStopReason
	}{
		{name: "no failure", err: nil, want: ""},
		{name: "cancelled", err: fmt.Errorf("wrapped: %w", context.Canceled),
			want: interruptedReleaseReasonCanceled},
		{name: "expired", err: fmt.Errorf("wrapped: %w", context.DeadlineExceeded),
			want: interruptedReleaseReasonDeadline},
		{name: "bare adapter sentence", err: maliciousAdapterError(),
			want: interruptedReleaseReasonUnclassified},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reason := interruptedReleaseStopReasonFor(tc.err)
			require.Equal(t, tc.want, reason)
			require.NotContains(t, string(reason), leakURL)
			require.NotContains(t, string(reason), leakToken)
			require.NotContains(t, string(reason), leakRowID)
		})
	}
}

// blockingStopRuntime answers no stop until its context ends, and records the
// deadline the service handed it.
type blockingStopRuntime struct {
	*interruptedReleaseRuntime
	entered  chan struct{}
	mu       sync.Mutex
	deadline time.Time
	hadOne   bool
}

func (r *blockingStopRuntime) StopWorkspace(ctx context.Context, _ string) error {
	deadline, ok := ctx.Deadline()
	r.mu.Lock()
	r.deadline, r.hadOne = deadline, ok
	r.mu.Unlock()
	select {
	case r.entered <- struct{}{}:
	default:
	}
	<-ctx.Done()
	return ctx.Err()
}

// The stop an interrupted-release recovery drives has its OWN finite bound.
// stopRuntimeWorkspaceLocked supplies none — it passes the caller's context to
// the runtime port unchanged — and the reconciler tick has none either, so an
// adapter that never answers would otherwise hold this tick, and with it every
// other row in the listing, for the life of the process. The confirming read's
// workspaceReleaseConfirmTimeout does not cover the stop: the two bounds are
// separate, which is why both are written constants.
func TestInterruptedReleaseStopIsBoundedAndCancellable(t *testing.T) {
	t.Run("the stop carries its own deadline", func(t *testing.T) {
		records := captureReconcilerLogs(t)
		base := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning}}
		runtime := &blockingStopRuntime{interruptedReleaseRuntime: base, entered: make(chan struct{}, 1)}
		svc, q := interruptedReleaseService(t, interruptedReleaseRow(leakRowID, leakVMID), runtime)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			_ = svc.ReconcileWorkspaceProvisioning(ctx)
		}()
		select {
		case <-runtime.entered:
		case <-time.After(10 * time.Second):
			t.Fatal("the recovery never reached the runtime stop")
		}
		runtime.mu.Lock()
		deadline, hadOne := runtime.deadline, runtime.hadOne
		runtime.mu.Unlock()
		require.True(t, hadOne, "the stop ran with no deadline at all; one unanswering adapter holds the tick forever")
		require.LessOrEqual(t, time.Until(deadline), workspaceReleaseStopTimeout,
			"the stop's bound is workspaceReleaseStopTimeout, not something larger")
		require.Greater(t, time.Until(deadline), time.Duration(0))

		// The same deadline is derived from the caller's context, so shutdown
		// still reaches it: the attempt is abandoned, nothing is recorded, and
		// the row stays in the cohort for the next process to re-drive.
		cancel()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Fatal("cancelling the reconciler did not end the blocked stop")
		}
		require.Empty(t, q.fence, "an abandoned stop records no receipt")
		require.True(t, interruptedReleaseStopPending(*q.live))
		for _, record := range warnings(records, "interrupted release stop retry failed") {
			requireNoLeak(t, record)
		}
	})

	t.Run("the confirming read is bounded separately", func(t *testing.T) {
		var deadline time.Time
		var hadOne bool
		base := &interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceStopped}}
		runtime := &deadlineRecordingInspectRuntime{interruptedReleaseRuntime: base,
			record: func(ctx context.Context) { deadline, hadOne = ctx.Deadline() }}
		svc, _ := interruptedReleaseService(t, interruptedReleaseRow(leakRowID, leakVMID), runtime)

		require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
		require.True(t, hadOne, "the confirming read runs under workspaceReleaseConfirmTimeout")
		require.LessOrEqual(t, time.Until(deadline), workspaceReleaseConfirmTimeout)
		require.Less(t, workspaceReleaseConfirmTimeout, workspaceReleaseStopTimeout,
			"the two bounds are separate constants, and neither covers the other")
	})
}

type deadlineRecordingInspectRuntime struct {
	*interruptedReleaseRuntime
	record func(context.Context)
}

func (r *deadlineRecordingInspectRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	r.record(ctx)
	return r.interruptedReleaseRuntime.InspectWorkspace(ctx, id)
}
