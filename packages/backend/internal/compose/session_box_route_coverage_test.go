package compose

import (
	"regexp"
	"slices"
	"sort"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/config"
)

// sessionBoxRouteSegment matches a served path that names a workspace, a
// workspace session or snapshot, an agent session, a run of a box, a branch
// or a terminal: every door that can reach an agent session's own box.
var sessionBoxRouteSegment = regexp.MustCompile(`/(workspaces|workspace/sessions|workspace-snapshots|agent/sessions|agent-sessions|monitors|branches|terminals)/\{|/agent/sessions$`)

// sessionTranscriptCreatorOnly classifies an agent session's transcript
// routes (PM d-k9xonl): only the session's creator reads them; every other
// member and a signed-out visitor gets 404, not 403. Platform's lane A pass 4
// (C) enforces it; this test only keeps the routes from drifting
// unclassified.
const sessionTranscriptCreatorOnly = "creator-only (404 to others), enforced by lane A pass 4 (C)"

// sessionTranscriptRoutes are the routes PM d-k9xonl makes creator-only.
var sessionTranscriptRoutes = []string{
	"get /api/repos/{owner}/{repo}/agent/sessions",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/messages",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/stream",
}

// sessionBoxRouteGates is how each such door keeps an agent session's own box
// (plue#869) to that session's person: the check every request passes
// before it reads or acts on the box. requireSessionBoxPerson
// (services/workspace_branch_machine.go) is reached by every check named
// here, unless the entry says why the door cannot reach a box at all.
var sessionBoxRouteGates = map[string]string{
	// Workspace doors: requireWorkspaceAccess reaches requireSessionBoxPerson
	// through authorizeBranchFileRead (read) and preflightBranchMachine (write)
	// for every machine-owned row, and every session box is machine-owned.
	"get /api/repos/{owner}/{repo}/workspaces/{id}":                                    "loadWorkspaceWithAccess(read)",
	"delete /api/repos/{owner}/{repo}/workspaces/{id}":                                 "loadOwnedWorkspace → requireWorkspaceAccess(write)",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/egress":                             "GetWorkspace → loadWorkspaceWithAccess(read)",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/files":                              "workspace facets → requireWorkspaceAccess(read)",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/files/content":                      "workspace facets → requireWorkspaceAccess(read)",
	"put /api/repos/{owner}/{repo}/workspaces/{id}/files/content":                      "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/coding/revisions":                   "workspace facets → requireWorkspaceAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/coding/operations":                 "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/services":                           "workspace facets → requireWorkspaceAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/services":                          "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/services/{name}/{action}":          "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/services/{port}/visibility":         "loadWorkspaceWithAccess(read), then owner only",
	"put /api/repos/{owner}/{repo}/workspaces/{id}/services/{port}/visibility":         "loadWorkspaceWithAccess(read), then owner only",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/preview/{port}":                     "loadWorkspaceWithAccess(read)",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/preview/{port}/{path}":              "loadWorkspaceWithAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/suspend":                           "loadOwnedWorkspace → requireWorkspaceAccess(write)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/resume":                            "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/fork":                              "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/snapshot":                          "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/lease":                             "loadOwnedWorkspace → requireWorkspaceAccess(write)",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/ssh":                                "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/stream":                             "loadWorkspaceWithAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/command-runs":                      "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/command-runs/{operationID}":         "loadWorkspaceWithAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/command-runs/{operationID}/cancel": "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/children":                           "loadWorkspaceWithAccess(read)",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/children":                          "owner only: a session's box is the machine service's, never a person's",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/children/{child_id}/stop":          "loadOwnedWorkspace → requireWorkspaceAccess(write), then owner only",
	"get /api/repos/{owner}/{repo}/workspaces/{id}/operations/{op_id}/undo/preview":    "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/operations/{op_id}/undo":           "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/head":                              "the box's own head token (workspace restriction) or the owner: never a person",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/user-source":                       "owner only: a session's box is the machine service's, never a person's",
	"post /api/repos/{owner}/{repo}/workspaces/{id}/stack/{operation}":                 "the box's own head token (workspace restriction): never a person",
	"get /api/repos/{owner}/{repo}/workspace/sessions/{id}":                            "loadWorkspaceSessionWithAccess(read)",
	"get /api/repos/{owner}/{repo}/workspace/sessions/{id}/ssh":                        "loadWorkspaceSessionWithAccess → requireWorkspaceAccess",
	"post /api/repos/{owner}/{repo}/workspace/sessions/{id}/destroy":                   "loadOwnedWorkspaceSession → requireWorkspaceAccess(write)",
	"get /api/repos/{owner}/{repo}/workspace/sessions/{id}/stream":                     "loadWorkspaceSessionWithAccess(read)",
	"get /api/repos/{owner}/{repo}/workspace/sessions/{id}/terminal":                   "loadWorkspaceSessionWithAccess(read) to attach; withWorkspaceMutationAuthority to open",
	"get /api/repos/{owner}/{repo}/workspace-snapshots/{id}":                           "loadOwnedWorkspaceSnapshot → requireWorkspaceAccess(read)",
	"delete /api/repos/{owner}/{repo}/workspace-snapshots/{id}":                        "loadOwnedWorkspaceSnapshot → requireWorkspaceAccess(write)",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}":                                sessionTranscriptCreatorOnly,
	"get /api/repos/{owner}/{repo}/agent/sessions":                                     sessionTranscriptCreatorOnly,
	"post /api/repos/{owner}/{repo}/agent/sessions":                                    "creates the caller's own session; its box does not exist yet",
	"delete /api/repos/{owner}/{repo}/agent/sessions/{id}":                             "the session's person only",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/messages":                       sessionTranscriptCreatorOnly,
	"post /api/repos/{owner}/{repo}/agent/sessions/{id}/messages":                      "the session's person only; the turn joins through attachBranchMachineSession → authorizeBranchMachine",
	"post /api/repos/{owner}/{repo}/agent/sessions/{session_id}/landing":               "the session's person only (404 to others; TestSessionLandingRefusesAnotherPersonsSession): opens a pull request, never touches the box",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/stream":                         sessionTranscriptCreatorOnly,
	"get /api/repos/{owner}/{repo}/agent-sessions/{id}/egress":                         "the session's person only (ListEgressAudit)",
	"get /api/repos/{owner}/{repo}/monitors/{id}":                                      "sessionBoxOfAnother: a run on another person's box does not exist",
	"get /api/repos/{owner}/{repo}/monitors/{id}/trace":                                "sessionBoxOfAnother: a run on another person's box does not exist",
	"get /api/branches/{b}":                      "branchFileWorkspace → authorizeBranchFileRead",
	"post /api/branches/{b}":                     "withBranchMachineMutation → authorizeBranchMachine",
	"get /api/branches/{b}/activity":             "branchFileWorkspace → authorizeBranchFileRead",
	"get /api/branches/{b}/files":                "branchFileWorkspace → authorizeBranchFileRead",
	"post /api/branches/{b}/archive":             "InstallScratchArchiveSubject: a session's box is no branch to archive",
	"post /api/branches/{b}/add-to-stack":        "authorizeBranchMachine",
	"get /api/branches/{b}/files/{path}":         "PresenceBranch → authorizeBranchFileRead",
	"post /api/branches/{b}/files/{path}":        "withWorkspaceMutationAuthority → authorizeBranchMachine",
	"get /api/branches/{b}/diff":                 "PresenceBranch → authorizeBranchFileRead",
	"post /api/branches/{b}/lsp":                 "AuthorizeTerminalBranch → requireSessionBoxPerson",
	"get /api/branches/{b}/lsp/{id}":             "AuthorizeTerminalBranch → requireSessionBoxPerson",
	"post /api/terminals/{id}/commands":          "the terminal's own credential, bound to the person who opened it",
	"post /api/admin/workspaces/{id}/stop":       "admin only (RequireAdmin, requireAdminActor): operators act on every box",
	"post /api/admin/workspaces/{id}/suspend":    "admin only (RequireAdmin, requireAdminActor): operators act on every box",
	"post /api/admin/agent-sessions/{id}/cancel": "admin only (RequireAdmin, requireAdminActor): operators act on every session",
}

