// Package egressrelay is the workspace runtimes' credential-substituting
// egress relay (#3154). It applies the per-sandbox egress proxy's masked
// injection model (sandbox.EgressProxySecret) in process: a guest holds only
// each secret's placeholder and a revocable relay credential; the relay swaps
// the placeholder for the value on requests to the secret's bound hosts, at
// its bound locations, and masks the value out of every response.
//
// A placeholder is swapped only where it stands whole: a whitespace-delimited
// token of a bound header, a whole path segment, or a whole query value. A
// request that carries a bound placeholder inside a larger token is refused,
// because the upstream would receive a mangled value and could echo part of
// it back.
//
// The relay is a guest's route to the bound hosts and nowhere else. It dials
// only hosts a live binding names, never a private, loopback, link-local or
// metadata address unless Config.Local names that exact address, and
// intercepts TLS with its own in-memory CA so HTTPS requests can be
// substituted. Values live only in this process's memory: they are never
// logged, persisted, or written into the guest. Masking replaces a value's
// literal, query-escaped and path-escaped bytes, and every run of fragmentMin
// or more of those bytes; an upstream that echoes a value re-encoded is not
// masked.
package egressrelay

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/smithersai/smithers/packages/backend/ironproxy"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// tunnelIdleTimeout closes an intercepted tunnel that sends no request.
const tunnelIdleTimeout = 5 * time.Minute

// fragmentMin is the shortest run of a bound value form's bytes the relay
// masks on its own. An upstream that rejects a credential may echo part of it,
// as a model provider's "Incorrect API key provided: sk-abcde***wxyz" does; a
// run this long is masked like the whole value. A shorter value masks whole.
const fragmentMin = 8

// proxyUser is the fixed user name of the relay credential; the password is
// the binding token.
const proxyUser = "smithers"

// Config configures a relay.
type Config struct {
	// Listener is where guests reach the relay. It must be a loopback
	// listener: a guest reaches it through its runtime's host bridge.
	Listener net.Listener
	// Local lists exact host:port destinations the relay may dial although
	// they are private or loopback, such as the backend's own listener.
	Local []string
	// RootCAs verifies upstream TLS certificates. Nil uses the system pool.
	RootCAs *x509.CertPool
	// DenyCIDRs replaces ironproxy.DefaultUpstreamDenyCIDRs. Tests only.
	DenyCIDRs []string
	// Audit, when set, receives one value-free event per request the relay
	// decides: forwarded, refused, or failed. It runs on the request's
	// goroutine, so it must not block; a caller hands the event to a bounded
	// non-blocking queue.
	Audit func(AuditEvent)
}

// AuditEvent is one relay request's value-free record. It carries no header,
// body, query string, credential or secret value: the path is query-free and
// replaced by "/[redacted]" when a secret was swapped into it, and Swapped
// names the secrets whose placeholder the request carried, never their values.
type AuditEvent struct {
	WorkspaceID string
	Time        time.Time
	Host        string
	Method      string
	Path        string
	// Status is the status the guest saw: upstream's, or the relay's refusal.
	Status  int
	Allowed bool
	// Swapped lists the names of the secrets substituted into the request.
	Swapped []string
}

// Grant is one workspace's live binding as a guest uses it. ProxyURL carries
// the relay credential; it is revocable and names no secret value.
type Grant struct {
	ProxyURL  string
	Hosts     []string
	CACertPEM []byte
}

// Relay is a running egress relay.
type Relay struct {
	listener net.Listener
	server   *http.Server
	local    map[string]bool
	deny     []*net.IPNet
	caCert   *x509.Certificate
	caKey    *ecdsa.PrivateKey
	caPEM    []byte
	upstream *http.Transport
	audit    func(AuditEvent)

	mu          sync.Mutex
	byToken     map[string]*binding
	byWorkspace map[string]string
	leaves      map[string]*tls.Certificate
	closed      bool
}

type binding struct {
	workspaceID string
	token       string
	secrets     []sandbox.EgressProxySecret
	// masks pairs every form of a value the relay can emit or send (literal,
	// query-escaped, path-escaped) with its placeholder, longest first.
	masks []mask
	// fragments indexes each fragmentMin-byte run of every form at least that
	// long by its bytes, so masking finds where a run begins in one lookup.
	fragments map[uint64][]fragment
	// ctx ends when the binding is replaced, revoked, or the relay closes:
	// in-flight upstream requests are cancelled and open tunnels closed.
	ctx    context.Context
	cancel context.CancelFunc
}

