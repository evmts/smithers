package routes

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/reposites"
)

const siteTransferCookie = "__Host-smithers_transfer"

// HostSessionMinter is the existing backend identity boundary, never an edge
// token mint. A cell can supply its own admitted-identity adapter at this seam.
type HostSessionMinter interface {
	MintHostSession(context.Context, int64, string, int64, string) (string, time.Time, error)
}
type SiteSignInHandler struct {
	Sites            *reposites.Service
	CentralOrigin    string
	Minter           HostSessionMinter
	AuthConfig       config.AuthConfig
	TrustedProxyHops int
}

func (h *SiteSignInHandler) host(r *http.Request) string {
	if h.TrustedProxyHops > 0 && r.Header.Get("X-Forwarded-Host") != "" {
		return r.Header.Get("X-Forwarded-Host")
	}
	return r.Host
}
func transferHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
}
func (h *SiteSignInHandler) Start(w http.ResponseWriter, r *http.Request) {
	transferHeaders(w)
	if h == nil || h.Sites == nil || !h.Sites.Config.Enabled {
		siteFailure(w, &reposites.Refusal{Code: "site_unavailable", Status: http.StatusServiceUnavailable})
		return
	}
	host := h.host(r)
	if _, e := h.Sites.Resolve(r.Context(), host); e != nil {
		siteFailure(w, e)
		return
	}
	path := r.URL.Query().Get("return_to")
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.ContainsAny(path, "\\\r\n") {
		siteFailure(w, &reposites.Refusal{Code: "invalid_return_url", Status: 400})
		return
	}
	target, e := url.Parse("https://" + host + path)
	if e != nil {
		siteFailure(w, &reposites.Refusal{Code: "invalid_return_url", Status: 400})
		return
	}
	state, e := reposites.NewTransferState()
	if e != nil {
		siteFailure(w, e)
		return
	}
	request, e := h.Sites.BeginTransfer(r.Context(), target.String(), state)
	if e != nil {
		siteFailure(w, e)
		return
	}
	central, e := url.Parse(h.CentralOrigin)
	if e != nil || central.Scheme != "https" || central.User != nil || central.Host == "" || central.Path != "" {
		siteFailure(w, &reposites.Refusal{Code: "central_sign_in_unavailable", Status: 503})
		return
	}
	http.SetCookie(w, &http.Cookie{Name: siteTransferCookie, Value: state, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	central.Path = "/api/auth/site/authorize"
	central.RawQuery = url.Values{"request": {request}}.Encode()
	http.Redirect(w, r, central.String(), http.StatusFound)
}
func (h *SiteSignInHandler) Authorize(w http.ResponseWriter, r *http.Request) {
	transferHeaders(w)
	if h == nil || h.Sites == nil || !h.Sites.Config.Enabled {
		siteFailure(w, &reposites.Refusal{Code: "site_unavailable", Status: http.StatusServiceUnavailable})
		return
	}
	central, e := url.Parse(h.CentralOrigin)
	if e != nil || h.host(r) != central.Host {
		siteFailure(w, &reposites.Refusal{Code: "transfer_audience", Status: 421})
		return
	}
	request := r.URL.Query().Get("request")
	if r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if e = r.ParseForm(); e != nil {
			siteFailure(w, &reposites.Refusal{Code: "invalid_transfer", Status: 400})
			return
		}
		request = r.PostForm.Get("request")
	}
	user := middleware.UserFromContext(r.Context())
	if info := middleware.AuthInfoFromContext(r.Context()); info != nil && info.IsTokenAuth {
		siteFailure(w, &reposites.Refusal{Code: "browser_session_required", Status: 401})
		return
	}
	if user == nil {
		target := "/api/auth/site/authorize?" + url.Values{"request": {request}}.Encode()
		http.Redirect(w, r, "/api/auth/github?"+url.Values{"return_to": {target}}.Encode(), http.StatusFound)
		return
	}
	destination, e := h.Sites.TransferDestination(r.Context(), request)
	if e != nil {
		siteFailure(w, e)
		return
	}
	if r.Method == http.MethodGet {
		token := ""
		if cookie, e := r.Cookie(middleware.CSRFCookieName); e == nil {
			token = cookie.Value
		}
		if token == "" {
			token, e = middleware.NewCSRFToken()
			if e != nil {
				siteFailure(w, e)
				return
			}
			middleware.SetCSRFCookie(w, token, true, time.Now().Add(10*time.Minute), http.SameSiteLaxMode)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
		w.Header().Set("X-Frame-Options", "DENY")
		_, _ = fmt.Fprintf(w, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Sign in</title><form method="post" action="/api/auth/site/authorize"><input type="hidden" name="request" value="%s"><input type="hidden" name="csrf" value="%s"><button type="submit" autofocus>Continue to %s</button></form></html>`, html.EscapeString(request), html.EscapeString(token), html.EscapeString(destination.Host))
		return
	}
	if r.Method != http.MethodPost || !middleware.SameOrigin(r.Header.Get("Origin"), h.CentralOrigin) {
		siteFailure(w, &reposites.Refusal{Code: "transfer_consent_required", Status: 403})
		return
	}
	r.Header.Set("X-CSRF-Token", r.PostForm.Get("csrf"))
	middleware.CSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target, e := h.Sites.AuthorizeTransfer(r.Context(), request, user.ID)
		if e != nil {
			siteFailure(w, e)
			return
		}
		http.Redirect(w, r, target.String(), http.StatusFound)
	})).ServeHTTP(w, r)
}

func (h *SiteSignInHandler) Complete(w http.ResponseWriter, r *http.Request) {
	transferHeaders(w)
	if h == nil || h.Sites == nil || !h.Sites.Config.Enabled {
		siteFailure(w, &reposites.Refusal{Code: "site_unavailable", Status: http.StatusServiceUnavailable})
		return
	}
	cookie, e := r.Cookie(siteTransferCookie)
	if e != nil || h.Minter == nil {
		siteFailure(w, &reposites.Refusal{Code: "invalid_transfer", Status: 401})
		return
	}
	grant, e := h.Sites.ConsumeTransfer(r.Context(), r.URL.Query().Get("proof"), cookie.Value, h.host(r))
	if e != nil {
		siteFailure(w, e)
		return
	}
	key, expiry, e := h.Minter.MintHostSession(r.Context(), grant.UserID, grant.Host, grant.RepositoryID, grant.BindingToken)
	if e != nil {
		writeRouteError(w, r, e)
		return
	}
	csrf, e := middleware.NewCSRFToken()
	if e != nil {
		siteFailure(w, e)
		return
	}
	setSessionCookie(w, h.AuthConfig.SessionCookieName, key, expiry, true)
	middleware.SetCSRFCookie(w, csrf, true, expiry, http.SameSiteLaxMode)
	http.SetCookie(w, &http.Cookie{Name: siteTransferCookie, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.Redirect(w, r, grant.ReturnPath, http.StatusSeeOther)
}