// EVERY DOOR TO A WORKSPACE KEEPS A SESSION'S BOX TO ITS PERSON (Security
// d-b01lum, plue#869). Each served route that names a workspace, a workspace
// session or snapshot, an agent session, a run, a branch or a terminal must
// say which check keeps another person (a member or a guest) off an agent
// session's own box. A new door that names none fails here until it does.
func TestSessionBoxRouteAuthorizationCoverage(t *testing.T) {
	routes := servedCompositionRoutes(t, config.AuthModeMultitenant, config.AuthModeSelfHosted)
	var unclassified, all []string
	for key, route := range routes {
		if !sessionBoxRouteSegment.MatchString(route.path) {
			continue
		}
		all = append(all, key)
		if _, ok := sessionBoxRouteGates[key]; !ok {
			unclassified = append(unclassified, key)
		}
	}
	sort.Strings(all)
	sort.Strings(unclassified)
	for _, key := range unclassified {
		t.Errorf("served route %s names a workspace, session, run, branch or terminal but declares no session-box person check in sessionBoxRouteGates", key)
	}
	for key := range sessionBoxRouteGates {
		if _, ok := routes[key]; !ok {
			t.Errorf("sessionBoxRouteGates lists %s, which no composition serves", key)
		}
	}
	for _, key := range sessionTranscriptRoutes {
		if got := sessionBoxRouteGates[key]; got != sessionTranscriptCreatorOnly {
			t.Errorf("%s is an agent session transcript: classify it %q (PM d-k9xonl), not %q", key, sessionTranscriptCreatorOnly, got)
		}
	}
	for key, gate := range sessionBoxRouteGates {
		if gate == sessionTranscriptCreatorOnly && !slices.Contains(sessionTranscriptRoutes, key) {
			t.Errorf("%s is classified creator-only but is not in sessionTranscriptRoutes", key)
		}
	}
	if t.Failed() {
		t.Logf("served doors: %q", all)
	}
	t.Logf("%d served doors to a workspace keep a session's box to its person", len(all))
}
