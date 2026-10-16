package services

import (
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

func fenceItemID(t *testing.T, last byte) pgtype.UUID {
	t.Helper()
	id := pgtype.UUID{Valid: true}
	id.Bytes[15] = last
	return id
}

// The fence vocabulary is the whole point of the attribution: a record may
// carry a fence only because the set is written here, closed, and derived from
// nothing. If a fence could be a row's value, an id, a path or an adapter's
// text, the 35 `runtime_target_forbidden` records would have gained a payload
// instead of an explanation.
func TestMythicalFencesAreAClosedDeclaredVocabulary(t *testing.T) {
	t.Parallel()
	shape := regexp.MustCompile(`^[a-z]+(_[a-z]+)*$`)
	seen := map[mythicalFence]bool{}
	for _, fence := range mythicalFences {
		require.NotEmpty(t, fence, "the empty fence means no fence and is not a member")
		require.Regexp(t, shape, string(fence), "a fence is a written identifier, never derived text")
		require.LessOrEqual(t, len(fence), 24, "a fence is a label, not a sentence")
		require.False(t, seen[fence], "%s is declared twice", fence)
		seen[fence] = true
	}
	require.Len(t, mythicalFences, 11, "every declared fence is listed in mythicalFences")
}

// Root's constraint, asserted rather than asserted-to: the typed failure code
// a caller and the wire see is unchanged by the attribution, and the error
// text gains only a member of the closed set — never prose, a reason, a row or
// an adapter's words.
func TestMythicalFenceDoesNotAlterTheTypedFailureCode(t *testing.T) {
	t.Parallel()
	bare := mythicalFlowFailure{code: "runtime_target_forbidden"}
	require.Equal(t, "runtime_target_forbidden", bare.FlowRuntimeCode())
	require.Equal(t, "mythical Flow runtime: runtime_target_forbidden", bare.Error())
	require.Empty(t, MythicalTargetFence(bare), "a refusal that named no fence reports none")

	for _, fence := range mythicalFences {
		failure := mythicalFlowFailure{code: "runtime_target_forbidden", fence: fence}
		require.Equal(t, "runtime_target_forbidden", failure.FlowRuntimeCode(),
			"the fence is observability; the typed code is unchanged")
		require.False(t, failure.FlowRuntimeRetryable(), "a forbidden target is not retried")
		require.Equal(t, string(fence), MythicalTargetFence(failure))
		suffix := strings.TrimPrefix(failure.Error(), "mythical Flow runtime: runtime_target_forbidden")
		require.Equal(t, " at fence "+string(fence), suffix,
			"the text gains the declared fence and nothing else")
	}

	// Nothing else in the codebase answers a fence: an unrelated error reports
	// none rather than guessing.
	require.Empty(t, MythicalTargetFence(errors.New("unrelated")))
	require.Empty(t, MythicalTargetFence(nil))
	require.Empty(t, MythicalTargetFence(mythicalFlowFailure{code: "runtime_binding_unavailable", retryable: true}))
}

// Each helper answers WHICH clause refused, and answers nothing when every
// clause passes. The clauses are the ones the single compound conditions
// tested before the attribution: a case that used to be refused is still
// refused, and a case that used to pass still passes.
func TestMythicalFenceHelpersNameTheClauseThatRefused(t *testing.T) {
	t.Parallel()
	const machine = "0f8fad5b-d9cb-469f-a165-70867728950e"
	const other = "11111111-2222-3333-4444-555555555555"
	itemID := fenceItemID(t, 7)
	okLane := db.MythicalLane{WorkspaceID: machine, RepositoryID: 42, ItemID: itemID}
	okItem := db.MythicalItem{ID: itemID, RepositoryID: 42, WorkspaceID: machine, Attempt: 1, Source: "todo",
		OwnerID: pgtype.Int8{Int64: 9, Valid: true}}
	okStack := db.MythicalStack{RepositoryID: 42, ActorUserID: pgtype.Int8{Int64: 9, Valid: true}}
	retired := pgtype.Timestamptz{Valid: true}

	t.Run("lane", func(t *testing.T) {
		require.Empty(t, mythicalLaneFence(okLane, 42, machine), "nothing refuses a lane of this run")
		wrongRepo := okLane
		wrongRepo.RepositoryID = 43
		require.Equal(t, fenceRepository, mythicalLaneFence(wrongRepo, 42, machine))
		wrongMachine := okLane
		wrongMachine.WorkspaceID = other
		require.Equal(t, fenceLaneMachine, mythicalLaneFence(wrongMachine, 42, machine))
		gone := okLane
		gone.RetiredAt = retired
		require.Equal(t, fenceLaneRetired, mythicalLaneFence(gone, 42, machine))
	})

	t.Run("lane item", func(t *testing.T) {
		require.Empty(t, mythicalLaneItemFence(okItem, okLane, 42, machine))
		stray := okItem
		stray.ID = fenceItemID(t, 8)
		require.Equal(t, fenceLaneItem, mythicalLaneItemFence(stray, okLane, 42, machine))
		wrongRepo := okItem
		wrongRepo.RepositoryID = 43
		require.Equal(t, fenceRepository, mythicalLaneItemFence(wrongRepo, okLane, 42, machine))
		elsewhere := okItem
		elsewhere.WorkspaceID = other
		require.Equal(t, fenceExecutionMachine, mythicalLaneItemFence(elsewhere, okLane, 42, machine))
		uncounted := okItem
		uncounted.Attempt = 0
		require.Equal(t, fenceAttempt, mythicalLaneItemFence(uncounted, okLane, 42, machine))
	})

	t.Run("wake", func(t *testing.T) {
		require.Empty(t, mythicalWakeFence(okItem, okLane, 42, machine))
		wrongRepo := okItem
		wrongRepo.RepositoryID = 43
		require.Equal(t, fenceRepository, mythicalWakeFence(wrongRepo, okLane, 42, machine))
		elsewhere := okItem
		elsewhere.WorkspaceID = other
		require.Equal(t, fenceExecutionMachine, mythicalWakeFence(elsewhere, okLane, 42, machine))
		strayLane := okLane
		strayLane.ItemID = fenceItemID(t, 9)
		require.Equal(t, fenceLaneItem, mythicalWakeFence(okItem, strayLane, 42, machine))
		laneRepo := okLane
		laneRepo.RepositoryID = 43
		require.Equal(t, fenceLaneMachine, mythicalWakeFence(okItem, laneRepo, 42, machine))
		gone := okLane
		gone.RetiredAt = retired
		require.Equal(t, fenceLaneRetired, mythicalWakeFence(okItem, gone, 42, machine))
	})

	t.Run("item target", func(t *testing.T) {
		target := flowruntime.Target{WorkspaceID: machine}
		require.Empty(t, mythicalItemTargetFence(okItem, okStack, target, 42, 9, machine))
		wrongRepo := okItem
		wrongRepo.RepositoryID = 43
		require.Equal(t, fenceRepository, mythicalItemTargetFence(wrongRepo, okStack, target, 42, 9, machine))
		require.Equal(t, fenceSponsor, mythicalItemTargetFence(okItem, okStack, target, 42, 10, machine),
			"a run actor who is not the item's sponsor is refused at the sponsor fence")
		require.Equal(t, fenceMachineUnassigned, mythicalItemTargetFence(okItem, okStack, flowruntime.Target{}, 42, 9, ""))
		require.Equal(t, fenceMachineMismatch,
			mythicalItemTargetFence(okItem, okStack, flowruntime.Target{WorkspaceID: other}, 42, 9, machine))
		require.Empty(t, mythicalItemTargetFence(okItem, okStack, flowruntime.Target{}, 42, 9, machine),
			"a target naming no machine takes the row's own")
	})

	t.Run("stack machine", func(t *testing.T) {
		target := flowruntime.Target{WorkspaceID: machine}
		require.Empty(t, mythicalStackMachineFence(okStack, target, 9, machine))
		require.Equal(t, fenceStackActor, mythicalStackMachineFence(okStack, target, 10, machine))
		require.Equal(t, fenceStackActor,
			mythicalStackMachineFence(db.MythicalStack{RepositoryID: 42}, target, 9, machine),
			"a stack with no actor cannot authorize a launch")
		require.Equal(t, fenceMachineUnassigned, mythicalStackMachineFence(okStack, flowruntime.Target{}, 9, ""))
		require.Equal(t, fenceMachineMismatch,
			mythicalStackMachineFence(okStack, flowruntime.Target{WorkspaceID: other}, 9, machine))
	})
}