type mask struct{ value, placeholder string }

// fragment is where one fragmentMin-byte run occurs: masks[mask].value[offset:].
type fragment struct{ mask, offset int }

var (
	_, nat64Prefix, _     = net.ParseCIDR("64:ff9b::/96")
	_, sixToFourPrefix, _ = net.ParseCIDR("2002::/16")
)

// New starts a relay serving on config.Listener.
func New(config Config) (*Relay, error) {
	if config.Listener == nil {
		return nil, errors.New("egress relay needs a listener")
	}
	if !loopbackAddress(config.Listener.Addr()) {
		return nil, fmt.Errorf("egress relay listener %s is not a loopback address", config.Listener.Addr())
	}
	denied := config.DenyCIDRs
	if denied == nil {
		denied = ironproxy.DefaultUpstreamDenyCIDRs
	}
	relay := &Relay{listener: config.Listener, local: map[string]bool{}, audit: config.Audit,
		byToken: map[string]*binding{}, byWorkspace: map[string]string{}, leaves: map[string]*tls.Certificate{}}
	for _, cidr := range denied {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			return nil, fmt.Errorf("egress relay deny range %q: %w", cidr, err)
		}
		// net.IPNet.Contains matches an IPv4-mapped range against every
		// IPv4 address. Resolved addresses are unmapped and meet the IPv4
		// ranges instead.
		if len(network.IP) == net.IPv6len && network.IP.To4() != nil {
			continue
		}
		relay.deny = append(relay.deny, network)
	}
	for _, address := range config.Local {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, fmt.Errorf("egress relay local destination %q: %w", address, err)
		}
		relay.local[localKey(host, port)] = true
	}
	ca, err := ironproxy.GenerateCA("Smithers workspace egress relay", 0)
	if err != nil {
		return nil, err
	}
	pair, err := tls.X509KeyPair(ca.CertPEM, ca.KeyPEM)
	if err != nil {
		return nil, fmt.Errorf("egress relay CA: %w", err)
	}
	relay.caCert, err = x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return nil, fmt.Errorf("egress relay CA: %w", err)
	}
	relay.caKey = pair.PrivateKey.(*ecdsa.PrivateKey)
	relay.caPEM = ca.CertPEM
	dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	relay.upstream = &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			return relay.dial(ctx, dialer, network, address)
		},
		TLSClientConfig:       &tls.Config{RootCAs: config.RootCAs, MinVersion: tls.VersionTLS12},
		ForceAttemptHTTP2:     false,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 5 * time.Minute,
		DisableCompression:    true,
	}
	relay.server = &http.Server{Handler: relay, ReadHeaderTimeout: 30 * time.Second, ErrorLog: nil}
	go func() { _ = relay.server.Serve(config.Listener) }()
	return relay, nil
}

// Address is the relay's listening address.
func (r *Relay) Address() string { return r.listener.Addr().String() }

// CACertPEM is the certificate a guest must trust for intercepted HTTPS.
func (r *Relay) CACertPEM() []byte { return slices.Clone(r.caPEM) }

