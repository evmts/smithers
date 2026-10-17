package routes

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// sleepRefusalHeads is the branch head store a hosted deployment composes:
// the repository host, with its ref advertisement and its object reads. It is
// the one sleep dependency the pinned hosted composition does supply, so a
// service holding it reaches the next question — the capture daemon.
type sleepRefusalHeads struct{}

func (sleepRefusalHeads) InfoRefsUploadPack(context.Context, string, string) ([]byte, error) {
	return nil, nil
}

func (sleepRefusalHeads) GetChange(context.Context, string, string, string) (repohost.Change, error) {
	return repohost.Change{}, nil
}

func (sleepRefusalHeads) ListDirectory(context.Context, string, string, string, string, string, int) ([]repohost.TreeEntry, error) {
	return nil, nil
}

func (sleepRefusalHeads) GetFileAtCommit(context.Context, string, string, string, string) (repohost.FileContent, error) {
	return repohost.FileContent{}, nil
}

// The owner of a box this deployment cannot suspend has to be told that.
//
// Receipt journeys/continuation9/receipts/28-suspend-idle-task-machine.json:
// the normal supported suspend of own idle task machine
// 1d7209c4-1915-4433-bc2b-c15376574147 answered 503 {"code":
// "service_unavailable","message":"service unavailable"} on every attempt and
// the box kept its 1 vCPU / 4 GiB / 32 GiB through 120 s of polling, 15 h 42
// min past its own 1800 s idle timeout. The stage was known server-side the
// whole time (TestBranchSleepRefusalNamesItsStage) and the scrub threw it
// away, so the one fact the owner needed — that no box on this deployment can
// be suspended, because its capture daemon was never composed, and that
// retrying tonight will not change that — never left the process.
//
// This is the whole path the owner's request takes: the real service's
// refusal, composed exactly as the hosted deployment composes it (branch head
// store yes, capture daemon no), through the real route writer. It must arrive
// with its verdict and its sentence, like coding_gateway_not_configured, the
// other refusal that means "a deployment nobody finished configuring, not
// your box".
func TestRefusedBranchSleepReachesTheOwner(t *testing.T) {
	t.Parallel()

	// No capture daemon, exactly as app.Config composes a hosted deployment:
	// it has no seam that supplies one (compose.Options.BranchCapture and
	// .Machined are install-only), so this is the production composition and
	// not a contrived one.
	hosted := services.NewWorkspaceService(nil, services.WithBranchHeads(sleepRefusalHeads{}))

	refusal := hosted.QuiesceAvailable()
	require.Error(t, refusal, "a deployment with no capture daemon cannot sleep a box")

	var api *pkgerrors.APIError
	require.ErrorAs(t, refusal, &api)
	assert.Equal(t, pkgerrors.CodeBranchSleepUnavailable, api.Code,
		"the verdict is the uncomposed deployment, not a transient service_unavailable")

	rec := httptest.NewRecorder()
	writeRouteError(rec, httptest.NewRequest(http.MethodPost, "/", nil), refusal)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	body := rec.Body.String()
	assert.Contains(t, body, string(pkgerrors.CodeBranchSleepUnavailable),
		"the client branches on the code")
	assert.Contains(t, body, "branch capture unavailable",
		"the stage survives the 5xx scrub, so the owner reads which step is missing")
	assert.NotEqual(t, `{"error":"service unavailable"}`, body)

	// The sentence reaches a caller now, so it stays a written constant: no
	// payload, no credential, no URL, no host and no raw driver text.
	for _, leak := range []string{"://", "Bearer ", "password", "127.0.0.1", ".svc"} {
		assert.NotContains(t, body, leak, "a refusal the owner reads carries no %q", leak)
	}
}
