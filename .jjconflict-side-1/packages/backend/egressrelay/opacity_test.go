package egressrelay

import (
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// A clearly fake 51-character provider key and a second fake value whose
// secret name extends the first one's.
const (
	opacityName       = "FAKE_PROVIDER_KEY"
	opacityValue      = "fakekey-0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
	opacityOtherName  = "FAKE_PROVIDER_KEY_ORG"
	opacityOtherValue = "fakeorg-ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210zyxwvu"
)

// truncatingUpstream records each request it receives and answers 200 only to
// the exact bound value. Any other bearer token gets the 401 a model provider
// sends, which echoes the token's first eight and last four characters.
type truncatingUpstream struct {
	mu       sync.Mutex
	received []*http.Request
	accept   string
}

func (u *truncatingUpstream) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	u.mu.Lock()
	u.received = append(u.received, r.Clone(r.Context()))
	u.mu.Unlock()
	token := ""
	if fields := strings.Fields(r.Header.Get("Authorization")); len(fields) > 0 {
		token = fields[len(fields)-1]
	}
	if token == u.accept {
		_, _ = io.WriteString(w, `{"ok":true}`)
		return
	}
	w.WriteHeader(http.StatusUnauthorized)
	if len(token) > 12 {
		_, _ = io.WriteString(w, `{"error":{"message":"Incorrect API key provided: `+token[:8]+strings.Repeat("*", len(token)-12)+token[len(token)-4:]+`."}}`)
	}
}

func (u *truncatingUpstream) take() []*http.Request {
	u.mu.Lock()
	defer u.mu.Unlock()
	out := u.received
	u.received = nil
	return out
}

func newOpacityRelay(t *testing.T, upstream *truncatingUpstream, log *auditLog, secrets ...sandbox.EgressProxySecret) (*http.Client, string) {
	t.Helper()
	server := httptest.NewTLSServer(upstream)
	t.Cleanup(server.Close)
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	config := Config{Local: []string{server.Listener.Addr().String()}, RootCAs: roots}
	if log != nil {
		config.Audit = log.add
	}
	relay := newRelay(t, config)
	grant, err := relay.Bind("ws-opacity", secrets)
	require.NoError(t, err)
	return proxiedClient(t, grant), server.URL
}

func opacitySecret(name, value string) sandbox.EgressProxySecret {
	return sandbox.EgressProxySecret{Name: name, Value: value, Hosts: []string{"127.0.0.1"},
		MatchHeaders: []string{"Authorization"}, MatchQuery: true, MatchPath: true}
}

// longestFragment is the longest run of any form of value found in body.
func longestFragment(body, value string) int {
	best := 0
	for _, form := range []string{value, url.QueryEscape(value), url.PathEscape(value)} {
		for start := 0; start < len(form); start++ {
			for end := start + best + 1; end <= len(form) && strings.Contains(body, form[start:end]); end++ {
				best = end - start
			}
		}
	}
	return best
}

// A placeholder is swapped only where it stands whole: a header token, a path
// segment, or a query value. One inside a larger token is refused before any
// byte reaches the upstream, so the upstream never sees a mangled value whose
// rejection could echo part of it.
func TestRelaySwapsOnlyAWholePlaceholder(t *testing.T) {
	upstream := &truncatingUpstream{accept: opacityValue}
	log := &auditLog{}
	client, target := newOpacityRelay(t, upstream, log, opacitySecret(opacityName, opacityValue))
	for _, test := range []struct {
		name, authorization, path string
		status                    int
	}{
		{"whole header token", "Bearer " + opacityName, "/v1/models", http.StatusOK},
		{"header token after a tab", "Bearer\t" + opacityName, "/v1/models", http.StatusOK},
		{"whole path segment", "Bearer " + opacityName, "/v1/" + opacityName + "/models", http.StatusOK},
		{"whole query value", "Bearer " + opacityName, "/v1/models?key=" + opacityName + "&x=1", http.StatusOK},
		{"prefix inside a header token", "Bearer Z" + opacityName, "/v1/models", http.StatusForbidden},
		{"suffix inside a header token", "Bearer " + opacityName + "Z", "/v1/models", http.StatusForbidden},
		{"punctuation inside a header token", "Bearer " + opacityName + ",", "/v1/models", http.StatusForbidden},
		{"inside a path segment", "Bearer " + opacityName, "/v1/x" + opacityName + "y", http.StatusForbidden},
		{"inside an escaped path segment", "Bearer " + opacityName, "/v1/x%2F" + opacityName, http.StatusForbidden},
		{"inside a query value", "Bearer " + opacityName, "/v1/models?key=q" + opacityName + "r", http.StatusForbidden},
		{"inside a second query value", "Bearer " + opacityName, "/v1/models?key=" + opacityName + "&k2=" + opacityName + "s", http.StatusForbidden},
		{"as a query key", "Bearer " + opacityName, "/v1/models?" + opacityName + "=1", http.StatusForbidden},
	} {
		req, err := http.NewRequest(http.MethodGet, target+test.path, nil)
		require.NoError(t, err)
		req.Header.Set("Authorization", test.authorization)
		response, err := client.Do(req)
		require.NoError(t, err, test.name)
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		assert.Equal(t, test.status, response.StatusCode, "%s: %s", test.name, body)
		assert.Less(t, longestFragment(string(body), opacityValue), fragmentMin, test.name)
		received := upstream.take()
		if test.status != http.StatusOK {
			assert.Empty(t, received, "%s: a refused request never reaches the upstream", test.name)
			continue
		}
		require.Len(t, received, 1, test.name)
		got := received[0]
		assert.Equal(t, strings.Replace(test.authorization, opacityName, opacityValue, 1), got.Header.Get("Authorization"), test.name)
		assert.Equal(t, strings.ReplaceAll(strings.SplitN(test.path, "?", 2)[0], opacityName, opacityValue), got.URL.Path, test.name)
		if strings.Contains(test.path, "?") {
			assert.Equal(t, opacityValue, got.URL.Query().Get("key"), test.name)
			assert.Equal(t, "1", got.URL.Query().Get("x"), test.name)
		}
	}
	for _, event := range log.all() {
		if !event.Allowed {
			assert.Equal(t, http.StatusForbidden, event.Status)
			assert.Empty(t, event.Swapped, "a refused request swapped nothing")
		}
	}
	assertValueFreeOf(t, log.all(), opacityValue)
}