// Bind replaces workspaceID's secrets. The previous credential stops working
// at once. An empty set revokes the workspace's binding and returns no grant.
func (r *Relay) Bind(workspaceID string, secrets []sandbox.EgressProxySecret) (Grant, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return Grant{}, errors.New("egress relay binding needs a workspace id")
	}
	bound := make([]sandbox.EgressProxySecret, 0, len(secrets))
	names := map[string]bool{}
	var hosts []string
	var masks []mask
	for _, secret := range secrets {
		if err := secret.Validate(); err != nil {
			return Grant{}, err
		}
		secret.Name = strings.TrimSpace(secret.Name)
		if names[secret.Name] {
			return Grant{}, fmt.Errorf("egress proxy secret %s is bound twice", secret.Name)
		}
		names[secret.Name] = true
		if strings.Contains(secret.Value, sandbox.EgressProxyPlaceholder(secret.Name)) {
			return Grant{}, fmt.Errorf("egress proxy secret %s value contains its placeholder", secret.Name)
		}
		secret.Hosts = normalizedHosts(secret.Hosts)
		secret.MatchHeaders = canonicalHeaders(secret.MatchHeaders)
		for _, host := range secret.Hosts {
			if !slices.Contains(hosts, host) {
				hosts = append(hosts, host)
			}
		}
		placeholder := sandbox.EgressProxyPlaceholder(secret.Name)
		for _, form := range []string{secret.Value, url.QueryEscape(secret.Value), url.PathEscape(secret.Value)} {
			if !slices.ContainsFunc(masks, func(existing mask) bool { return existing.value == form }) {
				masks = append(masks, mask{value: form, placeholder: placeholder})
			}
		}
		bound = append(bound, secret)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return Grant{}, errors.New("egress relay is closed")
	}
	r.revokeLocked(workspaceID)
	if len(bound) == 0 {
		return Grant{}, nil
	}
	token, err := randomToken()
	if err != nil {
		return Grant{}, err
	}
	// Longest first, so a value that extends another is masked whole.
	slices.SortStableFunc(masks, func(a, b mask) int { return len(b.value) - len(a.value) })
	fragments := map[uint64][]fragment{}
	for index, form := range masks {
		for offset := 0; offset+fragmentMin <= len(form.value); offset++ {
			key := binary.LittleEndian.Uint64([]byte(form.value[offset : offset+fragmentMin]))
			fragments[key] = append(fragments[key], fragment{mask: index, offset: offset})
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	r.byToken[token] = &binding{workspaceID: workspaceID, token: token, secrets: bound, masks: masks, fragments: fragments, ctx: ctx, cancel: cancel}
	r.byWorkspace[workspaceID] = token
	proxyURL := url.URL{Scheme: "http", User: url.UserPassword(proxyUser, token), Host: r.listener.Addr().String()}
	return Grant{ProxyURL: proxyURL.String(), Hosts: hosts, CACertPEM: slices.Clone(r.caPEM)}, nil
}

// Revoke removes workspaceID's binding. It is idempotent.
func (r *Relay) Revoke(workspaceID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.revokeLocked(strings.TrimSpace(workspaceID))
}

// RevokeGrant removes grant's binding only while it is still the workspace's
// live binding, so cleanup of a failed bind never revokes a newer one.
func (r *Relay) RevokeGrant(workspaceID string, grant Grant) {
	r.mu.Lock()
	defer r.mu.Unlock()
	workspaceID = strings.TrimSpace(workspaceID)
	token, ok := r.byWorkspace[workspaceID]
	if ok && grant.ProxyURL != "" && strings.Contains(grant.ProxyURL, ":"+token+"@") {
		r.revokeLocked(workspaceID)
	}
}

func (r *Relay) revokeLocked(workspaceID string) {
	if token, ok := r.byWorkspace[workspaceID]; ok {
		r.byToken[token].cancel()
		delete(r.byToken, token)
		delete(r.byWorkspace, workspaceID)
	}
}

// Close stops the relay and forgets every binding.
func (r *Relay) Close() error {
	r.mu.Lock()
	r.closed = true
	for _, bound := range r.byToken {
		bound.cancel()
	}
	r.byToken = map[string]*binding{}
	r.byWorkspace = map[string]string{}
	r.mu.Unlock()
	r.upstream.CloseIdleConnections()
	return r.server.Close()
}

// GuestEnvironment routes a command's HTTP(S) through grant's relay URL (as
// the guest reaches it) and trusts the relay CA at caPath. Hosts the binding
// names are removed from NO_PROXY so their requests reach the relay.
func GuestEnvironment(grant Grant, guestProxyURL, caPath string) map[string]string {
	env := ironproxy.GuestEnv(guestProxyURL, caPath)
	var direct []string
	for _, host := range ironproxy.GuestNoProxy {
		if !slices.ContainsFunc(grant.Hosts, func(bound string) bool { return hostMatches(bound, host) }) {
			direct = append(direct, host)
		}
	}
	noProxy := strings.Join(direct, ",")
	env["NO_PROXY"], env["no_proxy"] = noProxy, noProxy
	return env
}

func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if !loopbackRemote(req.RemoteAddr) {
		http.Error(w, "egress relay accepts loopback clients only", http.StatusForbidden)
		return
	}
	bound := r.authenticate(req.Header.Get("Proxy-Authorization"))
	if bound == nil {
		w.Header().Set("Proxy-Authenticate", `Basic realm="smithers egress relay"`)
		http.Error(w, "egress relay credential is missing, revoked or unknown", http.StatusProxyAuthRequired)
		return
	}
	if req.Method == http.MethodConnect {
		r.tunnel(w, req, bound)
		return
	}
	if !req.URL.IsAbs() || req.URL.Scheme != "http" {
		http.Error(w, "egress relay forwards absolute http URLs and CONNECT tunnels only", http.StatusBadRequest)
		return
	}
	if !r.local[localKey(req.URL.Hostname(), portOf(req.URL))] {
		r.record(bound, req, http.StatusForbidden, false, nil, false)
		http.Error(w, errPlaintext.Error(), http.StatusForbidden)
		return
	}
	response, err := r.forward(req.Context(), req, bound)
	if err != nil {
		http.Error(w, err.Error(), statusFor(err))
		return
	}
	defer response.Body.Close()
	for name, values := range response.Header {
		w.Header()[name] = values
	}
	w.WriteHeader(response.StatusCode)
	// Each masked read goes to the guest at once, so a streamed response is
	// not batched in the write buffer until the upstream ends (#4251).
	flusher := http.NewResponseController(w)
	buffer := make([]byte, 32*1024)
	for {
		n, err := response.Body.Read(buffer)
		if n > 0 {
			if _, writeErr := w.Write(buffer[:n]); writeErr != nil {
				return
			}
			_ = flusher.Flush()
		}
		if err != nil {
			return
		}
	}
}

