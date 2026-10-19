package services

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// codingBoxRepo is a git checkout committed at head, standing in for an
// agent box's working tree.
type codingBoxRepo struct {
	dir, home, head string
}

func newCodingBoxRepo(t *testing.T, files map[string]string) codingBoxRepo {
	t.Helper()
	for _, tool := range []string{"git", "timeout", "base64", "tail", "mktemp"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s is required to run the box script", tool)
		}
	}
	repo := codingBoxRepo{dir: t.TempDir(), home: t.TempDir()}
	if files == nil {
		files = map[string]string{}
	}
	files[".gitignore"] = "node_modules/\n"
	for name, content := range files {
		path := filepath.Join(repo.dir, name)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
		require.NoError(t, os.WriteFile(path, []byte(content), 0o644))
	}
	repo.git(t, "init", "-q")
	repo.git(t, "add", "-A")
	repo.git(t, "-c", "user.email=agent@example.com", "-c", "user.name=agent", "commit", "-qm", "turn")
	repo.head = strings.TrimSpace(repo.git(t, "rev-parse", "HEAD"))
	return repo
}

func (r codingBoxRepo) git(t *testing.T, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = r.dir
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, string(out))
	return string(out)
}

// run executes the command RunCodingTurnTest sends, as a runtime does: in the
// checkout, with the runtime's own environment, which here also holds a value
// the test must never see.
func (r codingBoxRepo) run(t *testing.T, command workspaceapi.Command, extraEnv ...string) workspaceapi.CommandResult {
	t.Helper()
	cmd := exec.Command(command.Args[0], command.Args[1:]...)
	cmd.Dir = r.dir
	cmd.Env = append([]string{"HOME=" + r.home, "PATH=" + os.Getenv("PATH"), "SMITHERS_LANDING_TOKEN=smithers_" + strings.Repeat("f", 40)}, extraEnv...)
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	code := 0
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		code = exitErr.ExitCode()
	} else {
		require.NoError(t, err)
	}
	return workspaceapi.CommandResult{ExitCode: code, Stdout: stdout.String(), Stderr: stderr.String()}
}

func (r codingBoxRepo) exec(t *testing.T, head string, timeout time.Duration, argv []string, extraEnv ...string) CodingTurnExec {
	t.Helper()
	outcome, err := parseCodingTurnExec(r.run(t, codingTurnTestCommand(head, timeout, argv), extraEnv...))
	require.NoError(t, err)
	return outcome
}

// The box script reports the test's own exit status and output, runs it
// with only HOME and PATH, and the test cannot forge the result line.
func TestCodingTurnScriptRunsTheTestAtHead(t *testing.T) {
	repo := newCodingBoxRepo(t, map[string]string{"a.txt": "a\n"})
	passed := repo.exec(t, repo.head, time.Minute, []string{"sh", "-c", "echo ok; echo err >&2"})
	require.Equal(t, CodingTurnExec{ExitCode: 0, Tail: []byte("ok\nerr\n")}, passed)

	failed := repo.exec(t, repo.head, time.Minute, []string{"sh", "-c", "echo 'smithers-coding-test exit 0 0'; exit 3"})
	require.Equal(t, 3, failed.ExitCode, "the test's output cannot forge the result line")
	require.Equal(t, "smithers-coding-test exit 0 0\n", string(failed.Tail))

	environment := repo.exec(t, repo.head, time.Minute, []string{"env"})
	require.Equal(t, 0, environment.ExitCode)
	lines := strings.Split(strings.TrimSpace(string(environment.Tail)), "\n")
	for _, line := range lines {
		name, _, _ := strings.Cut(line, "=")
		require.Contains(t, []string{"HOME", "PATH", "PWD", "SHLVL", "_", "OLDPWD"}, name, "env -i leaves only HOME and PATH: %s", line)
	}
	require.NotContains(t, string(environment.Tail), "SMITHERS_LANDING_TOKEN")

	missing := repo.exec(t, repo.head, time.Minute, []string{"no-such-command-for-smithers"})
	require.Equal(t, 127, missing.ExitCode)

	ignored := filepath.Join(repo.dir, "node_modules", "dep.js")
	require.NoError(t, os.MkdirAll(filepath.Dir(ignored), 0o755))
	require.NoError(t, os.WriteFile(ignored, []byte("x"), 0o644))
	require.Equal(t, 0, repo.exec(t, repo.head, time.Minute, []string{"true"}).ExitCode, "ignored files are not the tree")
}

