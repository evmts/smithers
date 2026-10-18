package services

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// vanishedFileRuntime is a running machine whose file calls report the loss the
// readiness check could not have seen: #3912 fixed the check that runs BEFORE
// the file RPC, so only the machine vanishing BETWEEN the two lands here. That
// is production box 8bdcfa88-451a-4afe-a341-2be82227c1a5's exact shape — row
// `running`, vm_id set, the controller answering 404 for the placement.
type vanishedFileRuntime struct {
	*authorityRuntime
	listErr  error
	readErr  error
	writeErr error
}

// Only the person's own call fails. The checkout inspection that runs during a
// start lists the root and reads the initialization receipt; leaving those
// alone keeps each sub-test on the door it names.
func (r *vanishedFileRuntime) ListFiles(ctx context.Context, id, dir string) ([]workspaceapi.FileEntry, error) {
	if r.listErr != nil {
		return nil, r.listErr
	}
	return r.authorityRuntime.ListFiles(ctx, id, dir)
}

func (r *vanishedFileRuntime) ReadFile(ctx context.Context, id, file string) ([]byte, error) {
	if r.readErr != nil && file != workspaceRepositoryReceiptPath {
		return nil, r.readErr
	}
	return r.authorityRuntime.ReadFile(ctx, id, file)
}

func (r *vanishedFileRuntime) CompareWriteFiles(ctx context.Context, id string, changes []workspaceapi.FileMutation) (*workspaceapi.FileWriteResult, error) {
	if r.writeErr != nil {
		return nil, r.writeErr
	}
	return r.authorityRuntime.CompareWriteFiles(ctx, id, changes)
}

// smithers#3954. A file list, a file read and a file write on a machine the
// runtime confirms is gone all answered 404 "workspace … not found", because
// mapRuntimeFileError folded fs.ErrNotExist and ErrWorkspaceNotFound into one
// sentence. The contract keeps them apart: fs.ErrNotExist is the missing PATH,
// ErrWorkspaceNotFound is the machine "permanently gone". Telling a person
// their file is not there sends them looking for a file, and with no details it
// hands them no route out — the answer #3565, #3890 and #3912 settled on every
// neighbouring door is 409 workspace_vm_missing with its recovery row.
func TestAFileDoorOnAVanishedMachineNamesTheMachine(t *testing.T) {
	vanished := fmt.Errorf("read file: %w", errors.Join(workspaceapi.ErrWorkspaceNotFound,
		&sandbox.StatusError{StatusCode: http.StatusNotFound, Code: "not_found", Message: "sandbox resource was not found"}))

	newService := func(runtime *vanishedFileRuntime) *WorkspaceService {
		runtime.authorityRuntime = newAuthorityRuntime(workspaceapi.WorkspaceRunning)
		runtime.repositoryID = 101
		runtime.cloneURL = testWorkspaceGitBaseURL + "/alice/demo.git"
		return newWorkspaceServiceForTests(&repositoryIdentityQuerier{}, WithWorkspaceRuntime(runtime))
	}
	assertMissingVM := func(t *testing.T, err error) {
		t.Helper()
		failure := apiErrorOf(t, err)
		assert.Equal(t, pkgerrors.CodeWorkspaceVMMissing, failure.Code)
		assert.Equal(t, http.StatusConflict, failure.Status)
		assert.NotContains(t, failure.Message, "not found", "the machine is gone; the file is not what is missing")
		assert.Contains(t, failure.Message, "create", "the sentence names the action that helps")
		details, ok := failure.Details.(WorkspaceRecoveryDetails)
		require.True(t, ok, "a missing machine carries its recovery details, got %#v", failure.Details)
		assert.True(t, details.CreateFresh)
	}

	t.Run("list", func(t *testing.T) {
		_, err := newService(&vanishedFileRuntime{listErr: vanished}).ListWorkspaceFiles(context.Background(), "ws-1", 101, 1, "")
		assertMissingVM(t, err)
	})

	t.Run("read", func(t *testing.T) {
		_, err := newService(&vanishedFileRuntime{readErr: vanished}).ReadWorkspaceFile(context.Background(), "ws-1", 101, 1, "README.md")
		assertMissingVM(t, err)
	})

	t.Run("write", func(t *testing.T) {
		_, err := newService(&vanishedFileRuntime{writeErr: vanished}).WriteWorkspaceFiles(context.Background(), "ws-1", 101, 1,
			[]workspaceapi.FileMutation{{Path: "README.md", BaseDigest: "absent", Content: []byte("hi\n")}})
		assertMissingVM(t, err)
	})

	// The guard: a path that is simply not there keeps its own 404. Only a
	// confirmed machine loss earns the recovery row.
	t.Run("a missing path still reads not found", func(t *testing.T) {
		absent := fmt.Errorf("read file: %w", fs.ErrNotExist)
		_, err := newService(&vanishedFileRuntime{readErr: absent}).ReadWorkspaceFile(context.Background(), "ws-1", 101, 1, "README.md")
		failure := apiErrorOf(t, err)
		assert.Equal(t, http.StatusNotFound, failure.Status)
		assert.Equal(t, "workspace file not found", failure.Message)
		assert.Nil(t, failure.Details)

		_, listErr := newService(&vanishedFileRuntime{listErr: absent}).ListWorkspaceFiles(context.Background(), "ws-1", 101, 1, "nope")
		listFailure := apiErrorOf(t, listErr)
		assert.Equal(t, http.StatusNotFound, listFailure.Status)
		assert.Equal(t, "workspace directory not found", listFailure.Message)
	})
}
