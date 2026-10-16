package sandbox_test

import (
	"testing"

	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/stretchr/testify/require"
)

func TestEscapeGuestPathEscapesEachSegment(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"/workspace/a.txt", "workspace/a.txt"},
		{"workspace/a.txt", "workspace/a.txt"},
		{"  /workspace/a.txt\n", "workspace/a.txt"},
		{"dir/a b?c#d", "dir/a%20b%3Fc%23d"},
		// A literal percent stays literal, so an encoded dot segment cannot
		// decode into traversal on the guest side.
		{"%2e%2e/etc", "%252e%252e/etc"},
		{"...", "..."},
		{".hidden/..x", ".hidden/..x"},
	} {
		got, err := sandbox.EscapeGuestPath(tc.in)
		require.NoError(t, err, tc.in)
		require.Equal(t, tc.want, got, tc.in)
	}
}

func TestEscapeGuestPathRejectsUnsafeSegments(t *testing.T) {
	for _, in := range []string{"", "   ", "/", "a/../b", "..", "./a", "a/.", "a//b", "a/", "a\x00b"} {
		got, err := sandbox.EscapeGuestPath(in)
		require.Error(t, err, "%q", in)
		require.Empty(t, got, "%q", in)
	}
}
