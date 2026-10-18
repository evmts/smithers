package egressrelay

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/ironproxy"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// intermediateCA returns a root CA and an intermediate it signed, the shape of
// a worker's egress signing CA under a cluster root.
func intermediateCA(t *testing.T) (root ironproxy.CA, intermediate ironproxy.CA) {
	t.Helper()
	rootKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	rootTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test egress root"}, NotBefore: time.Now().Add(-time.Minute),
		NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, MaxPathLen: 1,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
	}
	rootDER, err := x509.CreateCertificate(rand.Reader, rootTemplate, rootTemplate, &rootKey.PublicKey, rootKey)
	require.NoError(t, err)
	rootCert, err := x509.ParseCertificate(rootDER)
	require.NoError(t, err)
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "test egress intermediate"}, NotBefore: time.Now().Add(-time.Minute),
		NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, MaxPathLenZero: true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
	}, rootCert, &key.PublicKey, rootKey)
	require.NoError(t, err)
	return ironproxy.CA{CertPEM: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rootDER}), KeyPEM: ecKeyPEM(t, rootKey)},
		ironproxy.CA{CertPEM: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), KeyPEM: ecKeyPEM(t, key)}
}

func ecKeyPEM(t *testing.T, key *ecdsa.PrivateKey) []byte {
	t.Helper()
	der, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)
	return pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
}

// A relay given a signing CA issues its leaves from it and serves the chain,
// so a guest that trusts only the root above that CA verifies the relay.
func TestRelaySignsLeavesWithTheGivenCA(t *testing.T) {
	record := &seen{}
	upstream := httptest.NewTLSServer(echoUpstream(record))
	t.Cleanup(upstream.Close)
	upstreamRoots := x509.NewCertPool()
	upstreamRoots.AddCert(upstream.Certificate())
	root, intermediate := intermediateCA(t)
	relay := newRelay(t, Config{Local: []string{upstream.Listener.Addr().String()}, RootCAs: upstreamRoots, CA: &intermediate})
	grant, err := relay.Bind("ws", []sandbox.EgressProxySecret{boundSecret("127.0.0.1")})
	require.NoError(t, err)
	assert.Equal(t, intermediate.CertPEM, grant.CACertPEM, "the grant names the signing CA")

	grant.CACertPEM = root.CertPEM // the guest trusts only the root
	response, err := proxiedClient(t, grant).Do(placeholderRequest(t, upstream.URL))
	require.NoError(t, err)
	defer response.Body.Close()
	assertInjectedAndMasked(t, record, response)

	_, err = New(Config{Listener: mustListen(t), CA: &ironproxy.CA{CertPEM: root.CertPEM, KeyPEM: intermediate.KeyPEM}})
	assert.Error(t, err, "a CA whose key is not its certificate's is refused")
}

// connectProxy is an HTTP CONNECT proxy that records each target it tunnels.
type connectProxy struct {
	mu      sync.Mutex
	targets []string
}

func (p *connectProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodConnect {
		http.Error(w, "CONNECT only", http.StatusMethodNotAllowed)
		return
	}
	p.mu.Lock()
	p.targets = append(p.targets, r.Host)
	p.mu.Unlock()
	upstream, err := net.Dial("tcp", r.Host)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	client, buffered, err := w.(http.Hijacker).Hijack()
	if err != nil {
		upstream.Close()
		return
	}
	_, _ = io.WriteString(client, "HTTP/1.1 200 Connection Established\r\n\r\n")
	go func() {
		_, _ = io.Copy(upstream, io.MultiReader(buffered.Reader, client))
		upstream.Close()
	}()
	_, _ = io.Copy(client, upstream)
	client.Close()
}

// A relay given an upstream proxy sends every bound request through it and
// dials nothing else: the proxy applies the destination policy.
func TestRelayForwardsThroughTheUpstreamProxy(t *testing.T) {
	record := &seen{}
	upstream := httptest.NewTLSServer(echoUpstream(record))
	t.Cleanup(upstream.Close)
	upstreamRoots := x509.NewCertPool()
	upstreamRoots.AddCert(upstream.Certificate())
	proxy := &connectProxy{}
	proxyServer := httptest.NewServer(proxy)
	t.Cleanup(proxyServer.Close)
	proxyURL, err := url.Parse(proxyServer.URL)
	require.NoError(t, err)
	// No Local entry: a direct dial to the loopback upstream would be refused.
	relay := newRelay(t, Config{RootCAs: upstreamRoots, UpstreamProxy: proxyURL})
	grant, err := relay.Bind("ws", []sandbox.EgressProxySecret{boundSecret("127.0.0.1")})
	require.NoError(t, err)

	response, err := proxiedClient(t, grant).Do(placeholderRequest(t, upstream.URL))
	require.NoError(t, err)
	defer response.Body.Close()
	assertInjectedAndMasked(t, record, response)
	proxy.mu.Lock()
	assert.Equal(t, []string{upstream.Listener.Addr().String()}, proxy.targets)
	proxy.mu.Unlock()

	// A host the binding does not name never reaches the proxy.
	_, port, _ := net.SplitHostPort(upstream.Listener.Addr().String())
	refused, err := proxiedClient(t, grant).Do(placeholderRequest(t, "https://localhost:"+port))
	if err == nil {
		refused.Body.Close()
	}
	proxy.mu.Lock()
	assert.Len(t, proxy.targets, 1)
	proxy.mu.Unlock()
}

func mustListen(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })
	return listener
}

// Mask scrubs text another process wrote, such as an upstream proxy's log
// line, exactly as the relay masks a response: whole values, escaped forms
// and runs of fragmentMin bytes. Text for another workspace is unchanged.
func TestRelayMasksTextForABinding(t *testing.T) {
	relay := newRelay(t, Config{})
	_, err := relay.Bind("ws", []sandbox.EgressProxySecret{opacitySecret(opacityName, opacityValue)})
	require.NoError(t, err)
	line := `{"path":"/v1/p/` + opacityValue + `/z","url":"/v1/q?key=` + url.QueryEscape(opacityValue) + `","hint":"` + opacityValue[5:20] + `"}`
	masked := relay.Mask("ws", line)
	assert.Equal(t, `{"path":"/v1/p/`+opacityName+`/z","url":"/v1/q?key=`+opacityName+`","hint":"`+opacityName+`"}`, masked)
	assert.Less(t, longestFragment(masked, opacityValue), fragmentMin)
	assert.Equal(t, line, relay.Mask("other", line), "another workspace's text is not this binding's to mask")
	relay.Revoke("ws")
	assert.Equal(t, line, relay.Mask("ws", line), "a revoked binding masks nothing")
}
