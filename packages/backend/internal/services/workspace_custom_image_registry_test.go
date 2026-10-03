package services

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCustomImageReferencePublicRegistryAdmission(t *testing.T) {
	for _, tc := range []struct{ ref, host, repository, selector string }{
		{"python", "registry-1.docker.io", "library/python", "latest"},
		{"python:3.13-slim", "registry-1.docker.io", "library/python", "3.13-slim"},
		{"team/tool:1", "registry-1.docker.io", "team/tool", "1"},
		{"team/tool__build---test:1", "registry-1.docker.io", "team/tool__build---test", "1"},
		{"docker.io/python:1", "registry-1.docker.io", "library/python", "1"},
		{"index.docker.io/library/python:1", "registry-1.docker.io", "library/python", "1"},
		{"registry-1.docker.io/library/python:1", "registry-1.docker.io", "library/python", "1"},
		{"ghcr.io/team/tool:1", "ghcr.io", "team/tool", "1"},
		{"public.ecr.aws/team/tool:1", "public.ecr.aws", "team/tool", "1"},
		{"python@" + testCustomImageDigest, "registry-1.docker.io", "library/python", testCustomImageDigest},
		{"python:3.13-slim@" + testCustomImageDigest, "registry-1.docker.io", "library/python", testCustomImageDigest},
	} {
		t.Run(tc.ref, func(t *testing.T) {
			got, err := parsePublicImageReference(tc.ref)
			require.NoError(t, err)
			require.Equal(t, publicImageReference{host: tc.host, repository: tc.repository, selector: tc.selector}, got)
		})
	}
	for _, ref := range []string{"", " python", "python ", "https://docker.io/python:1", "localhost/tool:1", "127.0.0.1/tool:1", "private.example/tool:1", "docker.io:443/python:1", "python:bad tag", "python:", "Python:1", "ghcr.io/Team/tool:1", "ghcr.io/team//tool:1", "ghcr.io/team/../tool:1", "python?token=secret", "python#fragment", "python\\other", "python\n", "python@sha256:bad", "python@" + strings.ToUpper(testCustomImageDigest), "python@" + testCustomImageDigest + "@" + testCustomImageDigest, strings.Repeat("a", 513), "python:" + strings.Repeat("a", 129)} {
		t.Run(ref, func(t *testing.T) { _, err := parsePublicImageReference(ref); require.Error(t, err) })
	}
}

type registryHTTPTransport func(*http.Request) (*http.Response, error)

func (f registryHTTPTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

// Real HTTP handlers exercise manifests and auth over the loopback socket. Only
// registry DNS/TLS routing is replaced, keeping tests independent of external
// registry availability and anonymous pull quotas.
func customImageRegistryClient(t *testing.T, handler http.Handler) *http.Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	endpoint, err := url.Parse(server.URL)
	require.NoError(t, err)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	t.Cleanup(transport.CloseIdleConnections)
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: registryHTTPTransport(func(req *http.Request) (*http.Response, error) {
		copy := req.Clone(req.Context())
		rewritten := *req.URL
		copy.URL = &rewritten
		copy.Host = req.URL.Host
		copy.URL.Scheme = endpoint.Scheme
		copy.URL.Host = endpoint.Host
		return transport.RoundTrip(copy)
	})}
}

const customImageManifest = `{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"mediaType":"application/vnd.oci.image.config.v1+json","digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":2},"layers":[]}`

func customManifestDigest(body string) string {
	return fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(body)))
}

func TestCustomImageRegistryResolvesManifestByContent(t *testing.T) {
	digest := customManifestDigest(customImageManifest)
	for _, registry := range []string{"docker.io", "ghcr.io", "public.ecr.aws"} {
		for _, pinned := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/pinned=%t", registry, pinned), func(t *testing.T) {
				ref := registry + "/team/tool:latest"
				selector := "latest"
				if pinned {
					selector = digest
					ref = registry + "/team/tool@" + digest
				}
				calls := atomic.Int32{}
				client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					assert.Equal(t, http.MethodGet, r.Method)
					assert.Equal(t, "/v2/team/tool/manifests/"+selector, r.URL.Path)
					host := registry
					if registry == "docker.io" {
						host = "registry-1.docker.io"
					}
					assert.Equal(t, host, r.Host)
					assert.Contains(t, r.Header.Get("Accept"), "application/vnd.oci.image.manifest.v1+json")
					assert.Empty(t, r.Header.Get("Authorization"))
					assert.Empty(t, r.Header.Get("Cookie"))
					w.Header().Set("Docker-Content-Digest", digest)
					fmt.Fprint(w, customImageManifest)
				}))
				image, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), ref)
				require.NoError(t, err)
				require.Equal(t, workspaceapi.WorkspaceImage{Ref: ref, Digest: digest}, image)
				require.EqualValues(t, 1, calls.Load())
			})
		}
	}
}

