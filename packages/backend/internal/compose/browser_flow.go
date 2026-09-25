package compose

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

var browserFlowRepo = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// The procedure set is the product relay contract in apps/server/gatewayRpc.ts.
// All payload and result bodies remain canonical Control/Gateway RPC shapes.
var browserFlowProcedures = map[string]bool{
	"Plan": true, "Run": true, "Cancel": true, "Resume": true,
	"Steer": true, "Signal": true, "List": true,
	"Projection.Snapshot": true, "Approval.Submit": true,
}

type browserFlowAPI struct {
	repos interface {
		GetRepoView(context.Context, *db.User, string, string) (services.RepoView, error)
	}
	workspaces interface {
		CreateWorkspace(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error)
	}
	queries interface {
		GetWorkspaceForUserRepo(context.Context, db.GetWorkspaceForUserRepoParams) (db.Workspace, error)
		GetActiveWorkspaceForUserRepo(context.Context, db.GetActiveWorkspaceForUserRepoParams) (db.Workspace, error)
	}
	dispatcher *flowdispatch.Service
	// organization, when set, makes this the organization family's relay: the
	// same procedures and payloads, but only for the installation owner, only
	// for the configured organization repository, always on its primary
	// workspace, under binding kind "organization". Nil is the librarian relay
	// for any repository the caller can write.
	organization *organizationFamily
}

type browserFlowRequest struct {
	Repo        string          `json:"repo"`
	WorkspaceID string          `json:"workspaceId"`
	Procedure   string          `json:"procedure"`
	Payload     json.RawMessage `json:"payload"`
}

// flowRelayAccess is the middleware for the browser Flow relays: writes need
// write:repository, reads read:repository, both behind the product auth loader.
func flowRelayAccess(cfg *config.Config, queries *db.Queries) (writes, reads []func(http.Handler) http.Handler) {
	writes = []func(http.Handler) http.Handler{
		cors.Handler(apiCORSOptions(cfg)), middleware.JSONTimeout(4 * time.Minute),
		middleware.JSONAllowContentType("application/json"), middleware.MaxBodySize(middleware.MaxRequestBodySize),
		authLoader(queries, cfg.Auth), apiCSRFMiddleware, middleware.GlobalAPIRateLimit(queries),
		middleware.RequireAuth, middleware.RequireScope(middleware.ScopeWriteRepository),
	}
	reads = append([]func(http.Handler) http.Handler{}, writes[:len(writes)-1]...)
	reads = append(reads, middleware.RequireScope(middleware.ScopeReadRepository))
	return writes, reads
}

// mountOrganizationRelay serves the organization family through the browser
// relay. The routes exist whenever Flow hosts do; a disabled family answers
// every signed-in caller with the same 404.
func mountOrganizationRelay(router chi.Router, writes, reads []func(http.Handler) http.Handler, api *browserFlowAPI) {
	router.With(reads...).Get("/api/organization", api.describe)
	router.With(writes...).Post("/api/organization/provision", api.provision)
	router.With(writes...).Post("/api/organization/rpc", api.rpc)
}

func browserFlowJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func browserFlowRefusal(w http.ResponseWriter, status int, message string) {
	browserFlowJSON(w, status, map[string]any{"ok": false, "error": map[string]string{"message": message}})
}

func (api *browserFlowAPI) prepare(w http.ResponseWriter, r *http.Request, provision bool) (browserFlowRequest, flowruntime.Target, bool) {
	var request browserFlowRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if decoder.Decode(&request) != nil || !browserFlowRepo.MatchString(request.Repo) ||
		(request.WorkspaceID != "" && !validBrowserWorkspaceID(request.WorkspaceID)) {
		browserFlowRefusal(w, http.StatusBadRequest, "Body must name a repository and an optional canonical workspaceId.")
		return request, flowruntime.Target{}, false
	}
	if !provision && !browserFlowProcedures[request.Procedure] {
		browserFlowRefusal(w, http.StatusBadRequest, "The workflow seam does not relay this procedure.")
		return request, flowruntime.Target{}, false
	}
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		browserFlowRefusal(w, http.StatusUnauthorized, "Sign in to run flows.")
		return request, flowruntime.Target{}, false
	}
	// Every organization refusal is the same answer as a repository the
	// caller cannot see, so the relay never reveals configuration or existence.
	if api.organization != nil && api.organization.admitRepository(r.Context(), user, request.Repo) != nil {
		browserFlowRefusal(w, http.StatusNotFound, "Repository unavailable.")
		return request, flowruntime.Target{}, false
	}
	owner, name, _ := strings.Cut(request.Repo, "/")
	view, err := api.repos.GetRepoView(r.Context(), user, owner, name)
	if err != nil || !view.CanWrite || (api.organization != nil && !ownsRepository(view.Repository, user.ID)) {
		browserFlowRefusal(w, http.StatusNotFound, "Repository unavailable.")
		return request, flowruntime.Target{}, false
	}
	if api.organization != nil {
		return api.prepareOrganization(w, r, request, view, user, provision)
	}
	workspaceID := request.WorkspaceID
	if workspaceID != "" {
		workspace, err := api.queries.GetWorkspaceForUserRepo(r.Context(), db.GetWorkspaceForUserRepoParams{
			ID: workspaceID, RepositoryID: view.Repository.ID, UserID: user.ID,
		})
		if err != nil || workspace.Status != "running" {
			browserFlowRefusal(w, http.StatusNotFound, "Workspace unavailable.")
			return request, flowruntime.Target{}, false
		}
	} else if request.Procedure == "List" || request.Procedure == "Projection.Snapshot" {
		workspace, err := api.queries.GetActiveWorkspaceForUserRepo(r.Context(), db.GetActiveWorkspaceForUserRepoParams{
			RepositoryID: view.Repository.ID, UserID: user.ID,
		})
		if err != nil || workspace.Status != "running" {
			browserFlowRefusal(w, http.StatusNotFound, "Workspace unavailable.")
			return request, flowruntime.Target{}, false
		}
		workspaceID = workspace.ID
	} else {
		workspace, err := api.workspaces.CreateWorkspace(r.Context(), services.CreateWorkspaceInput{
			RepositoryID: view.Repository.ID, UserID: user.ID, RepoOwner: owner, RepoName: name,
		})
		if err != nil || workspace.Status != "running" {
			slog.Error("browser Flow workspace unavailable", "error", err, "status", workspace.Status)
			browserFlowRefusal(w, http.StatusServiceUnavailable, "Workspace unavailable.")
			return request, flowruntime.Target{}, false
		}
		workspaceID = workspace.ID
	}
	return request, flowruntime.Target{
		TenantID:    "repository:" + strconv.FormatInt(view.Repository.ID, 10),
		PrincipalID: "user:" + strconv.FormatInt(user.ID, 10),
		WorkspaceID: workspaceID, BindingKind: "browser-flow", BindingID: request.Repo,
	}, true
}

