package services

import "context"

// TEMPORARY until G4's QuiesceAgentBox (tl.agent-box-release-fence-p0) lands
// in this stack; delete this file when rebasing onto it.

// AgentBoxQuiesce is what QuiesceAgentBox did to a box.
type AgentBoxQuiesce struct {
	Outcome          string
	Quiesced         bool
	HeadTokenRevoked bool
	Detail           string
}

func (s *WorkspaceService) QuiesceAgentBox(ctx context.Context, workspaceID, sessionID string, _ int64) (AgentBoxQuiesce, error) {
	release, err := s.ReleaseAgentWorkspace(ctx, workspaceID, sessionID)
	return AgentBoxQuiesce{Outcome: release.Outcome, HeadTokenRevoked: release.HeadTokenRevoked, Detail: release.Detail,
		Quiesced: err == nil && release.Outcome == agentWorkspaceQuiesced && release.HeadTokenRevoked && release.Detail == ""}, err
}