func TestCustomImageRegistryAnonymousBearerFlow(t *testing.T) {
	for _, tc := range []struct{ registry, authHost, tokenField string }{
		{"docker.io", "auth.docker.io", "token"}, {"ghcr.io", "ghcr.io", "access_token"}, {"public.ecr.aws", "public.ecr.aws", "token"},
	} {
		t.Run(tc.registry, func(t *testing.T) {
			manifests, tokens := atomic.Int32{}, atomic.Int32{}
			client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/token" || r.URL.Path == "/token/" {
					tokens.Add(1)
					assert.Equal(t, tc.authHost, r.Host)
					expectedScope := "repository:team/tool:pull"
					if tc.registry == "public.ecr.aws" {
						expectedScope = "aws"
						assert.Equal(t, "/token/", r.URL.Path)
					}
					assert.Equal(t, expectedScope, r.URL.Query().Get("scope"))
					assert.Equal(t, "registry-service", r.URL.Query().Get("service"))
					assert.Empty(t, r.Header.Get("Authorization"))
					fmt.Fprintf(w, `{"%s":"anonymous-token"}`, tc.tokenField)
					return
				}
				manifests.Add(1)
				if r.Header.Get("Authorization") == "" {
					authPath := "/token"
					if tc.registry == "public.ecr.aws" {
						authPath = "/token/"
					}
					w.Header().Set("WWW-Authenticate", `Bearer realm="https://`+tc.authHost+authPath+`",service="registry-service",scope="repository:other/private:push"`)
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				assert.Equal(t, "Bearer anonymous-token", r.Header.Get("Authorization"))
				fmt.Fprint(w, customImageManifest)
			}))
			got, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), tc.registry+"/team/tool:latest")
			require.NoError(t, err)
			require.Equal(t, customManifestDigest(customImageManifest), got.Digest)
			require.EqualValues(t, 2, manifests.Load())
			require.EqualValues(t, 1, tokens.Load())
		})
	}
}

func TestCustomImageRegistryRefusesInvalidManifestAndStatus(t *testing.T) {
	for _, tc := range []struct {
		name, body, header, ref, want string
		status                        int
	}{
		{name: "missing", status: 404, want: "HTTP 404"},
		{name: "rate limited", status: 429, want: "HTTP 429"},
		{name: "unavailable", status: 503, want: "HTTP 503"},
		{name: "empty", status: 200, want: "size"},
		{name: "oversized", body: strings.Repeat("a", (4<<20)+1), status: 200, want: "size"},
		{name: "invalid JSON", body: "<html>error</html>", status: 200, want: "manifest"},
		{name: "old schema", body: `{"schemaVersion":1}`, status: 200, want: "manifest"},
		{name: "missing shape", body: `{"schemaVersion":2}`, status: 200, want: "manifest"},
		{name: "unsupported media type", body: `{"schemaVersion":2,"mediaType":"text/html","layers":[]}`, status: 200, want: "manifest"},
		{name: "digest header mismatch", body: customImageManifest, header: testCustomImageDigest, status: 200, want: "does not match"},
		{name: "pinned digest mismatch", body: customImageManifest, ref: "python@" + testCustomImageDigest, status: 200, want: "different image digest"},
		{name: "redirect", status: 302, header: "", want: "HTTP 302"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Docker-Content-Digest", tc.header)
				w.Header().Set("Location", "https://untrusted.test/v2/image")
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			ref := tc.ref
			if ref == "" {
				ref = testCustomImageRef
			}
			got, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), ref)
			require.ErrorContains(t, err, tc.want)
			require.Empty(t, got.Digest)
		})
	}
}

func TestCustomImageRegistryRefusesUnsafeAnonymousAuth(t *testing.T) {
	for _, challenge := range []string{
		`Basic realm="registry"`,
		`Bearer realm="http://auth.docker.io/token"`,
		`Bearer realm="https://attacker.test/token"`,
		`Bearer realm="https://127.0.0.1/token"`,
		`Bearer realm="https://auth.docker.io:443/token"`,
		`Bearer realm="https://user@auth.docker.io/token"`,
		`Bearer realm="https://auth.docker.io/token?scope=private"`,
		`Bearer realm="https://auth.docker.io/token#fragment"`,
		`Bearer realm="https://auth.docker.io/other"`,
		`Bearer realm="https://auth.docker.io/to%6ben"`,
		`Bearer realm="https://auth.docker.io/token/"`,
		`Bearer service="registry-service"`,
	} {
		t.Run(challenge, func(t *testing.T) {
			calls := atomic.Int32{}
			client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("WWW-Authenticate", challenge)
				w.WriteHeader(http.StatusUnauthorized)
			}))
			_, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), testCustomImageRef)
			require.Error(t, err)
			require.EqualValues(t, 1, calls.Load(), "unsafe challenge must not trigger token fetch")
		})
	}
}