// prepareOrganization binds the organization relay to the one primary
// workspace its host lives on. Reads never provision; a caller-named workspace
// must be that workspace.
func (api *browserFlowAPI) prepareOrganization(w http.ResponseWriter, r *http.Request, request browserFlowRequest, view services.RepoView, user *db.User, provision bool) (browserFlowRequest, flowruntime.Target, bool) {
	var workspaceID string
	if !provision && (request.Procedure == "List" || request.Procedure == "Projection.Snapshot") {
		workspace, err := api.organization.primaryWorkspace(r.Context(), view.Repository.ID, user.ID)
		if err != nil {
			browserFlowRefusal(w, http.StatusNotFound, "Workspace unavailable.")
			return request, flowruntime.Target{}, false
		}
		workspaceID = workspace.ID
	} else {
		workspace, err := api.workspaces.CreateWorkspace(r.Context(), services.CreateWorkspaceInput{
			RepositoryID: view.Repository.ID, UserID: user.ID, RepoOwner: api.organization.owner, RepoName: api.organization.name,
		})
		if err != nil || workspace.Status != "running" {
			slog.Error("organization Flow workspace unavailable", "error", err, "status", workspace.Status)
			browserFlowRefusal(w, http.StatusServiceUnavailable, "Workspace unavailable.")
			return request, flowruntime.Target{}, false
		}
		workspaceID = workspace.ID
	}
	if request.WorkspaceID != "" && request.WorkspaceID != workspaceID {
		browserFlowRefusal(w, http.StatusNotFound, "Workspace unavailable.")
		return request, flowruntime.Target{}, false
	}
	return request, api.organization.target(view.Repository.ID, user.ID, workspaceID), true
}

// describe tells the installation owner which repository the organization
// relay serves, so the app can route that repository's runs to it.
func (api *browserFlowAPI) describe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		browserFlowRefusal(w, http.StatusUnauthorized, "Sign in to run flows.")
		return
	}
	if api.organization == nil || api.organization.admitOwner(r.Context(), user) != nil {
		browserFlowRefusal(w, http.StatusNotFound, "Organization unavailable.")
		return
	}
	browserFlowJSON(w, http.StatusOK, map[string]string{"repo": api.organization.repository})
}

func validBrowserWorkspaceID(value string) bool {
	id, err := uuid.Parse(value)
	return err == nil && id.String() == value
}

func (api *browserFlowAPI) provision(w http.ResponseWriter, r *http.Request) {
	_, target, ok := api.prepare(w, r, true)
	if !ok {
		return
	}
	browserFlowJSON(w, http.StatusOK, map[string]any{
		"status": "ready", "workspaceId": target.WorkspaceID, "gatewayId": target.WorkspaceID,
	})
}

func (api *browserFlowAPI) rpc(w http.ResponseWriter, r *http.Request) {
	request, target, ok := api.prepare(w, r, false)
	if !ok {
		return
	}
	answer, err := api.dispatcher.CallRPC(r.Context(), target, request.Procedure, request.Payload)
	if err != nil {
		slog.Error("browser Flow RPC unavailable", "error", err, "procedure", request.Procedure)
		var failure flowruntime.Failure
		if errors.As(err, &failure) {
			browserFlowJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": map[string]string{
				"code": failure.FlowRuntimeCode(), "message": "Flow host unavailable.",
			}})
		} else if errors.Is(err, pgx.ErrNoRows) {
			browserFlowRefusal(w, http.StatusNotFound, "Flow host unavailable.")
		} else {
			browserFlowRefusal(w, http.StatusServiceUnavailable, "Flow host unavailable.")
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(answer)
}
