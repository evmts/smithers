package services

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// sessionBoxProbe runs one class's check as another person against an agent
// session's own box. It answers nil when the check refused, else what reached
// the box.
type sessionBoxProbe func(other int64) error

// sessionBoxRouteClasses reads the classification
// TestSessionBoxRouteAuthorizationCoverage (internal/compose) holds to every
// served route: each route's class and each class's proof.
func sessionBoxRouteClasses(t *testing.T) (routes map[string]string, proofs map[string]string) {
	t.Helper()
	file, err := os.Open(filepath.Join("..", "compose", "testdata", "session_box_routes.tsv"))
	require.NoError(t, err)
	defer file.Close()
	routes, proofs = map[string]string{}, map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		switch {
		case fields[0] == "class" && len(fields) == 5:
			proofs[fields[1]] = fields[3]
		case fields[0] == "route" && len(fields) == 3:
			routes[fields[1]] = fields[2]
		}
	}
	require.NoError(t, scanner.Err())
	require.NotEmpty(t, routes)
	return routes, proofs
}

// sessionBoxGateLeaks runs, as other, the probe of every route whose class's
// proof is "probe", once per class, and lists each route whose check let
// other reach the box or has no probe.
func sessionBoxGateLeaks(routes, proofs map[string]string, probes map[string]sessionBoxProbe, other int64) []string {
	results := map[string]error{}
	var leaks []string
	for key, class := range routes {
		if proofs[class] != "probe" {
			continue
		}
		probe, ok := probes[class]
		if !ok {
			leaks = append(leaks, fmt.Sprintf("%s: class %s has no probe", key, class))
			continue
		}
		result, ran := results[class]
		if !ran {
			result = probe(other)
			results[class] = result
		}
		if result != nil {
			leaks = append(leaks, fmt.Sprintf("%s (%s): %v", key, class, result))
		}
	}
	sort.Strings(leaks)
	return leaks
}

// refused answers nil when err is a refusal: a 403 or 404, or no row.
func refused(what string, err error) error {
	var api *pkgerrors.APIError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil
	case errors.As(err, &api) && (api.Status == 403 || api.Status == 404):
		return nil
	case err == nil:
		return fmt.Errorf("%s reached the box", what)
	default:
		return fmt.Errorf("%s failed without refusing: %w", what, err)
	}
}

// sessionBoxProbes are the checks of every probe class, run against the
// fixture's box (its session's person is f.person).
func sessionBoxProbes(t *testing.T, f *agentBoxRelease) map[string]sessionBoxProbe {
	t.Helper()
	box := f.box(t)
	repo := box.RepositoryID
	slug, err := f.q.GetRepoOwnerSlugAndNameByID(f.ctx, repo)
	require.NoError(t, err)
	var terminal, snapshot string
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO workspace_sessions (workspace_id, repository_id, user_id, cols, rows)
		VALUES ($1, $2, $3, 80, 24) RETURNING id::text`, box.ID, repo, f.person).Scan(&terminal))
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO workspace_snapshots (repository_id, user_id, workspace_id, name, snapshot_id)
		VALUES ($1, $2, $3, 'probe', 'snap-probe') RETURNING id::text`, repo, f.person, box.ID).Scan(&snapshot))
	return map[string]sessionBoxProbe{
		"workspace-read": func(other int64) error {
			_, err := f.boxes.GetWorkspace(f.ctx, box.ID, repo, other)
			return refused("GetWorkspace", err)
		},
		"workspace-write": func(other int64) error {
			_, err := f.boxes.ResumeWorkspace(f.ctx, box.ID, repo, other)
			return refused("ResumeWorkspace", err)
		},
		"workspace-owned": func(other int64) error {
			_, err := f.boxes.StopWorkspace(f.ctx, box.ID, repo, other)
			return refused("StopWorkspace", err)
		},
		"workspace-body": func(other int64) error {
			_, err := f.boxes.CreateSession(f.ctx, CreateWorkspaceSessionInput{RepositoryID: repo, UserID: other, WorkspaceID: box.ID,
				RepoOwner: slug.OwnerSlug, RepoName: slug.RepoName, Cols: 80, Rows: 24})
			if leak := refused("CreateSession", err); leak != nil {
				return leak
			}
			_, err = f.boxes.CreateWorkspaceSnapshot(f.ctx, CreateWorkspaceSnapshotInput{RepositoryID: repo, UserID: other, WorkspaceID: box.ID, Name: "probe"})
			return refused("CreateWorkspaceSnapshot", err)
		},
		"workspace-list": func(other int64) error {
			boxes, _, err := f.boxes.ListWorkspaces(f.ctx, repo, other, 1, 100)
			if err != nil {
				return err
			}
			for _, listed := range boxes {
				if listed.ID == box.ID {
					return errors.New("ListWorkspaces lists the box")
				}
			}
			sessions, _, err := f.boxes.ListSessions(f.ctx, repo, other, 1, 100)
			if err != nil {
				return err
			}
			for _, listed := range sessions {
				if listed.WorkspaceID == box.ID {
					return errors.New("ListSessions lists the box's terminal")
				}
			}
			return nil
		},
		"workspace-session": func(other int64) error {
			_, err := f.boxes.GetSession(f.ctx, terminal, repo, other)
			return refused("GetSession", err)
		},
		"workspace-snapshot": func(other int64) error {
			_, err := f.boxes.GetWorkspaceSnapshot(f.ctx, snapshot, repo, other)
			return refused("GetWorkspaceSnapshot", err)
		},
		"owner-only": func(other int64) error {
			_, err := f.boxes.loadOwnedWorkspace(f.ctx, box.ID, repo, other)
			return refused("loadOwnedWorkspace", err)
		},
		"branch-read": func(other int64) error {
			_, err := f.boxes.ListBranchFiles(f.ctx, box.ID, repo, other, "")
			if leak := refused("ListBranchFiles", err); leak != nil {
				return leak
			}
			_, err = f.boxes.PresenceBranch(f.ctx, box.ID, repo, other)
			return refused("PresenceBranch", err)
		},
		"branch-write": func(other int64) error {
			reached := false
			err := f.boxes.withWorkspaceMutationAuthority(f.ctx, box, other, func(context.Context) error {
				reached = true
				return nil
			})
			if reached {
				return errors.New("withWorkspaceMutationAuthority ran the mutation")
			}
			return refused("withWorkspaceMutationAuthority", err)
		},
		"branch-list": func(other int64) error {
			branches, _, err := f.boxes.ListBranches(f.ctx, repo, other, 1, 100)
			if err != nil {
				return err
			}
			for _, branch := range branches {
				if branch.Machine.ID == box.ID {
					return errors.New("ListBranches lists the box")
				}
			}
			return nil
		},
		"branch-archive": func(int64) error {
			_, _, err := InstallScratchArchiveSubject(f.ctx, f.q, repo, box.ID)
			return refused("InstallScratchArchiveSubject", err)
		},
		"terminal-branch": func(other int64) error {
			_, err := f.boxes.AuthorizeTerminalBranch(f.ctx, box.ID, repo, other)
			return refused("AuthorizeTerminalBranch", err)
		},
		"workflow-body": func(other int64) error {
			_, err := f.q.GetFlowWorkspaceForUserRepo(f.ctx, db.GetFlowWorkspaceForUserRepoParams{ID: box.ID, RepositoryID: repo, UserID: other})
			return refused("GetFlowWorkspaceForUserRepo", err)
		},
		"session-person": func(other int64) error {
			return refused("DeleteSession", f.agent.DeleteSession(f.ctx, f.session, other))
		},
	}
}

