package compose

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/guest"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

type guestRepositorySource struct {
	queries *db.Queries
	host    interface {
		GetBookmark(context.Context, string, string, string) (repohost.Bookmark, error)
		GetFileAtCommit(context.Context, string, string, string, string) (repohost.FileContent, error)
	}
}

// ReadConversion reads data only, at the already admitted main revision. A
// repository cannot replace the fixed guest implementation with executable code.
func (s guestRepositorySource) ReadConversion(ctx context.Context, owner, name, revision string) (string, error) {
	read := func(path string, limit int) (string, error) {
		file, err := s.host.GetFileAtCommit(ctx, owner, name, revision, ".smithers/flows/convert/"+path)
		if err != nil || file.TooLarge || file.Encoding == "base64" || len(file.Content) > limit {
			return "", errors.New("conversion declaration unavailable")
		}
		return file.Content, nil
	}
	declaration, err := read("flow.ts", 8*1024)
	if err != nil || strings.TrimSpace(declaration) != strings.TrimSpace(guest.ConversionFlowDeclaration) {
		return "", errors.New("conversion declaration unavailable")
	}
	return read("prompt.md", 24*1024)
}

func (s guestRepositorySource) ReadGuestRepository(ctx context.Context, owner, name string) (guest.Repository, error) {
	repository, err := s.queries.GetRepoByOwnerAndLowerName(ctx, db.GetRepoByOwnerAndLowerNameParams{Owner: owner, LowerName: name})
	if err != nil {
		return guest.Repository{}, err
	}
	if !repository.IsPublic || repository.IsArchived {
		return guest.Repository{}, errors.New("guest repository unavailable")
	}
	main, err := s.host.GetBookmark(ctx, owner, repository.Name, "main")
	if err != nil || main.TargetCommitID == "" {
		return guest.Repository{}, errors.New("guest main unavailable")
	}
	result := guest.Repository{ID: repository.ID, Revision: main.TargetCommitID}
	file, err := s.host.GetFileAtCommit(ctx, owner, repository.Name, result.Revision, ".smithers/instructions/app.md")
	if repohost.IsFileNotFound(err) {
		return result, nil
	}
	if err != nil {
		return guest.Repository{}, err
	}
	if file.TooLarge || file.Encoding == "base64" {
		return guest.Repository{}, errors.New("guest instructions unavailable")
	}
	result.Instructions = file.Content
	return result, nil
}

// mountGuestPublic is shared by both install compositions and remains outside
// the authenticated API's timeout. No auth-loader or owner fallback is used.
func mountGuestPublic(router chi.Router, h *guest.Handler, queries *db.Queries, cfg *config.Config) {
	if h == nil {
		return
	}
	router.Group(func(r chi.Router) {
		r.Use(cors.Handler(apiCORSOptions(cfg)))
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
				if origin := request.Header.Get("Origin"); origin != "" {
					allowed := false
					for _, candidate := range apiAllowedOrigins(cfg) {
						allowed = allowed || middleware.SameOrigin(origin, candidate)
					}
					if !allowed {
						pkgerrors.WriteError(w, pkgerrors.Forbidden("Sign in to continue."))
						return
					}
				}
				next.ServeHTTP(w, request)
			})
		})
		r.Use(middleware.JSONAllowContentType("application/json"))
		r.Use(middleware.MaxBodySize(64 * 1024))
		r.Use(apiCSRFMiddleware)
		h.Mount(r)
	})
	h.MountProxy(router)
	router.Group(func(r chi.Router) {
		r.Use(authLoader(queries, cfg.Auth))
		r.Use(apiCSRFMiddleware)
		r.Use(middleware.RequireAuth, middleware.RequirePersonCredential, middleware.RequireScope(middleware.ScopeWriteAdmin))
		if config.IsSingleOwner(cfg.Auth) {
			r.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
					owner, err := queries.GetSelfHostOwner(request.Context())
					person := middleware.UserFromContext(request.Context())
					if err != nil || person == nil || person.ID != owner.ID {
						pkgerrors.WriteError(w, pkgerrors.Forbidden("Owner required."))
						return
					}
					next.ServeHTTP(w, request)
				})
			})
		} else {
			r.Use(middleware.RequireAdmin)
		}
		r.Put("/api/admin/guest", h.Switch)
	})
}
