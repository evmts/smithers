package guest

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
	"github.com/smithersai/smithers/packages/backend/ports"
)

// Repository is a public main-tip snapshot, with instructions treated as text.
type Repository struct {
	ID                     int64
	Revision, Instructions string
}
type Source interface {
	ReadGuestRepository(context.Context, string, string) (Repository, error)
}

// Handler has no general chat host or tool executor. The proxy performs the
// same bounded parsing and forwarding used by authenticated model calls.
type Handler struct {
	DB           *pgxpool.Pool
	Config       config.GuestConfig
	Source       Source
	Keys         modelproxy.Keys
	Upstreams    map[string]string
	Client       *http.Client
	CookieSecure bool
	Now          func() time.Time
	// CompileTimeout may shorten the fixed 15-second worker limit in tests.
	CompileTimeout time.Duration
}

// Validate refuses partially configured sponsored compute before serving it.
func (h *Handler) Validate() error {
	if len(h.Config.Repositories) == 0 {
		return nil
	}
	c := h.Config
	if h.DB == nil || h.Source == nil || h.Keys == nil || c.SponsorID <= 0 || len(c.IPSecret) < 32 || c.RequestNanos <= 0 || c.DailyNanos <= 0 || c.WindowNanos <= 0 || c.RequestsPerIP <= 0 || c.OutputTokens <= 0 || c.OutputTokens > 4096 {
		return errors.New("guest configuration requires sponsor, secret, source and positive bounded limits")
	}
	// These providers share the existing bounded chat-completions transport.
	if c.Provider != modelproxy.ProviderOpenAI && c.Provider != modelproxy.ProviderCerebras {
		return errors.New("guest model requires an openai or cerebras chat-completions provider")
	}
	if _, _, ok := modelproxy.Price(c.Provider, c.Model); !ok {
		return errors.New("guest model has no known price")
	}
	start, e1 := time.Parse(time.RFC3339, c.WindowStart)
	end, e2 := time.Parse(time.RFC3339, c.WindowEnd)
	if e1 != nil || e2 != nil || !start.Before(end) {
		return errors.New("guest launch window requires ordered RFC3339 start and end")
	}
	for _, repo := range c.Repositories {
		if len(strings.Split(repo, "/")) != 2 || strings.TrimSpace(repo) != repo || strings.ContainsAny(repo, "?#%\\") {
			return errors.New("guest repositories must be owner/repo names")
		}
	}
	return nil
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/repos/{owner}/{repo}/guest", h.Boot)
	r.Post("/api/repos/{owner}/{repo}/guest/chat", h.Chat)
	r.Get("/api/repos/{owner}/{repo}/guest/runs/{run}", h.Run)
	r.Post("/api/repos/{owner}/{repo}/guest/conversions", h.Convert)
	r.Get("/api/repos/{owner}/{repo}/guest/conversions/key", h.ConversionKey)
	r.Get("/api/repos/{owner}/{repo}/guest/conversions/{key}", h.Conversion)
}

