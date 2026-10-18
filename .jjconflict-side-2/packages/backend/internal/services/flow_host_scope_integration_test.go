package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/stretchr/testify/require"
)

// Hosted loads no flows (PM d-nds5gd, release pin): with the FlowLoad flag on,
// a push to main of a repository whose stack runs starts no flow-load launch
// off an install. An install still loads.
func TestHostedPushToMainStartsNoFlowLoadWhateverItsFlag(t *testing.T) {
	for _, tc := range []struct {
		name        string
		singleOwner bool
		loads       int
	}{
		{"hosted", false, 0},
		{"an install", true, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newMergeHarness(t)
			require.NoError(t, os.MkdirAll(filepath.Join(h.work, ".smithers/flows/todo"), 0700))
			ctx := context.Background()
			launcher, lanes := &fakeMythicalLauncher{}, &fakeMythicalLanes{}
			lanes.provision = func(id string) {
				h.exec(`INSERT INTO workspaces(id,repository_id,user_id,name,status) VALUES($1,$2,$3,$4,'running')`, id, h.repoID, h.userID, id)
			}
			h.service.SetOrchestration(h.service.github, launcher, lanes)
			ScopeFlowHosts(tc.singleOwner, true, nil, h.service)
			sync := NewGitHubMainPullService(h.q, h.host, h.connections, h.connections)
			qualifyMainPullFixture(sync)
			sync.SetMainMoved(h.service.MainMoved)

			h.git(h.work, "checkout", "-q", "main")
			h.commit("flow edit", ".smithers/flows/todo/flow.ts", "export default 'one'\n")
			h.git(h.work, "push", "-q", h.github, "main:refs/heads/main")
			_, err := sync.Request(ctx, h.repoID)
			require.NoError(t, err)
			require.NoError(t, sync.PollOnce(ctx))
			require.NoError(t, h.service.PollOnce(ctx))

			launcher.mu.Lock()
			defer launcher.mu.Unlock()
			var loads []flowdispatch.LaunchRequest
			for _, request := range launcher.requests {
				if request.FlowID == "flow-load" {
					loads = append(loads, request)
				}
			}
			require.Len(t, loads, tc.loads)
		})
	}
}