func TestCustomImageRegistryAnonymousTokenRefusals(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
		status           int
	}{
		{"denied", "", "HTTP 403", 403},
		{"redirect", "", "HTTP 302", 302},
		{"malformed", "{", "", 200},
		{"empty", `{"token":""}`, "invalid token", 200},
		{"newline", `{"token":"bad\nvalue"}`, "invalid token", 200},
		{"oversized", `{"token":"` + strings.Repeat("a", 16385) + `"}`, "invalid token", 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manifests := atomic.Int32{}
			client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/token" {
					w.WriteHeader(tc.status)
					fmt.Fprint(w, tc.body)
					return
				}
				manifests.Add(1)
				w.Header().Set("WWW-Authenticate", `Bearer realm="https://auth.docker.io/token"`)
				w.WriteHeader(401)
			}))
			_, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), testCustomImageRef)
			require.Error(t, err)
			if tc.want != "" {
				require.ErrorContains(t, err, tc.want)
			}
			require.EqualValues(t, 1, manifests.Load())
		})
	}
}

func TestCustomImageRegistryRejectsBeforeNetworkAndHonorsCancellation(t *testing.T) {
	calls := atomic.Int32{}
	client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); fmt.Fprint(w, customImageManifest) }))
	_, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), "private.example/image:1")
	require.Error(t, err)
	require.Zero(t, calls.Load())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = (publicWorkspaceImageResolver{client: client}).Resolve(ctx, testCustomImageRef)
	require.ErrorIs(t, err, context.Canceled)
	require.Zero(t, calls.Load())
}

func TestCustomImageRegistryManifestShapeValidation(t *testing.T) {
	descriptor := `{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":"` + testCustomImageDigest + `","size":2}`
	for _, media := range []string{"application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", ""} {
		body := `{"schemaVersion":2,"mediaType":"` + media + `","manifests":[` + descriptor + `]}`
		require.True(t, validPublicImageManifest([]byte(body)), body)
	}
	for _, media := range []string{"application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json", ""} {
		body := strings.Replace(customImageManifest, "application/vnd.oci.image.manifest.v1+json", media, 1)
		require.True(t, validPublicImageManifest([]byte(body)), body)
	}
	for _, body := range []string{
		`{"schemaVersion":2}`, `{"schemaVersion":2,"mediaType":"invalid"}`,
		`{"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json","config":` + descriptor + `,"layers":[]}`,
		`{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","manifests":[]}`,
		`{"schemaVersion":2,"config":null,"layers":[]}`,
		`{"schemaVersion":2,"config":` + descriptor + `,"layers":null}`,
		`{"schemaVersion":2,"config":` + descriptor + `,"layers":[],"manifests":[]}`,
		strings.Replace(customImageManifest, `"size":2`, `"size":-1`, 1),
		strings.Replace(customImageManifest, `"size":2`, `"omitted_size":2`, 1),
		strings.Replace(customImageManifest, `"layers":[]`, `"layers":[{}]`, 1),
		strings.Replace(customImageManifest, `"mediaType":"application/vnd.oci.image.config.v1+json",`, "", 1),
		`{"schemaVersion":2,"manifests":[{"mediaType":"manifest","digest":"sha256:bad","size":2}]}`,
	} {
		require.False(t, validPublicImageManifest([]byte(body)), body)
	}
}

func TestCustomImageRegistryLivePublicAdmission(t *testing.T) {
	if os.Getenv("SMITHERS_TEST_PUBLIC_IMAGE_REGISTRIES") != "1" {
		t.Skip("set SMITHERS_TEST_PUBLIC_IMAGE_REGISTRIES=1 for public manifest-only registry checks")
	}
	for _, ref := range []string{"docker.io/library/python:3.13-slim", "public.ecr.aws/docker/library/python:3.13-slim", "ghcr.io/astral-sh/uv:python3.13-bookworm-slim"} {
		t.Run(ref, func(t *testing.T) {
			image, err := (publicWorkspaceImageResolver{}).Resolve(context.Background(), ref)
			require.NoError(t, err)
			require.Regexp(t, imageDigestPattern, image.Digest)
			pinned, err := (publicWorkspaceImageResolver{}).Resolve(context.Background(), image.PinnedReference())
			require.NoError(t, err)
			require.Equal(t, image.Digest, pinned.Digest)
			t.Logf("admitted %s at %s (manifest only)", ref, image.Digest)
		})
	}
}
