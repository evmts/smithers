package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// The synthetic identity provider represents an attacker's valid OAuth state.
// Chromium, workerd and the actual callback cookie reader must prevent a
// subdomain from supplying that state's browser verifier to the apex.
func TestHostOAuthCookieWorkerdBrowser(t *testing.T) {
	h := AuthHandler{AuthConfig: defaultRouteAuthConfig(), Service: mockAuthService{
		completeGitHubFn: func(_ context.Context, _, _, verifier string) (services.OAuthCallbackResult, error) {
			if verifier != "browser-fixture-session" {
				return services.OAuthCallbackResult{}, pkgerrors.Unauthorized("invalid oauth state")
			}
			return services.OAuthCallbackResult{SessionKey: "fresh-session", ExpiresAt: time.Now().Add(time.Hour)}, nil
		},
	}}
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/fixture/sign-in" {
			setOAuthStateCookie(w, "browser-fixture-session", time.Now().Add(time.Minute), true)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		callback := r.Clone(r.Context())
		callback.URL.RawQuery = "code=synthetic&state=synthetic"
		result := httptest.NewRecorder()
		h.GetGitHubOAuthCallback(result, callback)
		_ = json.NewEncoder(w).Encode(map[string]bool{"authenticated": result.Code == http.StatusFound})
	}))
	defer backend.Close()
	root, err := filepath.Abs("../../../..")
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	bundle := exec.CommandContext(ctx, "bun", "build", "apps/server/src/edge.ts", "--target=browser")
	bundle.Dir = root
	script, err := bundle.Output()
	require.NoError(t, err)
	proof := exec.CommandContext(ctx, "node", "apps/server/scripts/cutover/host-cookie-workerd.mjs")
	proof.Dir = root
	proof.Env = append(os.Environ(), "SMITHERS_COOKIE_PROOF_BACKEND="+backend.URL)
	proof.Stdin = bytes.NewReader(script)
	output, err := proof.CombinedOutput()
	require.NoError(t, err, "%s", output)
	require.Contains(t, string(output), "host cookie browser/workerd/backend proof passed")
}

func TestHostOAuthCookieNamesAndLocalHTTP(t *testing.T) {
	for _, secure := range []bool{true, false} {
		prefix, origin := "__Host-smithers_", "https://smithers.test"
		if !secure {
			prefix, origin = "smithers_local_", "http://localhost:4000"
		}
		w := httptest.NewRecorder()
		setOAuthStateCookie(w, "verifier", time.Now().Add(time.Minute), secure)
		setCLICallbackCookie(w, "50000", "verifier", time.Now().Add(time.Minute), secure)
		http.SetCookie(w, browserReturnCookie("verifier.Lw", secure, 600))
		var names []string
		for _, c := range w.Result().Cookies() {
			names = append(names, c.Name)
			require.Equal(t, secure, c.Secure)
			require.Empty(t, c.Domain)
			require.Equal(t, "/", c.Path)
		}
		require.Equal(t, []string{prefix + "oauth_state", prefix + "cli_callback", prefix + "return_to"}, names)
		called := false
		h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			require.Equal(t, "verifier", oauthStateVerifierFromRequest(r, secure))
			port, ok := cliCallbackPortFromRequest(r, secure)
			require.True(t, ok)
			require.Equal(t, "50000", port)
			require.Equal(t, "/", consumeBrowserReturnCookie(w, r, secure))
		})
		r := httptest.NewRequest("GET", origin+"/api/auth/github/callback", nil)
		r.RemoteAddr = "127.0.0.1:50000"
		for _, c := range w.Result().Cookies() {
			r.AddCookie(c)
		}
		h.ServeHTTP(httptest.NewRecorder(), r)
		require.True(t, called, origin)
	}
	// Hosted readers refuse every name a sibling host can set.
	for _, prefix := range []string{"smithers_", "smithers_local_"} {
		r := httptest.NewRequest("GET", "https://smithers.test/api/auth/github/callback", nil)
		r.AddCookie(&http.Cookie{Name: prefix + "oauth_state", Value: "attacker"})
		r.AddCookie(&http.Cookie{Name: prefix + "cli_callback", Value: "50000:attacker"})
		r.AddCookie(&http.Cookie{Name: prefix + "return_to", Value: "attacker.Lw"})
		require.Empty(t, oauthStateVerifierFromRequest(r, true))
		_, ok := cliCallbackPortFromRequest(r, true)
		require.False(t, ok)
		require.Empty(t, consumeBrowserReturnCookie(httptest.NewRecorder(), r, true))
	}
}

