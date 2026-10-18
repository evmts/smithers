package routes

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/reposites"
)

// RepositorySitesHandler is the real backend seam shared by app flows and CLI.
// The route also applies auth, CSRF, scope and owner middleware. Keeping the
// owner check here makes a missing composition guard fail closed as well.
type RepositorySitesHandler struct{ Service *reposites.Service }

func siteFailure(w http.ResponseWriter, err error) {
	status, code := 503, "site_unavailable"
	var r *reposites.Refusal
	if errors.As(err, &r) {
		status, code = r.Status, r.Code
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	message := map[string]string{
		"site_name_unavailable": "Name unavailable", "invalid_domain": "Enter a domain", "domain_in_use": "Domain in use", "site_owner_required": "Owner required", "publication_stale": "Site changed", "publication_integrity": "Upload failed", "domain_cleanup_pending": "Domain removal pending", "invalid_return_url": "Invalid return address", "unknown_site_host": "Unknown site", "site_host_unverified": "Verify domain", "site_not_enabled": "Enable the site first", "invalid_publication_path": "Invalid file path", "publication_too_large": "Publication too large", "transfer_expired": "Sign in again", "invalid_transfer": "Sign in again", "transfer_audience": "Sign in again", "browser_session_required": "Use browser sign-in", "transfer_consent_required": "Confirm sign-in",
	}[code]
	if message == "" {
		message = "Sites unavailable"
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"code": code, "message": message})
}
func siteJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}
func (h *RepositorySitesHandler) Action(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.Service == nil || !h.Service.Config.Enabled {
		siteFailure(w, &reposites.Refusal{Code: "site_unavailable", Status: 503})
		return
	}
	rc := middleware.RepoContextFromContext(r.Context())
	if middleware.UserFromContext(r.Context()) == nil || rc == nil || rc.Repository == nil || !middleware.RepoPermissionFromContext(r.Context()).Satisfies(middleware.PermissionOwner) {
		siteFailure(w, &reposites.Refusal{Code: "site_owner_required", Status: 403})
		return
	}
	if err := refuseGitHubSourceWrite(r, "publish site"); err != nil {
		writeRouteError(w, r, err)
		return
	}
	command := reposites.Command{Action: "status"}
	if r.Method == "POST" {
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 24<<20))
		decoder.DisallowUnknownFields()
		if e := decoder.Decode(&command); e != nil {
			siteFailure(w, &reposites.Refusal{Code: "invalid_site_command", Status: 400})
			return
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			siteFailure(w, &reposites.Refusal{Code: "invalid_site_command", Status: 400})
			return
		}
	}
	value, err := h.Service.Execute(r.Context(), reposites.Repository{ID: rc.Repository.ID, Owner: rc.Owner, Name: rc.Repository.Name, OrganizationID: rc.Repository.OrgID.Int64}, command)
	if err != nil {
		siteFailure(w, err)
		return
	}
	siteJSON(w, value)
}
func (h *RepositorySitesHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.Service == nil {
		siteFailure(w, &reposites.Refusal{Code: "unknown_site_host", Status: 421})
		return
	}
	site, e := h.Service.Resolve(r.Context(), r.URL.Query().Get("host"))
	if e != nil {
		siteFailure(w, e)
		return
	}
	siteJSON(w, map[string]any{"repository": site.Repository.Owner + "/" + site.Repository.Name, "appPrefix": site.AppPrefix, "version": site.Active})
}
func (h *RepositorySitesHandler) Content(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.Service == nil {
		siteFailure(w, &reposites.Refusal{Code: "unknown_site_host", Status: 421})
		return
	}
	if e := h.Service.Available(); e != nil {
		siteFailure(w, e)
		return
	}
	// The verified binding comes from repositorySiteHTTP's effective host,
	// including the trusted edge host. Query parameters grant no origin authority.
	binding, bound := middleware.RepositorySiteFromContext(r.Context())
	host, err := reposites.NormalizeHost(r.URL.Query().Get("host"))
	boundHost, boundErr := reposites.NormalizeHost(binding.Host)
	if !bound || err != nil || boundErr != nil || host != boundHost {
		http.NotFound(w, r)
		return
	}
	file, reader, e := h.Service.Content(r.Context(), host, r.URL.Query().Get("path"))
	if e != nil {
		siteFailure(w, e)
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", file.ContentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("ETag", `"`+file.SHA256+`"`)
	w.Header().Set("Content-Length", strconv.FormatInt(file.Size, 10))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
	if r.Header.Get("If-None-Match") == w.Header().Get("ETag") {
		w.WriteHeader(304)
		return
	}
	if r.Method != "HEAD" {
		_, _ = io.Copy(w, reader)
	}
}