func (h *Handler) digest(domain, value string) string {
	mac := hmac.New(sha256.New, []byte(h.Config.IPSecret))
	_, _ = mac.Write([]byte(domain + "\x00" + value))
	return hex.EncodeToString(mac.Sum(nil))
}
func (h *Handler) repository(r *http.Request) (Repository, error) {
	return h.repositoryAccess(r, true)
}
func (h *Handler) repositoryAccess(r *http.Request, admission bool) (Repository, error) {
	name := chi.URLParam(r, "owner") + "/" + chi.URLParam(r, "repo")
	allowed := false
	for _, candidate := range h.Config.Repositories {
		allowed = allowed || strings.EqualFold(candidate, name)
	}
	if !allowed {
		return Repository{}, Refusal("guest_not_allowed")
	}
	if admission && h.Config.Disabled {
		return Repository{}, Refusal("guest_disabled")
	}
	if err := h.Validate(); err != nil {
		return Repository{}, Refusal("guest_unavailable")
	}
	if admission {
		disabled, err := Suspended(r.Context(), h.DB)
		if err != nil {
			return Repository{}, Refusal("guest_unavailable")
		}
		if disabled {
			return Repository{}, Refusal("guest_disabled")
		}
	}
	repository, err := h.Source.ReadGuestRepository(r.Context(), chi.URLParam(r, "owner"), chi.URLParam(r, "repo"))
	if err != nil || repository.ID <= 0 || repository.Revision == "" || len(repository.Instructions) > 64*1024 || strings.ContainsRune(repository.Instructions, 0) {
		return Repository{}, Refusal("guest_unavailable")
	}
	return repository, nil
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func refuse(w http.ResponseWriter, err error) {
	var refusal Refusal
	if !errors.As(err, &refusal) {
		refusal = "guest_unavailable"
	}
	status, code, message := refusal.ModelRefusal()
	if refusal == "guest_not_allowed" {
		status = http.StatusForbidden
	}
	writeJSON(w, status, map[string]any{"code": code, "message": message, "signIn": true})
}
func validID(id string) bool { _, err := uuid.Parse(id); return err == nil }
func (h *Handler) session(w http.ResponseWriter, r *http.Request, repositoryID int64, create bool) (string, bool) {
	name := "smithers_guest_" + formatID(repositoryID)
	if cookie, err := r.Cookie(name); err == nil && len(cookie.Value) == 64 {
		if _, err := hex.DecodeString(cookie.Value); err == nil {
			return h.digest("session:"+formatID(repositoryID), cookie.Value), true
		}
	}
	if !create {
		return "", false
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", false
	}
	token := hex.EncodeToString(secret)
	http.SetCookie(w, &http.Cookie{Name: name, Value: token, Path: "/api/repos/" + chi.URLParam(r, "owner") + "/" + chi.URLParam(r, "repo") + "/guest", HttpOnly: true, Secure: h.CookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: 86400})
	return h.digest("session:"+formatID(repositoryID), token), true
}

func (h *Handler) Boot(w http.ResponseWriter, r *http.Request) {
	repository, err := h.repository(r)
	if err != nil {
		refuse(w, err)
		return
	}
	session, ok := h.session(w, r, repository.ID, true)
	if !ok {
		refuse(w, Refusal("guest_unavailable"))
		return
	}
	slog.Info("guest landing", "stage", "landing", "landing_id", uuid.NewSHA1(uuid.NameSpaceOID, []byte(session)).String(), "repository_id", repository.ID, "revision", repository.Revision)
	writeJSON(w, http.StatusOK, map[string]any{"allowed": true, "flow": "guest.chat", "sessionId": session, "landingId": uuid.NewSHA1(uuid.NameSpaceOID, []byte(session)).String(), "repositoryId": repository.ID, "revision": repository.Revision})
}

type caller modelproxy.Caller

func (c caller) ResolveModelCaller(*http.Request) (modelproxy.Caller, error) {
	return modelproxy.Caller(c), nil
}

func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	ctx, stop := context.WithTimeout(r.Context(), 45*time.Second)
	defer stop()
	r = r.WithContext(ctx)
	started := time.Now()
	id := uuid.NewString()
	log := slog.Default().With("interaction_id", id, "run_id", id, "reservation_id", id)
	defer func() {
		log.Info("guest interaction finished", "stage", "finished", "duration_ms", time.Since(started).Milliseconds())
	}()
	repository, err := h.repository(r)
	if err != nil {
		log.Info("guest refused", "stage", "repository", "code", err.Error())
		refuse(w, err)
		return
	}
	session, ok := h.session(w, r, repository.ID, false)
	if !ok {
		refuse(w, Refusal("guest_session_required"))
		return
	}
	var input struct {
		Prompt    string `json:"prompt"`
		Key       string `json:"idempotencyKey"`
		LandingID string `json:"landingId"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || !validID(input.Key) || !validID(input.LandingID) || strings.TrimSpace(input.Prompt) == "" || len(input.Prompt) > 8192 {
		refuse(w, Refusal("guest_invalid_request"))
		return
	}
	ipHash, err := h.ipHash(r)
	if err != nil {
		refuse(w, err)
		return
	}
	log = log.With("landing_id", input.LandingID, "repository_id", repository.ID, "revision", repository.Revision, "ip_hash", ipHash)
	log.Info("guest interaction", "stage", "landing")
	instructions := ports.BuiltinAppInstructions
	if repository.Instructions != "" {
		instructions += "\n\n" + repository.Instructions
	}
	// No caller-selected model, messages, tool schema or provider options.
	body, _ := json.Marshal(map[string]any{"model": h.Config.Model, "stream": true, "max_completion_tokens": h.Config.OutputTokens, "messages": []any{map[string]string{"role": "system", "content": instructions}, map[string]string{"role": "user", "content": input.Prompt}}})
	upstream := r.Clone(r.Context())
	copyURL := *r.URL
	upstream.URL = &copyURL
	upstream.URL.Path = modelproxy.Path + "/" + h.Config.Provider + "/v1/chat/completions"
	upstream.Header = make(http.Header)
	upstream.Header.Set("Content-Type", "application/json")
	upstream.Body = io.NopCloser(bytes.NewReader(body))
	upstream.ContentLength = int64(len(body))
	w.Header().Set("X-Smithers-Interaction-Id", id)
	w.Header().Set("X-Smithers-Run-Id", id)
	w.Header().Set("X-Smithers-Reservation-Id", id)
	w.Header().Set("Cache-Control", "no-store")
	spend := &Spend{DB: h.DB, Config: h.Config, ID: id, SessionHash: session, IPHash: ipHash, Key: input.Key, LandingID: input.LandingID, Revision: repository.Revision, RepositoryID: repository.ID, Now: h.Now}
	proxy := &modelproxy.Handler{OwnerPaid: true, Owner: spend, Keys: h.Keys, Upstreams: h.Upstreams, Client: h.Client, CancelWithCaller: true, Callers: caller{OwnerType: "user", OwnerID: h.Config.SponsorID, RepositoryID: repository.ID, Source: "guest", Reference: id}}
	proxy.ServeHTTP(w, upstream)
}

func (h *Handler) Run(w http.ResponseWriter, r *http.Request) {
	repository, err := h.repository(r)
	if err != nil {
		refuse(w, err)
		return
	}
	session, ok := h.session(w, r, repository.ID, false)
	if !ok {
		refuse(w, Refusal("guest_session_required"))
		return
	}
	var state string
	var bound, charged int64
	id := chi.URLParam(r, "run")
	if !validID(id) {
		http.NotFound(w, r)
		return
	}
	if err := h.DB.QueryRow(r.Context(), `SELECT state,bound_nanos,charged_nanos FROM guest_reservations WHERE id=$1 AND repository_id=$2 AND session_hash=$3`, id, repository.ID, session).Scan(&state, &bound, &charged); err != nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runId": id, "state": state, "reservedNanos": bound, "chargedNanos": charged})
}

// Switch is mounted only behind the composition's operator/person boundary.
func (h *Handler) Switch(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Disabled *bool `json:"disabled"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&input) != nil || input.Disabled == nil {
		writeJSON(w, 400, map[string]string{"code": "invalid_request"})
		return
	}
	if err := SetSuspended(r.Context(), h.DB, *input.Disabled); err != nil {
		refuse(w, Refusal("guest_unavailable"))
		return
	}
	slog.Warn("guest operator switch", "stage", "switch", "disabled", *input.Disabled)
	writeJSON(w, 200, map[string]bool{"disabled": *input.Disabled})
}

// ipHash is shared by chat and conversions, including IPv6 privacy buckets.
// Only the trusted composition or authenticated Worker sets RemoteAddr.
func (h *Handler) ipHash(r *http.Request) (string, error) {
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	address := net.ParseIP(ip)
	if address == nil {
		return "", Refusal("guest_unavailable")
	}
	if address.To4() == nil {
		address = address.Mask(net.CIDRMask(64, 128))
	}
	return h.digest("ip", address.String()), nil
}
