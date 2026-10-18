package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// Production, 2026-10-14T19:07:18Z (smithers#3912): box
// 8bdcfa88-451a-4afe-a341-2be82227c1a5 reads `running` with vm_id set while the
// controller answers 404 not_found for its placement. Its file list, its file
// read and its service list all answered
// 409 {"code":"conflict","message":"workspace is stopped"} with no details,
// while the same box's own resume answered 409 workspace_vm_missing with
// details.create_fresh — the owner half this reader half contradicts.
//
// The box is not stopped. A stopped machine starts again; this one no longer
// exists, so the sentence is false and the reader is handed no route out. The
// confirmed loss is the error #3565, #3890 and #3892 already settled on the
// owner half: name it, carry the recovery row, and promise nothing a retry
// cannot deliver. missingWorkspaceVM is that answer, and apps/app already
// consumes it (WorkspaceSeam.ts: code === "workspace_vm_missing" with
// details.create_fresh sets the card's recovery state), so the honest answer
// reaches the UI as recovery instead of a false "Asleep".
func TestAReaderOnAVanishedMachineIsToldTheMachineIsGone(t *testing.T) {
	vanished := fmt.Errorf("runtime: %w", errors.Join(workspaceapi.ErrWorkspaceNotFound,
		&sandbox.StatusError{StatusCode: http.StatusNotFound, Code: "not_found", Message: "sandbox resource was not found"}))
	gone := fmt.Errorf("inspect sandbox: %w", &sandbox.StatusError{StatusCode: http.StatusNotFound,
		Code: "not_found", Message: "sandbox resource was not found"})

	assertMissingVM := func(t *testing.T, row db.Workspace, err error) {
		t.Helper()
		failure := apiErrorOf(t, err)
		assert.Equal(t, pkgerrors.CodeWorkspaceVMMissing, failure.Code)
		assert.Equal(t, http.StatusConflict, failure.Status)
		assert.NotContains(t, failure.Message, "stopped", "a machine that no longer exists is not stopped")
		assert.Contains(t, failure.Message, "create", "the sentence names the action that helps")
		details, ok := failure.Details.(WorkspaceRecoveryDetails)
		require.True(t, ok, "a missing machine carries its recovery details, got %#v", failure.Details)
		assert.Equal(t, row.ID, details.WorkspaceID)
		assert.True(t, details.CreateFresh)
	}

	t.Run("runtime path", func(t *testing.T) {
		row := sampleDBWorkspace("ws-reader-vanished")
		q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
		svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(lostWorkerRuntime{inspectErr: vanished}))
		_, err := svc.runningRuntimeWorkspace(context.Background(), row, row.UserID)
		assertMissingVM(t, row, err)
	})

	t.Run("sandbox path", func(t *testing.T) {
		row := sampleDBWorkspace("ws-reader-gone")
		q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
		client := &mockWorkspaceSandboxVMClient{getVMFn: func(context.Context, string) (sandbox.Sandbox, error) {
			return sandbox.Sandbox{}, gone
		}}
		svc := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(client))
		_, err := svc.runningSandboxWorkspace(context.Background(), row, row.UserID)
		assertMissingVM(t, row, err)
	})

	// The guard: a machine that is merely not running keeps its own sentence.
	// Only a positively confirmed loss earns the recovery row.
	t.Run("a stopped machine still reads stopped", func(t *testing.T) {
		row := sampleDBWorkspace("ws-reader-stopped")
		q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
		svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(lostWorkerRuntime{}))
		_, err := svc.runningRuntimeWorkspace(context.Background(), row, row.UserID)
		failure := apiErrorOf(t, err)
		assert.Equal(t, http.StatusConflict, failure.Status)
		assert.Equal(t, "workspace is stopped", failure.Message)

		client := &mockWorkspaceSandboxVMClient{getVMFn: func(_ context.Context, vmID string) (sandbox.Sandbox, error) {
			return sandbox.Sandbox{ID: vmID, State: sandbox.StateStopped}, nil
		}}
		sandboxSvc := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(client))
		_, sandboxErr := sandboxSvc.runningSandboxWorkspace(context.Background(), row, row.UserID)
		sandboxFailure := apiErrorOf(t, sandboxErr)
		assert.Equal(t, http.StatusConflict, sandboxFailure.Status)
		assert.Equal(t, "workspace is stopped", sandboxFailure.Message)
	})
}
