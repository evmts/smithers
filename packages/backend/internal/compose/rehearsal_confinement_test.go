package compose

import (
	"slices"
	"testing"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// The confined rehearsal guest must give a supervised process the same
// writable temporary directory the shipped confinements give one
// (ProcessSandbox.ts binds `--tmpfs /tmp` for bubblewrap and `/tmp:rw,exec`
// for a container). The supervised-process channel creates its control socket
// directory under /tmp, because a unix socket path is bounded far below what a
// nested temporary directory spends; with an empty tmpfs root and no /tmp the
// coding host cannot supervise any native process, and the planner's own
// native snapshot failed with ENOENT before any rehearsal reached a coding
// turn. The mount is a private empty tmpfs, never a bind of this host's /tmp.
func TestConfinedRehearsalGuestHasItsOwnTmp(t *testing.T) {
	runtime := &rehearsalReviewRuntime{bubblewrap: "/usr/bin/bwrap", node: "/usr/bin/node"}
	confined := runtime.confined(
		workspaceapi.Workspace{Root: "/machines/lane/checkout"},
		workspaceapi.Command{Args: []string{"/usr/bin/node", "host.js"}},
	)
	args := confined.Args

	tmpfs := func(path string) bool {
		for index := 0; index+1 < len(args); index++ {
			if args[index] == "--tmpfs" && args[index+1] == path {
				return true
			}
		}
		return false
	}
	require.True(t, tmpfs("/"), "the guest root stays an empty tmpfs")
	require.True(t, tmpfs("/tmp"), "the guest has its own writable temporary directory")

	// The tmpfs is the guest's own: this host's /tmp is never bound into it,
	// read-only or writable, and the mount sits before the argument separator
	// so it can never be read as part of the supervised command.
	for index := 0; index+2 < len(args); index++ {
		if args[index] == "--ro-bind" || args[index] == "--bind" {
			require.NotEqual(t, "/tmp", args[index+1], "this host's /tmp is never bound into the guest")
		}
	}
	separator := slices.Index(args, "--")
	require.Positive(t, separator)
	require.Less(t, slices.Index(args, "--tmpfs"), separator)
	require.Equal(t, []string{"/usr/bin/node", "host.js"}, args[separator+1:])
}