// EVERY DECLARED GATE REFUSES ANOTHER PERSON (Security d-nhn9cy finding 3).
// Each route classified with a probe class has its check run as another
// member with write access against an agent session's own box, which must
// refuse. A class with no probe fails, and so does a probe that reaches the
// box: the unguarded path-bound and body-bound routes below show the harness
// fails on them.
func TestEverySessionBoxGateRefusesAnotherPerson(t *testing.T) {
	f := newAgentBoxRelease(t, "running")
	ben := f.member(t, "ben-gates")
	routes, proofs := sessionBoxRouteClasses(t)
	probes := sessionBoxProbes(t, f)

	require.Empty(t, sessionBoxGateLeaks(routes, proofs, probes, ben))
	require.Equal(t, "running", f.box(t).Status, "no probe touched the box")
	require.Equal(t, int32(0), f.runtime.deletes.Load())

	t.Run("unguarded routes fail", func(t *testing.T) {
		routes := map[string]string{
			"get /api/repos/{owner}/{repo}/workspaces/{id}":           "workspace-read",
			"get /api/repos/{owner}/{repo}/workspaces/{id}/unguarded": "unguarded-path",
			"post /api/unguarded-body":                                "unguarded-body",
			"post /api/unprobed":                                      "unprobed",
		}
		proofs := map[string]string{"workspace-read": "probe", "unguarded-path": "probe", "unguarded-body": "probe", "unprobed": "probe"}
		probes := map[string]sessionBoxProbe{
			"workspace-read": probes["workspace-read"],
			"unguarded-path": func(int64) error {
				_, err := f.q.GetWorkspace(f.ctx, f.workspace)
				return refused("a read by path with no check", err)
			},
			"unguarded-body": func(other int64) error {
				return refused("a body-bound start with no check", nil)
			},
		}

		leaks := sessionBoxGateLeaks(routes, proofs, probes, ben)

		require.Equal(t, []string{
			"get /api/repos/{owner}/{repo}/workspaces/{id}/unguarded (unguarded-path): a read by path with no check reached the box",
			"post /api/unguarded-body (unguarded-body): a body-bound start with no check reached the box",
			"post /api/unprobed: class unprobed has no probe",
		}, leaks)
	})
}

// member adds a repository member with write access.
func (f *agentBoxRelease) member(t *testing.T, name string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO users (username, lower_username, email, lower_email, is_active)
		VALUES ($1, $1, $2, $2, true) RETURNING id`, name, name+"@example.com").Scan(&id))
	_, err := f.pool.Exec(f.ctx, `INSERT INTO collaborators (repository_id, user_id, permission) VALUES ($1, $2, 'write')`, f.box(t).RepositoryID, id)
	require.NoError(t, err)
	return id
}