// authenticate returns the live binding of a Proxy-Authorization credential.
func (r *Relay) authenticate(header string) *binding {
	scheme, encoded, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Basic") {
		return nil
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil {
		return nil
	}
	user, token, ok := strings.Cut(string(decoded), ":")
	if !ok || user != proxyUser || len(token) != 64 {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for candidate, bound := range r.byToken {
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(token)) == 1 {
			return bound
		}
	}
	return nil
}

// current reports whether bound is still the workspace's live binding, so a
// tunnel opened before a rebind or revoke stops substituting at once.
func (r *Relay) current(bound *binding) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	token, ok := r.byWorkspace[bound.workspaceID]
	return ok && r.byToken[token] == bound
}

var (
	errNotBound      = errors.New("egress relay: destination is not bound to this workspace")
	errPrivateTarget = errors.New("egress relay: destination is a private address")
	errRevoked       = errors.New("egress relay: binding was revoked")
	errPlaintext     = errors.New("egress relay: credentials travel over https only, except to the backend's own address")
	errEncoded       = errors.New("egress relay: upstream response has a content encoding the relay cannot mask")
	errEmbedded      = errors.New("egress relay: a secret placeholder is swapped only as a whole header token, path segment or query value")
)

func statusFor(err error) int {
	switch {
	case errors.Is(err, errNotBound), errors.Is(err, errPrivateTarget), errors.Is(err, errPlaintext), errors.Is(err, errEmbedded):
		return http.StatusForbidden
	case errors.Is(err, errRevoked):
		return http.StatusProxyAuthRequired
	default:
		return http.StatusBadGateway
	}
}

// tunnel intercepts a CONNECT to a bound host with a leaf certificate from
// the relay CA and forwards each request it carries.
func (r *Relay) tunnel(w http.ResponseWriter, req *http.Request, bound *binding) {
	host, port, err := net.SplitHostPort(req.Host)
	if err != nil {
		http.Error(w, "CONNECT needs host:port", http.StatusBadRequest)
		return
	}
	if !bound.allows(host) {
		r.record(bound, req, http.StatusForbidden, false, nil, false)
		http.Error(w, errNotBound.Error(), http.StatusForbidden)
		return
	}
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "egress relay cannot tunnel on this connection", http.StatusInternalServerError)
		return
	}
	client, buffered, err := hijacker.Hijack()
	if err != nil {
		return
	}
	defer client.Close()
	_ = client.SetDeadline(time.Time{})
	if _, err := io.WriteString(client, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		return
	}
	leaf, err := r.leaf(strings.ToLower(host))
	if err != nil {
		return
	}
	conn := tls.Server(&bufferedConn{Conn: client, reader: buffered.Reader}, &tls.Config{
		Certificates: []tls.Certificate{*leaf}, MinVersion: tls.VersionTLS12, NextProtos: []string{"http/1.1"},
	})
	defer conn.Close()
	// Revoking, replacing or closing ends the tunnel at once.
	stop := context.AfterFunc(bound.ctx, func() { _ = client.Close() })
	defer stop()
	if err := conn.HandshakeContext(req.Context()); err != nil {
		return
	}
	reader := bufio.NewReader(conn)
	for {
		// An idle tunnel does not hold the relay open forever.
		_ = conn.SetReadDeadline(time.Now().Add(tunnelIdleTimeout))
		inner, err := http.ReadRequest(reader)
		if err != nil {
			return
		}
		inner.URL.Scheme = "https"
		inner.URL.Host = net.JoinHostPort(host, port)
		response, err := r.forward(req.Context(), inner, bound)
		if err != nil {
			response = &http.Response{StatusCode: statusFor(err), ProtoMajor: 1, ProtoMinor: 1, Header: http.Header{"Content-Type": {"text/plain; charset=utf-8"}},
				Body: io.NopCloser(strings.NewReader(err.Error() + "\n")), ContentLength: -1, TransferEncoding: []string{"chunked"}, Close: true}
		}
		writeErr := response.Write(conn)
		_ = response.Body.Close()
		_ = inner.Body.Close()
		if writeErr != nil || response.Close || inner.Close {
			return
		}
	}
}