// A working tree that is not exactly head, or that cannot be read, never runs
// the test: the receipt is refused, never passed.
func TestCodingTurnScriptRefusesATreeThatIsNotHead(t *testing.T) {
	repo := newCodingBoxRepo(t, map[string]string{"a.txt": "a\n", "b.txt": "b\n"})
	marker := filepath.Join(t.TempDir(), "ran")
	touch := []string{"sh", "-c", `touch "$1"`, "test", marker}
	refused := func(name, refusal string, outcome CodingTurnExec) {
		t.Helper()
		require.Equal(t, CodingTurnExec{Refusal: refusal}, outcome, name)
		_, err := os.Stat(marker)
		require.ErrorIs(t, err, os.ErrNotExist, "%s: the test must not run", name)
	}

	require.NoError(t, os.WriteFile(filepath.Join(repo.dir, "a.txt"), []byte("changed\n"), 0o644))
	refused("modified", "tree dirty", repo.exec(t, repo.head, time.Minute, touch))
	repo.git(t, "checkout", "-q", "--", "a.txt")

	require.NoError(t, os.Remove(filepath.Join(repo.dir, "b.txt")))
	refused("deleted", "tree dirty", repo.exec(t, repo.head, time.Minute, touch))
	repo.git(t, "checkout", "-q", "--", "b.txt")

	require.NoError(t, os.Chmod(filepath.Join(repo.dir, "a.txt"), 0o755))
	refused("mode", "tree dirty", repo.exec(t, repo.head, time.Minute, touch))
	require.NoError(t, os.Chmod(filepath.Join(repo.dir, "a.txt"), 0o644))

	require.NoError(t, os.WriteFile(filepath.Join(repo.dir, "new.txt"), []byte("n\n"), 0o644))
	refused("untracked", "tree dirty", repo.exec(t, repo.head, time.Minute, touch))
	require.NoError(t, os.Remove(filepath.Join(repo.dir, "new.txt")))

	refused("absent head", "tree missing", repo.exec(t, strings.Repeat("0", 39)+"1", time.Minute, touch))

	// A git whose untracked listing fails must refuse, not read as clean
	// (guardian b-wutg1k: `| head -c 1` once masked exit 128).
	realGit, err := exec.LookPath("git")
	require.NoError(t, err)
	shim := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(shim, "git"), []byte("#!/bin/sh\nfor a in \"$@\"; do [ \"$a\" = ls-files ] && exit 128; done\nexec "+realGit+" \"$@\"\n"), 0o755))
	refused("untracked listing fails", "tree unread", repo.exec(t, repo.head, time.Minute, touch, "PATH="+shim+":"+os.Getenv("PATH")))
	require.NoError(t, os.WriteFile(filepath.Join(shim, "git"), []byte("#!/bin/sh\nfor a in \"$@\"; do [ \"$a\" = diff-files ] && exit 128; done\nexec "+realGit+" \"$@\"\n"), 0o755))
	refused("diff fails", "tree unread", repo.exec(t, repo.head, time.Minute, touch, "PATH="+shim+":"+os.Getenv("PATH")))

	// Repository config cannot hook the tree read: a planted fsmonitor
	// never runs, and the clean tree still runs the test.
	hooked := filepath.Join(t.TempDir(), "hooked")
	hook := filepath.Join(t.TempDir(), "fsmonitor")
	require.NoError(t, os.WriteFile(hook, []byte("#!/bin/sh\ntouch "+hooked+"\n"), 0o755))
	repo.git(t, "config", "core.fsmonitor", hook)
	require.Equal(t, 0, repo.exec(t, repo.head, time.Minute, touch).ExitCode)
	_, err = os.Stat(marker)
	require.NoError(t, err, "a clean tree runs the test")
	_, err = os.Stat(hooked)
	require.ErrorIs(t, err, os.ErrNotExist, "repository config must not run during the tree read")
}

