package services

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/machined"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// sleepStageHeads reads a branch head and nothing else: a BranchHeadReader
// that is not a workspaceSnapshotStore, which is what branchHeads holds when
// the repository host is composed without its object reads.
type sleepStageHeads struct{}

func (sleepStageHeads) InfoRefsUploadPack(context.Context, string, string) ([]byte, error) {
	return nil, nil
}

// sleepStageStore is the full snapshot store the sleep path asserts for. It
// embeds the interface, as quiescePeer does, because no read is reached: every
// stage under test refuses before the first capture.
type sleepStageStore struct{ workspaceSnapshotStore }

type sleepStageCapture struct{}

func (sleepStageCapture) Capture(context.Context, string) (machined.CaptureResult, error) {
	return machined.CaptureResult{}, nil
}

type sleepStageRuntime struct{ workspaceapi.WorkspaceRuntime }

// sleepStageTransactions satisfies the provider gate's transaction holder. No
// stage under test begins one.
type sleepStageTransactions struct{}

func (sleepStageTransactions) Begin(context.Context) (pgx.Tx, error) { return nil, nil }

// A suspend that cannot run has to say which step did not hold.
//
// Receipt journeys/continuation9/receipts/28-suspend-idle-task-machine.json:
// the normal supported suspend of own idle task machine
// 1d7209c4-1915-4433-bc2b-c15376574147 (1 vCPU / 4 GiB / 32 GiB, last activity
// 2026-10-14T10:31:03Z, 1800 s idle timeout, two failed sessions and no run)
// answered 503 {"code":"service_unavailable","class":"infra","fault":"infra",
// "message":"service unavailable"} and the box was still running on every one
// of twenty polls through 120 s. Eleven distinct refusals shared one sentence,
// so neither the owner nor the operator log could tell a missing provider from
// a failed capture, and nothing in the response named a next step.
//
// The stage rides in Message, which is what reaches the operator log and —
// because CodeBranchSleepUnavailable is in isSafe5xxMessageCode, unlike the
// bare CodeServiceUnavailable this used to carry — the owner as well
// (routes.TestRefusedBranchSleepReachesTheOwner). This test pins that it does,
// that the stages are distinguishable from one another, and that each one
// stays a written constant — no customer payload, no key, no URL and no raw
// driver text, which is what makes it safe to log and to answer with.
//
// These four stages are the machine-free ones: each refuses before the first
// database read, so the regression needs no Postgres and no runtime.
func TestBranchSleepRefusalNamesItsStage(t *testing.T) {
	row := db.Workspace{ID: "1d7209c4-1915-4433-bc2b-c15376574147", UserID: 35}
	complete := BranchMachineProviders{
		Membership:      func(context.Context, pgx.Tx, int64, int64) error { return nil },
		Authorize:       func(context.Context, pgx.Tx, string, int64, string, int64) error { return nil },
		LaneBinding:     func(context.Context, pgx.Tx, int64, string, string) error { return nil },
		MicroVM:         func(context.Context) error { return nil },
		SessionIdentity: func(context.Context) error { return nil },
	}

	for _, stage := range []struct {
		name    string
		service *WorkspaceService
		want    string
	}{
		{
			name:    "the branch head store is not composed",
			service: &WorkspaceService{branchHeads: sleepStageHeads{}},
			want:    "branch head store unavailable",
		},
		{
			name:    "no capture daemon answers",
			service: &WorkspaceService{branchHeads: sleepStageStore{}},
			want:    "branch capture unavailable",
		},
		{
			name: "no workspace runtime answers",
			service: &WorkspaceService{
				branchHeads:   sleepStageStore{},
				branchCapture: sleepStageCapture{},
			},
			want: "workspace runtime unavailable",
		},
		{
			name: "a branch machine provider is missing",
			service: &WorkspaceService{
				branchHeads:   sleepStageStore{},
				branchCapture: sleepStageCapture{},
				runtime:       sleepStageRuntime{},
			},
			want: "branch machine providers unavailable",
		},
	} {
		t.Run(stage.name, func(t *testing.T) {
			err := stage.service.captureAndSleepExcluded(context.Background(), row, false)
			require.Error(t, err, "a sleep that cannot run refuses")

			var refusal *pkgerrors.APIError
			require.True(t, errors.As(err, &refusal), "the refusal is the typed 503 the route writes")
			assert.Equal(t, pkgerrors.CodeBranchSleepUnavailable, refusal.Code,
				"the verdict names the unfinished deployment, not a transient outage")
			assert.Contains(t, refusal.Message, stage.want,
				"the logged sentence names the step that did not hold")

			// The sentence is logged, so it carries no payload, no key, no URL
			// and no raw driver text.
			for _, leak := range []string{"://", "Bearer ", "password", "127.0.0.1", ".svc"} {
				assert.NotContains(t, refusal.Message, leak, "a logged refusal carries no %q", leak)
			}

			// Quiesce freezes by running this same path, so it asks the same
			// four questions and names the same stage: an install that cannot
			// sleep must not be told only that it cannot quiesce.
			quiesce := stage.service.QuiesceAvailable()
			require.Error(t, quiesce, "a deployment that cannot sleep cannot quiesce")
			assert.Contains(t, quiesce.Error(), "quiesce requires verified branch capture and the machine runtime",
				"the quiesce preflight keeps the sentence its callers match")
			assert.Contains(t, quiesce.Error(), stage.want, "the quiesce preflight names the same step")
		})
	}

	// The regression: before the stage argument every one of these returned
	// the same sentence, so an operator reading the log could not tell which
	// step refused. Receipt 28 is what that looked like from outside.
	seen := map[string]string{}
	for _, service := range []*WorkspaceService{
		{branchHeads: sleepStageHeads{}},
		{branchHeads: sleepStageStore{}},
		{branchHeads: sleepStageStore{}, branchCapture: sleepStageCapture{}},
		{branchHeads: sleepStageStore{}, branchCapture: sleepStageCapture{}, runtime: sleepStageRuntime{}},
	} {
		err := service.captureAndSleepExcluded(context.Background(), row, false)
		var refusal *pkgerrors.APIError
		require.True(t, errors.As(err, &refusal))
		if previous, repeated := seen[refusal.Message]; repeated {
			t.Fatalf("two sleep refusals share one sentence (%q and this one): %q", previous, refusal.Message)
		}
		seen[refusal.Message] = stageOf(refusal)
	}
	assert.Len(t, seen, 4, "each machine-free refusal is distinguishable in the operator log")

	// requireBranchMachineProviders is satisfied only when every provider is
	// composed, so the fourth stage reports a real missing provider rather
	// than a guard that can never pass.
	ready := &WorkspaceService{
		branchHeads:            sleepStageStore{},
		branchCapture:          sleepStageCapture{},
		runtime:                sleepStageRuntime{},
		transactions:           sleepStageTransactions{},
		branchMachineProviders: complete,
	}
	require.NoError(t, ready.requireBranchMachineProviders(),
		"a fully composed service passes the provider gate the fourth stage reports")
}

// stageOf reads the structural stage the refusal carries alongside its
// sentence. writeRouteError drops Details on a 5xx, so this is the in-process
// view an operator's log pipeline sees, not something a caller receives.
func stageOf(refusal *pkgerrors.APIError) string {
	details, ok := refusal.Details.(map[string]string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(details["stage"])
}