// forward substitutes the binding's placeholders into an outbound request
// and returns the upstream response with every bound value masked.
func (r *Relay) forward(ctx context.Context, req *http.Request, bound *binding) (*http.Response, error) {
	response, swapped, pathSwapped, err := r.forwardRequest(ctx, req, bound)
	if err != nil {
		r.record(bound, req, statusFor(err), false, swapped, pathSwapped)
	} else {
		r.record(bound, req, response.StatusCode, true, swapped, pathSwapped)
	}
	return response, err
}

// record emits req's audit event. It never reads a secret value.
func (r *Relay) record(bound *binding, req *http.Request, status int, allowed bool, swapped []string, pathSwapped bool) {
	if r.audit == nil {
		return
	}
	path := req.URL.EscapedPath()
	if pathSwapped {
		path = "/[redacted]"
	}
	r.audit(AuditEvent{WorkspaceID: bound.workspaceID, Time: time.Now().UTC(), Host: strings.ToLower(req.URL.Hostname()),
		Method: req.Method, Path: path, Status: status, Allowed: allowed, Swapped: swapped})
}

func (r *Relay) forwardRequest(ctx context.Context, req *http.Request, bound *binding) (*http.Response, []string, bool, error) {
	host := strings.ToLower(req.URL.Hostname())
	if !bound.allows(host) {
		return nil, nil, false, errNotBound
	}
	if !r.current(bound) {
		return nil, nil, false, errRevoked
	}
	ctx, cancel := context.WithCancel(ctx)
	stop := context.AfterFunc(bound.ctx, cancel)
	outbound := req.Clone(ctx)
	outbound.RequestURI = ""
	outbound.Host = req.URL.Host
	removeHopHeaders(outbound.Header)
	// Identity bodies keep response masking exact.
	outbound.Header.Del("Accept-Encoding")
	swapped, pathSwapped, err := bound.substitute(outbound, host)
	if err != nil {
		stop()
		cancel()
		return nil, nil, false, err
	}
	response, err := r.upstream.RoundTrip(outbound)
	if err != nil {
		stop()
		cancel()
		if errors.Is(err, errPrivateTarget) {
			return nil, swapped, pathSwapped, errPrivateTarget
		}
		return nil, swapped, pathSwapped, fmt.Errorf("egress relay: upstream %s: %s", host, bound.mask(err.Error()))
	}
	if encoding := strings.TrimSpace(response.Header.Get("Content-Encoding")); encoding != "" && !strings.EqualFold(encoding, "identity") {
		_ = response.Body.Close()
		stop()
		cancel()
		return nil, swapped, pathSwapped, errEncoded
	}
	// The reason phrase and trailers are upstream text the masker never sees.
	response.Status = fmt.Sprintf("%d %s", response.StatusCode, http.StatusText(response.StatusCode))
	response.Trailer = nil
	removeHopHeaders(response.Header)
	response.Header.Del("Trailer")
	for name, values := range response.Header {
		for index, value := range values {
			response.Header[name][index] = bound.mask(value)
		}
	}
	response.Header.Del("Content-Length")
	response.ContentLength = -1
	response.TransferEncoding = []string{"chunked"}
	response.Body = &maskingBody{source: response.Body, bound: bound, release: func() { stop(); cancel() }}
	return response, swapped, pathSwapped, nil
}