// Output is bounded while the test runs, and the exit status is the test's
// own even when its output is cut.
func TestCodingTurnScriptBoundsOutputAndKeepsTheExitStatus(t *testing.T) {
	repo := newCodingBoxRepo(t, nil)
	scratch := t.TempDir()
	report := filepath.Join(t.TempDir(), "size")
	flood := []string{"sh", "-c", `head -c 20000000 /dev/zero | tr '\000' a; du -sk "$1" > "$2"; exit 4`, "flood", scratch, report}
	outcome := repo.exec(t, repo.head, time.Minute, flood, "TMPDIR="+scratch)
	require.Equal(t, 4, outcome.ExitCode)
	require.True(t, outcome.Truncated)
	require.Len(t, outcome.Tail, 8192)
	raw, err := os.ReadFile(report)
	require.NoError(t, err)
	kib, err := strconv.Atoi(strings.Fields(string(raw))[0])
	require.NoError(t, err)
	require.Less(t, kib, 64, "20 MB of output must not reach the box's disk")

	small := repo.exec(t, repo.head, time.Minute, []string{"sh", "-c", "printf x; exit 0"})
	require.False(t, small.Truncated)
}

// A test that outlives its timeout is refused, and processes a test leaves
// behind in its group do not hold the result.
func TestCodingTurnScriptTimesOutAndReapsLeftovers(t *testing.T) {
	repo := newCodingBoxRepo(t, nil)
	started := time.Now()
	require.Equal(t, CodingTurnExec{Refusal: "timeout"}, repo.exec(t, repo.head, 2*time.Second, []string{"sleep", "60"}))
	require.Less(t, time.Since(started), 20*time.Second)

	started = time.Now()
	leftover := repo.exec(t, repo.head, time.Minute, []string{"sh", "-c", "(sleep 60; echo late) & echo done"})
	require.Equal(t, 0, leftover.ExitCode)
	require.Equal(t, "done\n", string(leftover.Tail))
	require.Less(t, time.Since(started), 20*time.Second)
}

// The working mode reports the box's commit and runs nothing else; a jj
// checkout reports its snapshotted working copy, which moves with any edit.
func TestCodingTurnScriptReportsTheWorkingCommit(t *testing.T) {
	repo := newCodingBoxRepo(t, map[string]string{"a.txt": "a\n"})
	working := func() string {
		t.Helper()
		outcome, err := parseCodingTurnExec(repo.run(t, codingTurnWorkingCommand()))
		require.NoError(t, err)
		return outcome.Working
	}
	require.Equal(t, repo.head, working())
	require.NoError(t, os.WriteFile(filepath.Join(repo.dir, "a.txt"), []byte("edited\n"), 0o644))
	require.Equal(t, repo.head, working(), "a plain git checkout reports HEAD")

	if _, err := exec.LookPath("jj"); err != nil {
		t.Skip("jj is required for the working-copy snapshot")
	}
	jjRepo := newCodingBoxRepo(t, map[string]string{"a.txt": "a\n"})
	cmd := exec.Command("jj", "git", "init", "--colocate")
	cmd.Dir = jjRepo.dir
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, string(out))
	snapshot, err := parseCodingTurnExec(jjRepo.run(t, codingTurnWorkingCommand()))
	require.NoError(t, err)
	require.Regexp(t, `^[0-9a-f]{40}$`, snapshot.Working)
	require.NoError(t, os.WriteFile(filepath.Join(jjRepo.dir, "a.txt"), []byte("edited\n"), 0o644))
	moved, err := parseCodingTurnExec(jjRepo.run(t, codingTurnWorkingCommand()))
	require.NoError(t, err)
	require.NotEqual(t, snapshot.Working, moved.Working, "jj snapshots an edit into a new working-copy commit")
	require.Equal(t, CodingTurnExec{At: moved.Working}, jjRepo.exec(t, snapshot.Working, time.Minute, []string{"true"}), "the test refuses a head the working copy moved past")
}

