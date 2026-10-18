package webhook

import (
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// On an IPv6-only host with NAT64, or through a 6to4 relay, an IPv6 address
// that embeds an IPv4 address reaches that IPv4 address. The embedded address
// decides whether the target is restricted.
func TestIsRestrictedIPChecksEmbeddedIPv4(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		ip         string
		restricted bool
	}{
		{"64:ff9b::a9fe:a9fe", true},     // NAT64 well-known prefix → 169.254.169.254
		{"64:ff9b::10.0.0.1", true},      // NAT64 → RFC 1918
		{"64:ff9b::127.0.0.1", true},     // NAT64 → loopback
		{"64:ff9b::5db8:d822", false},    // NAT64 → 93.184.216.34
		{"2002:a9fe:a9fe::1", true},      // 6to4 → 169.254.169.254
		{"2002:c0a8:0101::", true},       // 6to4 → 192.168.1.1
		{"2002:5db8:d822::1", false},     // 6to4 → 93.184.216.34
		{"::ffff:10.0.0.1", true},        // IPv4-mapped
		{"198.18.0.1", true},             // benchmark range
		{"192.0.0.170", true},            // IETF protocol assignments (NAT64 discovery)
		{"240.0.0.1", true},              // reserved
		{"255.255.255.255", true},        // broadcast
		{"2606:2800:220:1::1946", false}, // ordinary public IPv6
	} {
		parsed := net.ParseIP(tc.ip)
		require.NotNil(t, parsed, tc.ip)
		assert.Equal(t, tc.restricted, IsRestrictedIP(parsed), tc.ip)
	}
}