// substitute swaps, in one pass over the guest's request, each placeholder
// that stands whole at a location its secret binds on host, so a swapped
// value is never searched again. It returns the swapped secrets' names and
// whether a path segment carried one. A bound placeholder inside a larger
// token is refused with errEmbedded and nothing is swapped.
func (b *binding) substitute(outbound *http.Request, host string) ([]string, bool, error) {
	used := map[string]bool{}
	var headers []string
	for _, secret := range b.secrets {
		if secretBindsHost(secret, host) {
			for _, name := range secret.MatchHeaders {
				if !slices.Contains(headers, name) {
					headers = append(headers, name)
				}
			}
		}
	}
	for _, name := range headers {
		at := func(secret sandbox.EgressProxySecret) bool { return slices.Contains(secret.MatchHeaders, name) }
		for index, value := range outbound.Header[name] {
			swappedValue, err := swapHeaderTokens(value, func(token string) (string, error) {
				out, _, err := b.swapToken(token, host, at, true, used)
				return out, err
			})
			if err != nil {
				return nil, false, err
			}
			outbound.Header[name][index] = swappedValue
		}
	}
	inQuery := func(secret sandbox.EgressProxySecret) bool { return secret.MatchQuery }
	if query := outbound.URL.RawQuery; query != "" {
		fields := strings.Split(query, "&")
		changed := false
		for index, field := range fields {
			key, value, hasValue := strings.Cut(field, "=")
			if _, _, err := b.swapToken(unescaped(key, url.QueryUnescape), host, inQuery, false, used); err != nil {
				return nil, false, err
			}
			if !hasValue {
				continue
			}
			swappedValue, swapped, err := b.swapToken(unescaped(value, url.QueryUnescape), host, inQuery, true, used)
			if err != nil {
				return nil, false, err
			}
			if swapped {
				fields[index], changed = key+"="+url.QueryEscape(swappedValue), true
			}
		}
		if changed {
			outbound.URL.RawQuery = strings.Join(fields, "&")
		}
	}
	inPath := func(secret sandbox.EgressProxySecret) bool { return secret.MatchPath }
	segments := strings.Split(outbound.URL.EscapedPath(), "/")
	pathSwapped := false
	for index, segment := range segments {
		swappedValue, swapped, err := b.swapToken(unescaped(segment, url.PathUnescape), host, inPath, true, used)
		if err != nil {
			return nil, false, err
		}
		if swapped {
			segments[index], pathSwapped = url.PathEscape(swappedValue), true
		}
	}
	if pathSwapped {
		raw := strings.Join(segments, "/")
		decoded, err := url.PathUnescape(raw)
		if err != nil {
			return nil, false, err
		}
		outbound.URL.Path, outbound.URL.RawPath = decoded, raw
	}
	var names []string
	for _, secret := range b.secrets {
		if used[secret.Name] {
			names = append(names, secret.Name)
		}
	}
	return names, pathSwapped, nil
}

// swapToken decides one token at a request location that at says whether a
// secret binds. A token that is the placeholder of a secret bound there on
// host becomes its value when swap allows. Any other secret's whole
// placeholder stays as it is. A token holding a placeholder bound there in
// any other way is errEmbedded.
func (b *binding) swapToken(token, host string, at func(sandbox.EgressProxySecret) bool, swap bool, used map[string]bool) (string, bool, error) {
	boundHere := func(secret sandbox.EgressProxySecret) bool { return at(secret) && secretBindsHost(secret, host) }
	for _, secret := range b.secrets {
		if token != sandbox.EgressProxyPlaceholder(secret.Name) {
			continue
		}
		if swap && boundHere(secret) {
			used[secret.Name] = true
			return secret.Value, true, nil
		}
		if !boundHere(secret) {
			return token, false, nil
		}
	}
	for _, secret := range b.secrets {
		if boundHere(secret) && strings.Contains(token, sandbox.EgressProxyPlaceholder(secret.Name)) {
			return "", false, errEmbedded
		}
	}
	return token, false, nil
}

// swapHeaderTokens rewrites each space- or tab-delimited token of a header
// value through swap and keeps the delimiters as they were.
func swapHeaderTokens(value string, swap func(string) (string, error)) (string, error) {
	var out strings.Builder
	for value != "" {
		end := strings.IndexAny(value, " \t")
		if end == 0 {
			out.WriteByte(value[0])
			value = value[1:]
			continue
		}
		if end < 0 {
			end = len(value)
		}
		token, err := swap(value[:end])
		if err != nil {
			return "", err
		}
		out.WriteString(token)
		value = value[end:]
	}
	return out.String(), nil
}

// unescaped decodes an escaped path segment or query component, or returns
// it as sent when it does not decode.
func unescaped(raw string, decode func(string) (string, error)) string {
	if decoded, err := decode(raw); err == nil {
		return decoded
	}
	return raw
}

