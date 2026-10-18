package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A branch machine can disappear from its provider while the row still names
// it. On the runtime path the loss can surface on the inspect or on the start
// that follows a stopped inspect — the same two places a lost worker surfaces
// (TestWorkspaceRuntimeResumeKeepsLostWorkerResponse).
//
// The inspect arm already answered the recovery row (#3565). The start arm did
// not: it wrapped the confirmed loss in runtimeOperationError, so waking a
// suspended branch whose machine was gone answered 500 fault=bug, and the turn
// behind it said "The agent could not be started. Nothing ran; try again in a
// moment." — a retry that can never work. The sandbox-client path has answered
// workspace_vm_missing on a start 404 since #3565
// (TestPrimaryOpenAfterMissingVMKeepsRecoveryRow, case "start missing after
// stopped inspect"); the runtime path must answer the same.
func TestWorkspaceRuntimeWakeAnswersAVanishedMachineAsMissingVM(t *testing.T) {
	pool := newProductTestPool(t)
	vanished := fmt.Errorf("runtime: %w", errors.Join(workspaceapi.ErrWorkspaceNotFound,
		&sandbox.StatusError{StatusCode: http.StatusNotFound, Code: "not_found", Message: "sandbox resource was not found"}))
	for name, runtime := range map[string]lostWorkerRuntime{
		"inspect": {inspectErr: vanished},
		"start":   {startErr: vanished},
	} {
		t.Run(name, func(t *testing.T) {
			row := runtimeWakeRow(t, pool, "runtime-vanished-"+name, "suspended", "vm-vanished")
			svc := composeRuntimeWake(newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceRuntime(runtime)), pool, &countedResumePolicy{})
			_, err := svc.ensureRuntimeWorkspaceRunningLocked(context.Background(), row, row.UserID)
			failure := apiErrorOf(t, err)
			assert.Equal(t, pkgerrors.CodeWorkspaceVMMissing, failure.Code)
			assert.Equal(t, http.StatusConflict, failure.Status)
			assert.Contains(t, failure.Message, "create", "the sentence names the action that helps")
			details, ok := failure.Details.(WorkspaceRecoveryDetails)
			require.True(t, ok, "a missing machine carries its recovery details, got %#v", failure.Details)
			assert.Equal(t, row.ID, details.WorkspaceID)
			assert.True(t, details.CreateFresh)
		})
	}
}
