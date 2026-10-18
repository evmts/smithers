package workspace

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateSessionCredentialBoundaries(t *testing.T) {
	token := []byte("smthrs_token")
	for _, sessionID := range []string{"a", "0", "a-b", strings.Repeat("a", 64)} {
		require.NoError(t, ValidateSessionCredential(sessionID, token), sessionID)
	}
	for _, sessionID := range []string{"", "-a", "A", "a_b", "a/b", "..", "a\n", strings.Repeat("a", 65)} {
		require.Error(t, ValidateSessionCredential(sessionID, token), "%q", sessionID)
	}
	for _, token := range [][]byte{[]byte("!"), []byte("~"), []byte(strings.Repeat("x", 512))} {
		require.NoError(t, ValidateSessionCredential("s", token), "%q", token)
	}
	for _, token := range [][]byte{{}, []byte("a b"), []byte("a\x7f"), []byte("a\n"), []byte("é"), []byte(strings.Repeat("x", 513))} {
		require.Error(t, ValidateSessionCredential("s", token), "%q", token)
	}
	require.NoError(t, ValidateSessionCredential("s", nil), "a nil token checks the session id alone")
	require.Error(t, ValidateSessionCredential("S", nil))
}

func TestValidateSessionCredentialIdentity(t *testing.T) {
	identity := SessionCredentialIdentity([]byte("smthrs_token"))
	require.Len(t, identity, 64)
	require.NotEqual(t, identity, SessionCredentialIdentity([]byte("smthrs_token2")))
	require.NoError(t, ValidateSessionCredentialIdentity(identity, false))
	require.NoError(t, ValidateSessionCredentialIdentity(identity, true))
	require.NoError(t, ValidateSessionCredentialIdentity("", true), "empty is the create-only marker")
	require.Error(t, ValidateSessionCredentialIdentity("", false), "rotation and deletion name the retained bearer")
	for _, invalid := range []string{strings.ToUpper(identity), identity[:63], identity + "0", "smthrs_token"} {
		require.Error(t, ValidateSessionCredentialIdentity(invalid, false), invalid)
	}
}
