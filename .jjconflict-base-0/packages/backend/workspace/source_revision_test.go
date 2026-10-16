package workspace

import (
	"context"
	"errors"
	"io/fs"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// scriptedSourceRuntime answers ResolveSourceRevision's three runtime calls
// from fixed evidence. A fake stands in for a booted workspace runtime: the
// rule under test is how the evidence is judged, and a real runtime needs a
// machine.
type scriptedSourceRuntime struct {
	state   WorkspaceState
	entries []FileEntry
	// answers maps a command's first two arguments to its results, used in
	// order; the last result repeats.
	answers map[string][]CommandResult
	calls   []string
}

func (r *scriptedSourceRuntime) InspectWorkspace(context.Context, string) (Workspace, error) {
	return Workspace{ID: "w", State: r.state}, nil
}

func (r *scriptedSourceRuntime) ListFiles(context.Context, string, string) ([]FileEntry, error) {
	return r.entries, nil
}

func (r *scriptedSourceRuntime) ExecuteCommand(_ context.Context, _ string, command Command) (CommandResult, error) {
	key := strings.Join(command.Args[:2], " ")
	r.calls = append(r.calls, key)
	results := r.answers[key]
	if len(results) == 0 {
		return CommandResult{}, errors.New("unexpected command " + key)
	}
	result := results[0]
	if len(results) > 1 {
		r.answers[key] = results[1:]
	}
	return result, nil
}

var (
	revisionA = strings.Repeat("a", 40)
	revisionB = strings.Repeat("b", 40)
)

func gitRuntime(heads []string, status CommandResult) *scriptedSourceRuntime {
	var results []CommandResult
	for _, head := range heads {
		results = append(results, CommandResult{Stdout: head + "\n"})
	}
	return &scriptedSourceRuntime{state: WorkspaceRunning, entries: []FileEntry{{Name: ".git", IsDir: true, Mode: fs.ModeDir}},
		answers: map[string][]CommandResult{"git rev-parse": results, "git status": {status}}}
}

func TestResolveSourceRevisionReadsTheJujutsuWorkingCopyCommit(t *testing.T) {
	runtime := &scriptedSourceRuntime{state: WorkspaceRunning,
		entries: []FileEntry{{Name: ".git", IsDir: true, Mode: fs.ModeDir}, {Name: ".jj", IsDir: true, Mode: fs.ModeDir}},
		answers: map[string][]CommandResult{"jj --color=never": {{Stdout: revisionA + "\n"}}}}
	revision, err := ResolveSourceRevision(t.Context(), runtime, "w")
	require.NoError(t, err)
	require.Equal(t, revisionA, revision)
	require.Equal(t, []string{"jj --color=never"}, runtime.calls, "a colocated repository resolves through Jujutsu alone")
}

func TestResolveSourceRevisionAcceptsACleanGitCheckout(t *testing.T) {
	runtime := gitRuntime([]string{revisionA, revisionA}, CommandResult{})
	revision, err := ResolveSourceRevision(t.Context(), runtime, "w")
	require.NoError(t, err)
	require.Equal(t, revisionA, revision)
}

func TestResolveSourceRevisionRefusesUnreliableEvidence(t *testing.T) {
	for name, runtime := range map[string]*scriptedSourceRuntime{
		"dirty worktree":       gitRuntime([]string{revisionA, revisionA}, CommandResult{Stdout: "?? new.txt\n"}),
		"head moved":           gitRuntime([]string{revisionA, revisionB}, CommandResult{}),
		"status failed":        gitRuntime([]string{revisionA}, CommandResult{ExitCode: 128}),
		"status truncated":     gitRuntime([]string{revisionA}, CommandResult{OutputTruncated: true}),
		"uppercase revision":   gitRuntime([]string{strings.ToUpper(revisionA)}, CommandResult{}),
		"short revision":       gitRuntime([]string{revisionA[:39]}, CommandResult{}),
		"non-hex revision":     gitRuntime([]string{strings.Repeat("g", 40)}, CommandResult{}),
		"no repository":        {state: WorkspaceRunning, entries: []FileEntry{{Name: "README.md"}}},
		"symlinked git marker": {state: WorkspaceRunning, entries: []FileEntry{{Name: ".git", Mode: fs.ModeSymlink}}},
		"jj snapshot failed": {state: WorkspaceRunning, entries: []FileEntry{{Name: ".jj", IsDir: true, Mode: fs.ModeDir}},
			answers: map[string][]CommandResult{"jj --color=never": {{ExitCode: 1}}}},
		"jj output truncated": {state: WorkspaceRunning, entries: []FileEntry{{Name: ".jj", IsDir: true, Mode: fs.ModeDir}},
			answers: map[string][]CommandResult{"jj --color=never": {{Stdout: revisionA, OutputTruncated: true}}}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := ResolveSourceRevision(t.Context(), runtime, "w")
			require.Error(t, err)
			if name != "symlinked git marker" {
				require.ErrorIs(t, err, ErrWorkspaceSourceUnavailable)
			}
		})
	}
}

func TestResolveSourceRevisionNeedsARunningWorkspace(t *testing.T) {
	runtime := gitRuntime([]string{revisionA, revisionA}, CommandResult{})
	runtime.state = "stopped"
	_, err := ResolveSourceRevision(t.Context(), runtime, "w")
	require.ErrorIs(t, err, ErrWorkspaceStopped)
	require.Empty(t, runtime.calls, "a stopped workspace runs no command")
}
