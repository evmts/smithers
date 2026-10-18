package ports_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/ports"
)

// errAdapterStore stands for the store text a deployment adapter's refusal
// carries. It never reaches a diagnostic; it is here to prove the chain is
// still joinable by errors.Is after the correlation id is added.
var errAdapterStore = errors.New("relation \"repo_gateways\" does not exist")

// An adapter may build one refusal and return it from every stream it
// refuses: reusing an error value is ordinary Go, and ports.RefuseModelStream
// is exported for adapters to call. Filling the correlation id into that
// shared value would hand the second stream the first stream's id — and the
// correlation id is the only thing that joins a route's one diagnostic to the
// adapter's launch-step records, so a wrong one points an operator at another
// stream's launch. It would also be a write to a value the caller still owns,
// which two concurrent streams would make a race.
func TestRefusingTwoStreamsWithOneReusedRefusalKeepsTheirCorrelationIdsApart(t *testing.T) {
	reused := ports.RefuseModelStream(errAdapterStore, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, "")

	stageOf := func(correlation string) (ports.ChatStage, ports.ModelStreamReason, string, error) {
		// The caller wraps the way modelhost.RunModelStream does: its own
		// context, its own coarse stage, and the run id the adapter could
		// not know.
		err := ports.RefuseModelStream(fmt.Errorf("launch owner model host: %w", reused),
			ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, correlation)
		gotStage, gotReason, gotCorrelation := ports.ModelStreamDiagnostic(err)
		return gotStage, gotReason, gotCorrelation, err
	}

	_, _, first, firstErr := stageOf("11111111-1111-4111-8111-111111111111")
	stage, reason, second, secondErr := stageOf("22222222-2222-4222-8222-222222222222")

	require.Equal(t, "11111111-1111-4111-8111-111111111111", first)
	require.Equal(t, "22222222-2222-4222-8222-222222222222", second,
		"a reused refusal must not carry an earlier stream's correlation id")

	// The refusal the adapter built is unchanged: the caller added a
	// correlation id without writing to a value it does not own.
	named, ok := ports.ModelStreamRefusalOf(reused)
	require.True(t, ok)
	require.Empty(t, named.Correlation)

	// The nearest named branch still owns the answer, and the chain is intact.
	require.Equal(t, ports.ChatStageSandboxCreate, stage)
	require.Equal(t, ports.ReasonDependencyUnavailable, reason)
	require.ErrorIs(t, firstErr, errAdapterStore)
	require.ErrorIs(t, secondErr, errAdapterStore)
	require.ErrorContains(t, secondErr, "launch owner model host")
}

// A caller that adds nothing the named branch lacks returns that branch's own
// error untouched, so the common path allocates no second refusal.
func TestRefusingANamedBranchAgainWithoutACorrelationIdChangesNothing(t *testing.T) {
	named := ports.RefuseModelStream(errAdapterStore, ports.ChatStageHostBody, ports.ReasonResponseUnusable, "run-id")
	require.Same(t, named, ports.RefuseModelStream(named, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, "later-id"))

	unnumbered := ports.RefuseModelStream(errAdapterStore, ports.ChatStageHostBody, ports.ReasonResponseUnusable, "")
	require.Same(t, unnumbered, ports.RefuseModelStream(unnumbered, ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, ""))
}

// The caller's coarser stage never overwrites the branch that actually
// refused, even when the caller is the one that supplies the correlation id.
func TestAddingACorrelationIdKeepsTheNearestRefusingStage(t *testing.T) {
	inner := ports.RefuseModelStream(errAdapterStore, ports.ChatStageHealth, ports.ReasonHostUnreachable, "")
	outer := ports.RefuseModelStream(fmt.Errorf("launch owner model host: %w", inner),
		ports.ChatStageSandboxCreate, ports.ReasonDependencyUnavailable, "run-id")

	stage, reason, correlation := ports.ModelStreamDiagnostic(outer)
	require.Equal(t, ports.ChatStageHealth, stage)
	require.Equal(t, ports.ReasonHostUnreachable, reason)
	require.Equal(t, "run-id", correlation)
}