// Readers take the writer's Secure flag (cookieSecure), not the request's
// effective-origin context, so a sign-in's start and callback name the same
// cookies. Single-owner HTTP has no context when a handler runs outside the
// composed router; a hosted request can carry an http:// context. Both used to
// read the other namespace and refuse the sign-in.
func TestHostOAuthCookieReadersUseWriterSecureFlag(t *testing.T) {
	for _, tc := range []struct {
		name, prefix, startURL, callbackURL, contextOrigin string
		auth                                               config.AuthConfig
		origins                                            func() []string
	}{
		{name: "single-owner HTTP without context", prefix: "smithers_local_", startURL: "http://lan.example:4000", callbackURL: "http://lan.example:4000",
			auth: config.AuthConfig{Mode: config.AuthModeSelfHosted}, origins: middleware.FixedOrigins("http://lan.example:4000")},
		{name: "hosted with an http context", prefix: "__Host-smithers_", startURL: "https://smithers.test", callbackURL: "http://localhost:4000",
			contextOrigin: "http://localhost:4000", auth: defaultRouteAuthConfig()},
	} {
		for _, cli := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/cli=%t", tc.name, cli), func(t *testing.T) {
				var started string
				start := func(_ context.Context, verifier string) (string, error) {
					started = verifier
					return "https://github.test/login/oauth/authorize", nil
				}
				h := AuthHandler{AuthConfig: tc.auth, Origins: tc.origins, Service: mockAuthService{
					startGitHubOAuthFn:  start,
					startGitHubScopesFn: func(ctx context.Context, verifier, _ string) (string, error) { return start(ctx, verifier) },
					completeGitHubFn: func(_ context.Context, _, _, verifier string) (services.OAuthCallbackResult, error) {
						if verifier == "" || verifier != started {
							return services.OAuthCallbackResult{}, pkgerrors.Unauthorized("invalid oauth state")
						}
						return services.OAuthCallbackResult{User: db.User{ID: 7, Username: "octocat", IsActive: true}, SessionKey: "session", ExpiresAt: time.Now().Add(time.Hour)}, nil
					},
					createTokenFn: func(_ context.Context, _ int64, req services.CreateTokenRequest) (services.CreateTokenResult, error) {
						require.Equal(t, "codex", req.Via, "the agent comes from the CLI callback cookie")
						return services.CreateTokenResult{Token: "cli-token"}, nil
					},
				}}
				startRequest := httptest.NewRequest(http.MethodGet, tc.startURL+"/api/auth/github?return_to=%2Fowner%2Frepo", nil)
				startHandler := h.GetGitHubOAuthStart
				if cli {
					startRequest = httptest.NewRequest(http.MethodGet, tc.startURL+"/api/auth/github/cli?callback_port=41523&agent=codex", nil)
					startHandler = h.GetGitHubOAuthCLIStart
				}
				startRequest.RemoteAddr = "127.0.0.1:1234"
				startResponse := httptest.NewRecorder()
				startHandler(startResponse, startRequest)
				require.Equal(t, http.StatusFound, startResponse.Code, startResponse.Body.String())
				names := []string{"oauth_state", "return_to"}
				if cli {
					names = []string{"oauth_state", "cli_callback"}
				}
				callbackRequest := httptest.NewRequest(http.MethodGet, tc.callbackURL+"/api/auth/github/callback?code=code&state=state", nil)
				callbackRequest.RemoteAddr = "127.0.0.1:1234"
				for _, name := range names {
					cookie := cookieByName(startResponse.Result().Cookies(), tc.prefix+name)
					require.NotNil(t, cookie, tc.prefix+name)
					require.NotEmpty(t, cookie.Value, tc.prefix+name)
					callbackRequest.AddCookie(cookie)
				}
				callbackHandler := http.Handler(http.HandlerFunc(h.GetGitHubOAuthCallback))
				if tc.contextOrigin != "" {
					callbackHandler = middleware.EffectiveOrigin(middleware.FixedOrigins(tc.contextOrigin))(callbackHandler)
				}
				callback := httptest.NewRecorder()
				callbackHandler.ServeHTTP(callback, callbackRequest)
				require.Equal(t, http.StatusFound, callback.Code, callback.Body.String())
				if cli {
					require.True(t, strings.HasPrefix(callback.Header().Get("Location"), "http://127.0.0.1:41523/callback#"), callback.Header().Get("Location"))
				} else {
					require.Equal(t, "/owner/repo", callback.Header().Get("Location"))
				}
				for _, name := range names {
					cleared := cookieByName(callback.Result().Cookies(), tc.prefix+name)
					require.NotNil(t, cleared, tc.prefix+name)
					require.Equal(t, -1, cleared.MaxAge, tc.prefix+name)
				}
			})
		}
	}
}

// A __Host- cookie can be cleared only by a Secure Set-Cookie of the same name,
// so hosted CLI completion must clear the verifier with the request's Secure flag.
func TestHostOAuthCookieCLICompletionClearsVerifier(t *testing.T) {
	h := AuthHandler{AuthConfig: defaultRouteAuthConfig(), Service: mockAuthService{
		completeGitHubFn: func(context.Context, string, string, string) (services.OAuthCallbackResult, error) {
			return services.OAuthCallbackResult{User: db.User{ID: 7, Username: "octocat", IsActive: true}}, nil
		},
		createTokenFn: func(context.Context, int64, services.CreateTokenRequest) (services.CreateTokenResult, error) {
			return services.CreateTokenResult{Token: "cli-token"}, nil
		},
	}}
	r := httptest.NewRequest("GET", "https://smithers.test/api/auth/github/callback?code=code&state=state", nil)
	r.AddCookie(&http.Cookie{Name: oauthStateCookieName, Value: "verifier"})
	r.AddCookie(&http.Cookie{Name: cliCallbackCookieName, Value: "50000:verifier"})
	w := httptest.NewRecorder()
	h.GetGitHubOAuthCallback(w, r)
	require.Equal(t, http.StatusFound, w.Code)
	require.Contains(t, w.Header().Get("Location"), "http://127.0.0.1:50000/callback#")
	for _, name := range []string{oauthStateCookieName, cliCallbackCookieName} {
		cleared := cookieByName(w.Result().Cookies(), name)
		require.NotNil(t, cleared, name)
		require.Equal(t, -1, cleared.MaxAge, name)
		require.True(t, cleared.Secure, name)
	}
	require.Nil(t, cookieByName(w.Result().Cookies(), "smithers_local_oauth_state"))
}