func (b *binding) allows(host string) bool {
	for _, secret := range b.secrets {
		if secretBindsHost(secret, host) {
			return true
		}
	}
	return false
}

// mask replaces every bound value form in value, leftmost-longest.
func (b *binding) mask(value string) string {
	out, _ := b.maskPrefix([]byte(value), true)
	return string(out)
}

// maskPrefix replaces, leftmost-longest, every run of fragmentMin or more
// bytes from a bound value form, and every whole form shorter than that, with
// the form's placeholder. It returns the masked bytes and how much of data
// they consumed. Unless data is final, it stops at the first position where a
// run or form could begin and continue past the end of data: only those bytes
// wait to see how it continues.
//
// No fragmentMin consecutive bytes of a form survive: a byte passes through
// only when no run can begin at it.
func (b *binding) maskPrefix(data []byte, final bool) ([]byte, int) {
	out := make([]byte, 0, len(data))
	index := 0
scan:
	for index < len(data) {
		rest := data[index:]
		if run, placeholder, open := b.longestRun(rest); run > 0 {
			if open && !final {
				break scan
			}
			out = append(out, placeholder...)
			index += run
			continue
		}
		if !final && len(rest) < fragmentMin && b.mayBeginRun(rest) {
			break scan
		}
		// Forms shorter than fragmentMin mask whole, longest first, so a
		// longer one that may yet match is decided before a shorter one that
		// does. The comparison conversions do not copy data; copying the
		// remainder per byte made masking quadratic.
		for _, candidate := range b.masks {
			if len(candidate.value) >= fragmentMin {
				continue
			}
			if len(rest) < len(candidate.value) {
				if !final && candidate.value[:len(rest)] == string(rest) {
					break scan
				}
				continue
			}
			if string(rest[:len(candidate.value)]) == candidate.value {
				out = append(out, candidate.placeholder...)
				index += len(candidate.value)
				continue scan
			}
		}
		out = append(out, data[index])
		index++
	}
	return out, index
}

// longestRun returns the longest prefix of data, at least fragmentMin bytes,
// that occurs in a value form, and that form's placeholder. open reports that
// the run reaches the end of data where its form continues, so more data
// could lengthen it.
func (b *binding) longestRun(data []byte) (int, string, bool) {
	if len(data) < fragmentMin {
		return 0, "", false
	}
	run, placeholder, open := 0, "", false
	for _, at := range b.fragments[binary.LittleEndian.Uint64(data)] {
		form := b.masks[at.mask].value
		n := fragmentMin
		for n < len(data) && at.offset+n < len(form) && data[n] == form[at.offset+n] {
			n++
		}
		if n > run {
			run, placeholder = n, b.masks[at.mask].placeholder
		}
		if n == len(data) && at.offset+n < len(form) {
			open = true
		}
	}
	return run, placeholder, open
}

// mayBeginRun reports whether data, shorter than fragmentMin, occurs in a form
// where the form has room for a run to begin, so the bytes that follow could
// complete one.
func (b *binding) mayBeginRun(data []byte) bool {
	for _, candidate := range b.masks {
		if len(candidate.value) >= fragmentMin && strings.Contains(candidate.value[:len(candidate.value)-fragmentMin+len(data)], string(data)) {
			return true
		}
	}
	return false
}

func secretBindsHost(secret sandbox.EgressProxySecret, host string) bool {
	return slices.ContainsFunc(secret.Hosts, func(bound string) bool { return hostMatches(bound, host) })
}

// hostMatches reports whether a request host is the binding's host. A
// binding names exactly one host (sandbox.ValidExactEgressHost): no wildcard,
// no address range, so a value never reaches a host it was not bound to. A
// non-ASCII request host never matches: Unicode lower-casing and the IDNA
// conversion the upstream dial applies can name different domains.
func hostMatches(bound, host string) bool {
	host = strings.Trim(host, "[]")
	for index := 0; index < len(host); index++ {
		if host[index] >= utf8.RuneSelf {
			return false
		}
	}
	return bound == sandbox.CanonicalExactEgressHost(host)
}

