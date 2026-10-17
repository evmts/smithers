package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// advertisementRefusal is a real Git transfer refusal: status 128 with the
// server's own prose, the clone URL and the credential's header name in
// stderr, which is exactly the material that must never be recorded.
func advertisementRefusal(detail string) workspaceapi.CommandResult {
	return workspaceapi.CommandResult{
		ExitCode: 128,
		Stderr: "fatal: unable to access 'https://smithers.example/alice/demo.git/': " + detail +
			"\nAuthorization: Bearer sk-live-c0ffee-DO-NOT-LOG\nx-smithers-request-id: 4f9a1d22-prod",
	}
}

// THE OBSERVABILITY DEFECT this cohort was read from.
//
// runtimeRepositoryCommandOutput collapsed every completed refusal into one
// registered sentence and then discarded the only evidence there was: the
// status, whether the answer was even complete, how many attempts the retry
// budget spent, and whether the refusal was retryable at all. So sixteen rows
// could be counted and attributed to this door and still not diagnosed — the
// stored verdict names the door, and a door is not a cause.
//
// The sentence is unchanged, because it IS the persisted verdict. What is
// added is a finite record beside it. Every field is a written vocabulary or a
// number; nothing from stdout, stderr, the argument vector or the command
// environment is read, and the owner row is a correlation token rather than
// its id.
func TestWorkspaceRepositoryStepRefusalIsDiagnosableWithoutItsOutput(t *testing.T) {
	const rowID = "ws-advertisement-diagnostics"
	records := captureReconcilerLogs(t)
	runtime := &fetchRetryRuntime{results: []workspaceapi.CommandResult{
		advertisementRefusal("The requested URL returned error: 403"),
	}}
	svc := &WorkspaceService{runtime: runtime}
	row := sampleDBWorkspace(rowID)

	_, err := svc.runtimeRepositorySourceEmpty(context.Background(), row, row.UserID,
		"https://smithers.example/alice/demo.git", map[string]string{"GIT_CONFIG_COUNT": "1"})
	require.Error(t, err)

	// The published verdict is still the registered sentence, byte for byte.
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeConflict, api.Code)
	require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, api.Message)

	// The cause carries the finite outcome and nothing else. APIError has no
	// Unwrap, so attaching it changes no errors.Is reading anywhere.
	cause, ok := api.Cause().(workspaceRepositoryStepOutcome)
	require.True(t, ok, "the collapsed refusal no longer loses its classification")
	require.Equal(t, workspaceRepositoryAdvertisementStep, cause.step)
	require.Equal(t, workspaceRepositoryExitFatal, cause.exitClass)
	require.False(t, cause.truncated)
	require.Equal(t, 1, cause.attempts, "an authentication refusal is never retried")
	require.False(t, cause.retryable)

	logged := warnings(records, "workspace repository step could not be verified")
	require.Len(t, logged, 1)
	for _, secret := range []string{
		"sk-live-c0ffee", "Bearer", "Authorization", "4f9a1d22", "403",
		"https://", "smithers.example", "alice/demo", "fatal:", "git", "ls-remote",
	} {
		require.NotContainsf(t, logged[0].text, secret, "the diagnostic leaked %q", secret)
	}
	require.NotContains(t, logged[0].attrs, "workspace_id", "the raw owner id is never an attribute")
	require.NotContains(t, logged[0].attrs, "error", "the raw error is never an attribute")
	require.Equal(t, "verify_repository_step", logged[0].attrs["stage"])
	require.Equal(t, workspaceRepositoryAdvertisementStep, logged[0].attrs["step"])
	require.Equal(t, string(workspaceRepositoryExitFatal), logged[0].attrs["exit_class"])
	require.Equal(t, "false", logged[0].attrs["output_truncated"])
	require.Equal(t, "1", logged[0].attrs["attempts"])
	require.Equal(t, "false", logged[0].attrs["retry_budget_exhausted"])

	digest := sha256.Sum256([]byte(rowID))
	require.Equal(t, hex.EncodeToString(digest[:])[:12], logged[0].attrs["workspace"])
	require.NotEqual(t, rowID, logged[0].attrs["workspace"])
}

