package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// Hosted manual workspace routes are closed to everyone but the staff list
// (sandbox.hosted_workspace_user_ids, Security item 9). The launch flows
// don't use them: an Ask coding turn starts its own box through agent
// dispatch (CreateAgentWorkspace). A person admitted to hosted coding but not
// on the staff list still gets that box, and is never refused with
// workspaces_unavailable.
func TestHostedCodingTurnStartsItsBoxForANonStaffUser(t *testing.T) {
	staff, err := config.ParseHostedWorkspaceUserIDs("1,60,24")
	require.NoError(t, err)
	const userID = 9
	require.False(t, staff.Allows(userID), "the user is not on the workspace staff list")

	svc, effects := newHostedCodingService(t, "9")
	_, err = svc.DispatchAgentRun(context.Background(), hostedCodingInput(userID))
	var apiErr *pkgerrors.APIError
	if err != nil && assert.ErrorAs(t, err, &apiErr) {
		assert.NotEqual(t, pkgerrors.CodeWorkspacesUnavailable, apiErr.Code)
		assert.NotEqual(t, pkgerrors.CodeHostedCodingNotOpen, apiErr.Code)
	}
	assert.Equal(t, 1, effects.runs, "the turn has its run")
	assert.Len(t, effects.dispatcher.launches, 1, "the turn reaches Flow admission")
	assert.Equal(t, 1, effects.workspaces, "the turn's box is created through CreateAgentWorkspace")
	assert.Empty(t, effects.failures)
}