// dial refuses private, loopback, link-local and metadata addresses unless
// Config.Local names the exact destination. It checks the resolved address,
// so a public name that resolves privately is refused too.
func (r *Relay) dial(ctx context.Context, dialer *net.Dialer, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if r.local[localKey(host, port)] {
		return dialer.DialContext(ctx, network, address)
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	var lastErr error = errPrivateTarget
	for _, candidate := range addresses {
		if r.denied(candidate.IP) {
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(candidate.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// denied judges a NAT64 (64:ff9b::/96) or 6to4 (2002::/16) address by the
// IPv4 address it embeds, because a translator or relay delivers it there.
func (r *Relay) denied(ip net.IP) bool {
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	} else if len(ip) == net.IPv6len && nat64Prefix.Contains(ip) {
		return r.denied(net.IP(ip[12:16]))
	} else if len(ip) == net.IPv6len && sixToFourPrefix.Contains(ip) {
		return r.denied(net.IP(ip[2:6]))
	}
	return slices.ContainsFunc(r.deny, func(network *net.IPNet) bool { return network.Contains(ip) })
}

// leaf returns a cached certificate for host signed by the relay CA.
func (r *Relay) leaf(host string) (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cert := r.leaves[host]; cert != nil && time.Until(cert.Leaf.NotAfter) > time.Hour {
		return cert, nil
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	now := time.Now()
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: host},
		NotBefore:    now.Add(-5 * time.Minute),
		NotAfter:     now.Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	if ip := net.ParseIP(host); ip != nil {
		template.IPAddresses = []net.IP{ip}
	} else {
		template.DNSNames = []string{host}
	}
	der, err := x509.CreateCertificate(rand.Reader, template, r.caCert, &key.PublicKey, r.caKey)
	if err != nil {
		return nil, err
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	cert := &tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: parsed}
	r.leaves[host] = cert
	return cert, nil
}

// maskingBody replaces every bound value in a streamed body with its
// placeholder, holding back between reads only bytes that may begin a run or
// form maskPrefix masks.
type maskingBody struct {
	source  io.ReadCloser
	bound   *binding
	release func()
	buffer  []byte
	pending []byte
	out     []byte
	eof     bool
}

func (m *maskingBody) Read(p []byte) (int, error) {
	for len(m.out) == 0 {
		if m.eof {
			if len(m.pending) == 0 {
				return 0, io.EOF
			}
			m.out, _ = m.bound.maskPrefix(m.pending, true)
			m.pending = nil
			break
		}
		if m.buffer == nil {
			m.buffer = make([]byte, 32*1024)
		}
		n, err := m.source.Read(m.buffer)
		m.pending = append(m.pending, m.buffer[:n]...)
		if err == io.EOF {
			m.eof = true
			continue
		} else if err != nil {
			return 0, err
		}
		// Everything up to a possible partial match goes to the guest now:
		// holding a fixed tail delayed each streamed event until the next
		// one arrived (#4251).
		var consumed int
		m.out, consumed = m.bound.maskPrefix(m.pending, false)
		m.pending = append([]byte(nil), m.pending[consumed:]...)
	}
	n := copy(p, m.out)
	m.out = m.out[n:]
	return n, nil
}

func (m *maskingBody) Close() error {
	err := m.source.Close()
	if m.release != nil {
		m.release()
	}
	return err
}

type bufferedConn struct {
	net.Conn
	reader *bufio.Reader
}

func (c *bufferedConn) Read(p []byte) (int, error) { return c.reader.Read(p) }

var hopHeaders = []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade"}

func removeHopHeaders(header http.Header) {
	for _, name := range header.Values("Connection") {
		for _, field := range strings.Split(name, ",") {
			header.Del(strings.TrimSpace(field))
		}
	}
	for _, name := range hopHeaders {
		header.Del(name)
	}
}

func localKey(host, port string) string { return net.JoinHostPort(strings.ToLower(host), port) }

func portOf(target *url.URL) string {
	if port := target.Port(); port != "" {
		return port
	}
	if target.Scheme == "https" {
		return "443"
	}
	return "80"
}

func normalizedHosts(hosts []string) []string {
	out := make([]string, 0, len(hosts))
	for _, host := range hosts {
		host = sandbox.CanonicalExactEgressHost(host)
		if !slices.Contains(out, host) {
			out = append(out, host)
		}
	}
	return out
}

func canonicalHeaders(names []string) []string {
	out := make([]string, 0, len(names))
	for _, name := range names {
		name = http.CanonicalHeaderKey(strings.TrimSpace(name))
		if name != "" && !slices.Contains(out, name) {
			out = append(out, name)
		}
	}
	return out
}

func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func loopbackAddress(address net.Addr) bool {
	tcp, ok := address.(*net.TCPAddr)
	return ok && tcp.IP.IsLoopback()
}

func loopbackRemote(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