// The two refusals the old code could not tell apart: a status the command
// chose, and an answer the adapter could not return whole. They stay one
// stored sentence and become two readings.
func TestWorkspaceRepositoryStepRefusalSeparatesTruncationFromStatus(t *testing.T) {
	for _, tc := range []struct {
		name      string
		result    workspaceapi.CommandResult
		exitClass workspaceRepositoryExitClass
		truncated bool
	}{
		{
			name:      "git fatal",
			result:    workspaceapi.CommandResult{ExitCode: 128},
			exitClass: workspaceRepositoryExitFatal,
		},
		{
			name:      "git usage",
			result:    workspaceapi.CommandResult{ExitCode: 129},
			exitClass: workspaceRepositoryExitUsage,
		},
		{
			name:      "a plain nonzero status",
			result:    workspaceapi.CommandResult{ExitCode: 1},
			exitClass: workspaceRepositoryExitFailed,
		},
		{
			name:      "a signalled command",
			result:    workspaceapi.CommandResult{ExitCode: 137},
			exitClass: workspaceRepositoryExitSignaled,
		},
		{
			name:      "a negative convention",
			result:    workspaceapi.CommandResult{ExitCode: -1},
			exitClass: workspaceRepositoryExitSignaled,
		},
		{
			// A successful status whose output was cut is still a refusal:
			// "the remote advertises no refs" and "we could not read the
			// answer" must never be the same verdict. This preserves the
			// fail-closed reading of a real empty remote.
			name:      "a complete status with an incomplete answer",
			result:    workspaceapi.CommandResult{ExitCode: 0, Stdout: "some refs", OutputTruncated: true},
			exitClass: workspaceRepositoryExitTruncated,
			truncated: true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.exitClass, workspaceRepositoryExitClassFor(tc.result))
			runtime := &fetchRetryRuntime{results: []workspaceapi.CommandResult{tc.result}}
			svc := &WorkspaceService{runtime: runtime}
			row := sampleDBWorkspace("ws-advertisement-class")
			empty, err := svc.runtimeRepositorySourceEmpty(context.Background(), row, row.UserID,
				"https://smithers.example/alice/demo.git", nil)
			require.Error(t, err)
			require.False(t, empty, "an unreadable advertisement is never answered as an empty remote")

			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, workspaceRepositoryAdvertisementUnverifiedMessage, api.Message,
				"the stored verdict is one sentence; the classification is beside it")
			cause, ok := api.Cause().(workspaceRepositoryStepOutcome)
			require.True(t, ok, "the collapsed refusal no longer loses its classification")
			require.Equal(t, tc.exitClass, cause.exitClass)
			require.Equal(t, tc.truncated, cause.truncated)
		})
	}

	require.Equal(t, workspaceRepositoryExitOK,
		workspaceRepositoryExitClassFor(workspaceapi.CommandResult{ExitCode: 0}))
}

// A 503/504 admission refusal IS retried, and the record says the budget ran
// out rather than reporting the same opaque conflict as an auth failure. The
// existing retry contract is unchanged: the same four attempts, each with its
// own durable operation id, and no new retry of anything that was not
// retryable before.
func TestWorkspaceRepositoryStepRefusalReportsAnExhaustedRetryBudget(t *testing.T) {
	for _, status := range []string{"503", "504"} {
		t.Run(status, func(t *testing.T) {
			records := captureReconcilerLogs(t)
			refusal := fetchRefusal(status)
			runtime := &fetchRetryRuntime{results: []workspaceapi.CommandResult{refusal, refusal, refusal, refusal}}
			svc := &WorkspaceService{runtime: runtime}
			row := sampleDBWorkspace("ws-advertisement-budget")

			_, err := svc.runtimeRepositorySourceEmpty(context.Background(), row, row.UserID,
				"https://smithers.example/alice/demo.git", nil)
			require.Error(t, err)
			require.Len(t, runtime.commands, 4, "the retry budget is unchanged")

			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			cause, ok := api.Cause().(workspaceRepositoryStepOutcome)
			require.True(t, ok, "the collapsed refusal no longer loses its attempt count")
			require.Equal(t, 4, cause.attempts)
			require.True(t, cause.retryable, "the budget ran out on a retryable refusal")

			logged := warnings(records, "workspace repository step could not be verified")
			require.Len(t, logged, 1)
			require.Equal(t, "4", logged[0].attrs["attempts"])
			require.Equal(t, "true", logged[0].attrs["retry_budget_exhausted"])
			require.NotContains(t, logged[0].text, status, "the server's own status text is never recorded")
		})
	}
}

// The step reaches the record only as a REGISTERED value. workspace_head.go
// passes a per-call step that embeds a UUID, so an unregistered step must read
// as `other` rather than putting an identifier in an operator log.
func TestWorkspaceRepositoryStepLabelIsBounded(t *testing.T) {
	for _, step := range []string{
		workspaceRepositoryAdvertisementStep, "clone-refs", "head", "origin", "source-revision",
		"empty-jj-changes", "empty-jj-tree", "empty-jj-working-commit",
		"empty-jj-parent", "empty-jj-history", "empty-jj-description",
		"empty-local-refs", "empty-local-objects",
	} {
		require.Equal(t, step, workspaceRepositoryStepLabel(step))
	}
	for _, step := range []string{
		"head-report-3f2b1c40-0d6a-4a27-9f0e-5b2d8a1c7e44",
		"candidate-tree-3f2b1c40-0d6a-4a27-9f0e-5b2d8a1c7e44",
		"advertisement-retry-1", "", "   ", "fetch", "clone",
	} {
		require.Equal(t, workspaceRepositoryStepOther, workspaceRepositoryStepLabel(step),
			"an unregistered step is never recorded as itself")
	}
}

// The outcome's own rendering is finite too: it is attached as an APIError
// cause, which the server log publishes, so its text must carry only the
// labels above.
func TestWorkspaceRepositoryStepOutcomeRendersOnlyFiniteLabels(t *testing.T) {
	outcome := workspaceRepositoryStepOutcome{
		step:      workspaceRepositoryAdvertisementStep,
		exitClass: workspaceRepositoryExitFatal,
		attempts:  4,
		retryable: true,
	}
	require.Equal(t, "repository step advertisement unverified (fatal, attempts=4)", outcome.Error())

	args := outcome.logArgs("ws-advertisement-render")
	require.Len(t, args, 14)
	require.Equal(t, "workspace", args[0])
	require.Equal(t, workspaceCorrelationToken("ws-advertisement-render"), args[1])
	require.NotEqual(t, "ws-advertisement-render", args[1])
}