func TestParseCodingTurnExecRefusesMalformedResults(t *testing.T) {
	for _, result := range []workspaceapi.CommandResult{
		{ExitCode: 70},
		{OutputTruncated: true, Stdout: "smithers-coding-test exit 0 0\n"},
		{Stdout: ""},
		{Stdout: "smithers-coding-test exit 0\n"},
		{Stdout: "smithers-coding-test exit 256 0\n"},
		{Stdout: "smithers-coding-test exit -1 0\n"},
		{Stdout: "smithers-coding-test exit 0 2\n"},
		{Stdout: "smithers-coding-test exit 0 0 !!!\n"},
		{Stdout: "smithers-coding-test at abc\n"},
		{Stdout: "smithers-coding-test tree clean\n"},
		{Stdout: "other exit 0 0\n"},
	} {
		_, err := parseCodingTurnExec(result)
		require.Error(t, err, result.Stdout)
	}
	outcome, err := parseCodingTurnExec(workspaceapi.CommandResult{Stdout: "noise\nsmithers-coding-test lost\n"})
	require.NoError(t, err)
	require.Equal(t, CodingTurnExec{Refusal: "lost"}, outcome)
}

// codingBoxRuntime is an isolated runtime with the offline runner, whose
// one guest is a local checkout. A call scoped to another guest is refused.
type codingBoxRuntime struct {
	workspaceapi.WorkspaceRuntime
	repo     codingBoxRepo
	t        *testing.T
	guest    string
	mu       sync.Mutex
	commands []workspaceapi.Command
}

