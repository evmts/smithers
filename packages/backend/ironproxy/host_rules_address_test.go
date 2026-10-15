package ironproxy

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// iron-proxy matches a rule against the request's Host text. An address has
// many spellings ("2001:db8::1", "2001:db8:0::1", "::ffff:10.0.0.1" for
// "10.0.0.1"), so a rule can narrow only the one it names: under "*" every
// other spelling would reach the same address in full.
func TestHostRulesRefuseAddressLiterals(t *testing.T) {
	t.Parallel()
	for _, host := range []string{"2001:db8::1", "2001:db8:0::1", "10.0.0.1", "::ffff:10.0.0.1"} {
		_, err := Render(Spec{
			ListenAddr: "127.0.0.1:1", HTTPListen: "127.0.0.1:2", HTTPSListen: "127.0.0.1:3", MetricsListen: "127.0.0.1:4",
			CACertPath: "ca.crt", CAKeyPath: "ca.key",
			HostRules: []sandbox.EgressHostRule{{Host: host, Methods: []string{"GET"}, Paths: []string{"/allowed"}}},
		})
		require.ErrorIs(t, err, ErrInvalidSpec, host)
		require.ErrorContains(t, err, "address", host)
	}
}
