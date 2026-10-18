package services

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// flowHostBoxQuerier is the smallest store that can tell the three machines
// apart: a person's box, a background machine of this run, and the
// service-owned wiki machine a repository's runs share. `bindings` is the
// DURABLE binding row set, keyed by binding id, which is what the shared
// carve-out is read from — never a caller's claim.
type flowHostBoxQuerier struct {
	*mockWorkspaceQuerier
	row        db.Workspace
	background bool
	bindings   map[string]string
	asked      []string
}

func (q *flowHostBoxQuerier) GetWorkspace(context.Context, string) (db.Workspace, error) {
	return q.row, nil
}

func (q *flowHostBoxQuerier) GetWorkspaceByRepo(_ context.Context, arg db.GetWorkspaceByRepoParams) (db.Workspace, error) {
	if arg.RepositoryID != q.row.RepositoryID {
		return db.Workspace{}, pgtype.ErrScanTargetTypeChanged
	}
	return q.row, nil
}

func (q *flowHostBoxQuerier) IsWorkflowBackgroundWorkspace(context.Context, string) (bool, error) {
	return q.background, nil
}

func (q *flowHostBoxQuerier) IsSharedServiceMachineHostBinding(_ context.Context, hostID, workspaceID string) (bool, error) {
	q.asked = append(q.asked, hostID)
	return q.bindings[hostID] == workspaceID, nil
}

const (
	flowHostBoxMachine = "0f8fad5b-d9cb-469f-a165-70867728950e"
	flowHostWikiHost   = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
	flowHostOtherHost  = "11111111-2222-3333-4444-555555555555"
	flowHostRunActor   = int64(9)
	flowHostService    = int64(4)
	flowHostRepository = int64(42)
)

func flowHostBoxService(t *testing.T, owner int64, background bool, bindings map[string]string) (*WorkspaceService, *flowHostBoxQuerier) {
	t.Helper()
	store := &flowHostBoxQuerier{
		mockWorkspaceQuerier: &mockWorkspaceQuerier{},
		row: db.Workspace{
			ID: flowHostBoxMachine, RepositoryID: flowHostRepository, UserID: owner,
			Name: "wiki", Kind: "container", Status: "running",
		},
		background: background,
		bindings:   bindings,
	}
	return &WorkspaceService{q: store}, store
}

// The nine measured `binding_kind=mythical-wiki` `runtime_start_failed`
// records: the background wiki host's box was opened through the PERSON door,
// `requireWorkspaceAccess`, whose very first step is
// `refuseBackgroundWorkspaceAccess` — "background machine belongs to its run".
// A background machine has no person door, so the start could never succeed
// and burned all three of its start attempts.
//
// The repair opens a background machine's box under the authority that owns
// it, the same one `FlowHostMachineInitialized` already uses, and the fences
// are asserted here rather than assumed.
func TestFlowHostBoxOpensABackgroundMachineUnderServiceAuthority(t *testing.T) {
	t.Parallel()

	t.Run("a person's box still takes the person door", func(t *testing.T) {
		service, _ := flowHostBoxService(t, flowHostRunActor, false, nil)
		row, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.NoError(t, err)
		require.Equal(t, flowHostBoxMachine, row.ID)
	})

	t.Run("a person's box that is not the requester's is still refused", func(t *testing.T) {
		// The person door is unchanged: this is the fence that must not have
		// been widened by giving background machines their own door.
		service, _ := flowHostBoxService(t, flowHostService, false, nil)
		_, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.Error(t, err, "a person's box opens only for its own person")
	})

	t.Run("a background machine of the run actor needs no person door", func(t *testing.T) {
		// The old path refused exactly this with "background machine belongs
		// to its run"; the owner fence is unchanged, only the door.
		service, store := flowHostBoxService(t, flowHostRunActor, true, nil)
		row, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.NoError(t, err)
		require.Equal(t, flowHostBoxMachine, row.ID)
		require.Empty(t, store.asked, "an owned background machine needs no shared-binding carve-out")
	})

	t.Run("the service-owned wiki machine opens for its own durable binding", func(t *testing.T) {
		service, store := flowHostBoxService(t, flowHostService, true,
			map[string]string{flowHostWikiHost: flowHostBoxMachine})
		row, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.NoError(t, err)
		require.Equal(t, flowHostBoxMachine, row.ID)
		require.Equal(t, []string{flowHostWikiHost}, store.asked,
			"the carve-out is read from the persisted binding row, not from the caller")
	})

	t.Run("a background machine of another run stays forbidden", func(t *testing.T) {
		service, _ := flowHostBoxService(t, flowHostService, true,
			map[string]string{flowHostWikiHost: flowHostBoxMachine})
		_, err := service.loadFlowHostBox(context.Background(), flowHostOtherHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.ErrorContains(t, err, "background machine belongs to another run")
	})

	t.Run("a binding row for a different machine proves nothing", func(t *testing.T) {
		service, _ := flowHostBoxService(t, flowHostService, true,
			map[string]string{flowHostWikiHost: "22222222-3333-4444-5555-666666666666"})
		_, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.ErrorContains(t, err, "background machine belongs to another run")
	})

	t.Run("a host id that is not a binding id is refused, not cast", func(t *testing.T) {
		// `flow_runtime_host_bindings.id` is UUID-typed, so a non-UUID host id
		// would make PostgreSQL raise SQLSTATE 22P02 and turn a denial into an
		// infrastructure error. It cannot name a persisted binding, so the
		// owner fence refuses it and the store is never asked.
		service, store := flowHostBoxService(t, flowHostService, true,
			map[string]string{"restored-sponsor-host": flowHostBoxMachine})
		_, err := service.loadFlowHostBox(context.Background(), "restored-sponsor-host",
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.ErrorContains(t, err, "background machine belongs to another run")
		require.Empty(t, store.asked, "a malformed host id never reaches the binding query")
	})

	t.Run("another repository's machine is refused by service authority", func(t *testing.T) {
		service, _ := flowHostBoxService(t, flowHostService, true,
			map[string]string{flowHostWikiHost: flowHostBoxMachine})
		_, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository+1, flowHostRunActor)
		require.ErrorContains(t, err, "service machine authority mismatch")
	})

	t.Run("a deleted machine is refused by service authority", func(t *testing.T) {
		service, store := flowHostBoxService(t, flowHostService, true,
			map[string]string{flowHostWikiHost: flowHostBoxMachine})
		store.row.DeletedAt = pgtype.Timestamptz{Valid: true}
		_, err := service.loadFlowHostBox(context.Background(), flowHostWikiHost,
			flowHostBoxMachine, flowHostRepository, flowHostRunActor)
		require.ErrorContains(t, err, "service machine authority mismatch")
	})
}