func (*codingBoxRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (r *codingBoxRuntime) RunOfflineAsDeveloper(ctx context.Context, _ string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	if op, ok := workspaceapi.OperationFromContext(ctx); !ok || op.OperationID == "" {
		return workspaceapi.CommandResult{}, errors.New("no admitted operation")
	}
	if workspaceapi.GuestFromContext(ctx) != r.guest {
		return workspaceapi.CommandResult{}, workspaceapi.ErrGuestGone
	}
	r.mu.Lock()
	r.commands = append(r.commands, command)
	r.mu.Unlock()
	return r.repo.run(r.t, command), nil
}

// The command reaching the runtime carries no environment, runs the script
// from the checkout root, and names the head and the argv; the hosted runtime
// (plue workspaceruntime ExecuteCommand) runs it as runuser -u developer.
func TestRunCodingTurnTestCommandBoundary(t *testing.T) {
	command := codingTurnTestCommand(strings.Repeat("a", 40), codingTurnTestTimeout, []string{"npm", "run", "test"})
	require.Equal(t, []string{"/bin/sh", "-c", codingTurnTestScript, "smithers-coding-test", "test", strings.Repeat("a", 40), "600", "npm", "run", "test"}, command.Args)
	require.Equal(t, []string{"/bin/sh", "-c", codingTurnTestScript, "smithers-coding-test", "working", "-", "0"}, codingTurnWorkingCommand().Args)
	require.Empty(t, command.Environment)
	require.Empty(t, command.Directory)
	require.Contains(t, codingTurnTestScript, `timeout -k 10 "$limit" env -i HOME="$HOME" PATH="$PATH" "$@"`)
	for _, flag := range []string{"-c core.fsmonitor=false", "-c core.hooksPath=/dev/null", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "--config fsmonitor.backend=none"} {
		require.Contains(t, codingTurnTestScript, flag)
	}
	require.Equal(t, 10*time.Minute, codingTurnTestTimeout)
}

func TestRunCodingTurnTestRunsOnlyOnTheCapturedGuest(t *testing.T) {
	pool := newProductTestPool(t)
	q := db.New(pool)
	userID, repoID := setupTestUserAndRepo(t, pool)
	var workspaceID string
	require.NoError(t, pool.QueryRow(t.Context(), `INSERT INTO workspaces(repository_id,user_id,name,status,vm_id) VALUES($1,$2,'box','running','guest-1') RETURNING id::text`, repoID, userID).Scan(&workspaceID))
	repo := newCodingBoxRepo(t, nil)
	runtime := &codingBoxRuntime{repo: repo, t: t, guest: "guest-1"}
	workspaces := NewWorkspaceService(q, WithWorkspaceRuntime(runtime))

	guest, err := workspaces.CodingTurnGuest(t.Context(), workspaceID)
	require.NoError(t, err)
	require.Equal(t, "guest-1", guest)
	outcome, err := workspaces.RunCodingTurnTest(t.Context(), workspaceID, guest, repo.head, []string{"sh", "-c", "exit 5"})
	require.NoError(t, err)
	require.Equal(t, 5, outcome.ExitCode)
	require.Len(t, runtime.commands, 1)

	_, err = pool.Exec(t.Context(), `UPDATE workspaces SET vm_id='guest-2' WHERE id=$1`, workspaceID)
	require.NoError(t, err)
	_, err = workspaces.RunCodingTurnTest(t.Context(), workspaceID, guest, repo.head, []string{"true"})
	require.ErrorIs(t, err, errCodingTurnGuestChanged)
	_, err = pool.Exec(t.Context(), `UPDATE workspaces SET vm_id='guest-1', status='suspended' WHERE id=$1`, workspaceID)
	require.NoError(t, err)
	_, err = workspaces.RunCodingTurnTest(t.Context(), workspaceID, guest, repo.head, []string{"true"})
	require.ErrorIs(t, err, errCodingTurnGuestChanged)
	_, err = workspaces.CodingTurnGuest(t.Context(), workspaceID)
	require.Error(t, err, "a suspended box has no running guest")
	require.Len(t, runtime.commands, 1, "no test runs on a replaced or stopped guest")

	_, err = pool.Exec(t.Context(), `UPDATE workspaces SET status='running' WHERE id=$1`, workspaceID)
	require.NoError(t, err)
	for name, service := range map[string]*WorkspaceService{
		"no runtime":                                     NewWorkspaceService(q),
		"a process runtime on the API host":              NewWorkspaceService(q, WithWorkspaceRuntime(&toolsRuntime{execution: true})),
		"an isolated runtime without the offline runner": NewWorkspaceService(q, WithWorkspaceRuntime(&interruptedReleaseRuntime{guest: &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning}})),
	} {
		_, err = service.RunCodingTurnTest(t.Context(), workspaceID, guest, repo.head, []string{"true"})
		require.ErrorIs(t, err, errCodingTurnOfflineUnavailable, name)
	}
	// The runtime itself refuses a guest the row still names but that is gone.
	runtime.guest = "guest-1-rebuilt"
	_, err = workspaces.RunCodingTurnTest(t.Context(), workspaceID, guest, repo.head, []string{"true"})
	require.ErrorIs(t, err, errCodingTurnGuestChanged)
	for _, bad := range [][2]string{{"", repo.head}, {guest, "HEAD"}} {
		_, err = workspaces.RunCodingTurnTest(t.Context(), workspaceID, bad[0], bad[1], []string{"true"})
		require.Error(t, err)
	}
	require.Len(t, runtime.commands, 1)
}
