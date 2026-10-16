package microsandbox

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/hostexec"
	"github.com/smithersai/smithers/packages/backend/internal/machined"
)

// machineHostObjectImporter is the registry callback this package's host
// fixture binds, written the way the install writes it in compose's
// machineObjectImporter: the authenticated branch selects its repository
// through HostObjects.Visit, which holds the repository engine's
// write/maintenance exclusion for the whole import, and the registry's commit
// callback is passed STRAIGHT THROUGH to GitBundleImporter.
//
// machined.ObjectImporter gained that fourth argument so a durable import runs
// inside the boot-replacement fence. HostObjects.Import is deliberately the
// internal three-argument path and is not this callback, so binding it was a
// compile error — and the repair must not be an adapter that supplies its own
// commit, because that would run the durable writes OUTSIDE the fence the
// registry handed it. TestMachineHostObjectImporterRunsItsWritesInsideTheFence
// is that negative.
func machineHostObjectImporter(objects machined.HostObjects) machined.ObjectImporter {
	return func(ctx context.Context, branch string, file *os.File, commit func(func() error) error) error {
		return objects.Visit(ctx, branch, func(path string) error {
			// Exactly compose's resolve: the branch's authority is Visit,
			// which holds the exclusion for the whole import; the resolve is
			// the repository it selected.
			return machined.GitBundleImporter(func(context.Context, string) (string, error) {
				return path, nil
			})(ctx, branch, file, commit)
		})
	}
}

// THE FENCE IS USED, NOT SUPPLIED. No VM boots here: this is the host half of
// the fixture binding, held against real git.
func TestMachineHostObjectImporterRunsItsWritesInsideTheFence(t *testing.T) {
	const branch = "22222222-2222-4222-8222-222222222222"
	repository, bundle, head := machineBundleFixture(t)
	objects := machined.HostObjects{
		Visit: func(_ context.Context, _ string, visit func(string) error) error { return visit(repository) },
	}
	importer := machineHostObjectImporter(objects)
	incoming := "refs/smithers/branches/" + branch + "/incoming/" + head
	pinned := func() bool {
		return hostexec.Git(t.Context(), "-C", repository, "rev-parse", "--verify", incoming).Run() == nil
	}
	require.False(t, pinned(), "the fixture repository already holds the imported objects")

	// A fence that REFUSES must refuse the import, and nothing may land. An
	// adapter that supplied its own commit would import anyway and this is
	// where that would show.
	refused := errors.New("boot replacement is fencing durable writes")
	calls := 0
	require.ErrorIs(t, importer(t.Context(), branch, mustOpen(t, bundle),
		func(func() error) error { calls++; return refused }), refused,
		"the importer did not run its durable writes through the registry's commit fence")
	require.Equal(t, 1, calls, "the importer never called the fence it was given")
	require.False(t, pinned(), "a refused fence still let the import write to the host repository")

	// And with the fence open, the same callback imports and pins.
	used := false
	require.NoError(t, importer(t.Context(), branch, mustOpen(t, bundle),
		func(write func() error) error { used = true; return write() }))
	require.True(t, used, "the import ran outside the fence")
	require.True(t, pinned(), "the imported objects were never pinned under the branch's incoming refs")

	// And the shipped importer still refuses a branch that is not an
	// authenticated machine branch, before any write and before the fence.
	notABranch := 0
	require.ErrorIs(t, importer(t.Context(), "../../etc", mustOpen(t, bundle),
		func(write func() error) error { notABranch++; return write() }), machined.ErrUnauthorized)
	require.Zero(t, notABranch, "an unauthenticated branch reached the durable write")
}

func mustOpen(t *testing.T, path string) *os.File {
	t.Helper()
	file, err := os.Open(path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = file.Close() })
	return file
}

// machineBundleFixture builds a real bare host repository and a real bundle
// with real git, so the import under test is the shipped one.
func machineBundleFixture(t *testing.T) (repository, bundle, head string) {
	t.Helper()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	repository, bundle = filepath.Join(root, "host"), filepath.Join(root, "machine.bundle")
	git := func(args ...string) string {
		out, err := hostexec.Git(t.Context(), append([]string{
			"-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "core.hooksPath=/dev/null"}, args...)...).CombinedOutput()
		require.NoError(t, err, "git %v: %s", args, out)
		return strings.TrimSpace(string(out))
	}
	git("init", "--initial-branch=main", source)
	require.NoError(t, os.WriteFile(filepath.Join(source, "README.md"), []byte("host base\n"), 0600))
	git("-C", source, "add", ".")
	git("-C", source, "commit", "-m", "base")
	git("clone", "--bare", source, repository)
	require.NoError(t, os.WriteFile(filepath.Join(source, "README.md"), []byte("guest work\n"), 0600))
	git("-C", source, "add", ".")
	git("-C", source, "commit", "-m", "guest")
	head = git("-C", source, "rev-parse", "HEAD")
	git("-C", source, "bundle", "create", bundle, "--all")
	return repository, bundle, head
}