// When one secret's name extends another's, each whole token takes its own
// secret's value, and a swapped value is never searched for placeholders again.
func TestRelaySwapsEachPlaceholderToItsOwnValue(t *testing.T) {
	const secondName, secondValue = "FAKE_SECOND_KEY", "fakesecond-9876543210abcdefghij"
	chained := "fakechain-" + secondName + "-0123456789"
	for _, test := range []struct {
		name    string
		secrets []sandbox.EgressProxySecret
		token   string
		want    string
	}{
		{"longer name", []sandbox.EgressProxySecret{opacitySecret(opacityName, opacityValue), opacitySecret(opacityOtherName, opacityOtherValue)},
			opacityOtherName, opacityOtherValue},
		{"longer name bound first", []sandbox.EgressProxySecret{opacitySecret(opacityOtherName, opacityOtherValue), opacitySecret(opacityName, opacityValue)},
			opacityOtherName, opacityOtherValue},
		{"shorter name", []sandbox.EgressProxySecret{opacitySecret(opacityName, opacityValue), opacitySecret(opacityOtherName, opacityOtherValue)},
			opacityName, opacityValue},
		{"a value holding another placeholder", []sandbox.EgressProxySecret{opacitySecret(opacityName, chained), opacitySecret(secondName, secondValue)},
			opacityName, chained},
	} {
		upstream := &truncatingUpstream{accept: test.want}
		client, target := newOpacityRelay(t, upstream, nil, test.secrets...)
		req, err := http.NewRequest(http.MethodGet, target+"/v1/models", nil)
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+test.token)
		response, err := client.Do(req)
		require.NoError(t, err, test.name)
		_, _ = io.Copy(io.Discard, response.Body)
		response.Body.Close()
		assert.Equal(t, http.StatusOK, response.StatusCode, test.name)
		received := upstream.take()
		require.Len(t, received, 1, test.name)
		assert.Equal(t, "Bearer "+test.want, received[0].Header.Get("Authorization"), test.name)
	}
}

// An upstream that rejects a bound value may echo part of it. Every run of
// fragmentMin or more bytes from a value form is masked, in the body and in
// headers, however the response is split into reads.
func TestRelayMasksAnEchoedFragmentOfAValue(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		w.Header().Set("Www-Authenticate", `Bearer error="invalid_token", hint="`+token[3:14]+`"`)
		w.WriteHeader(http.StatusUnauthorized)
		flusher := w.(http.Flusher)
		for _, part := range []string{`{"error":"Incorrect API key provided: `, token[:5], token[5:8] + "*****", token[len(token)-4:],
			`", "seen":"`, token[20:30], `", "escaped":"`, url.QueryEscape(token)[9:21], `"}`} {
			_, _ = io.WriteString(w, part)
			flusher.Flush()
		}
	}))
	t.Cleanup(server.Close)
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	relay := newRelay(t, Config{Local: []string{server.Listener.Addr().String()}, RootCAs: roots})
	value := "fake/key+0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
	grant, err := relay.Bind("ws", []sandbox.EgressProxySecret{opacitySecret(opacityName, value)})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodGet, server.URL+"/v1/models", nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+opacityName)
	response, err := proxiedClient(t, grant).Do(req)
	require.NoError(t, err)
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	response.Body.Close()
	assert.Equal(t, http.StatusUnauthorized, response.StatusCode)
	assert.Less(t, longestFragment(string(body), value), fragmentMin, "body: %s", body)
	assert.Less(t, longestFragment(response.Header.Get("Www-Authenticate"), value), fragmentMin)
	assert.Contains(t, string(body), "Incorrect API key provided: "+opacityName+"*****"+value[len(value)-4:],
		"a fragment becomes the placeholder; a run shorter than fragmentMin stays")
}

// assertValueFreeOf fails when any audit field carries a form of value.
func assertValueFreeOf(t *testing.T, events []AuditEvent, value string) {
	t.Helper()
	for _, event := range events {
		for _, field := range append([]string{event.Host, event.Path, event.Method}, event.Swapped...) {
			assert.Less(t, longestFragment(field, value), fragmentMin)
		}
	}
}
