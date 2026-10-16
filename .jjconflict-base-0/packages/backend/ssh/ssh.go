// Package ssh assembles the canonical product Git/SSH endpoint. Deployments
// supply a repository transport and, optionally, a workspace access bridge.
package ssh

import (
	"context"
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/smithersai/smithers/packages/backend/admission"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/lfsauth"
	"github.com/smithersai/smithers/packages/backend/internal/revocation"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	transport "github.com/smithersai/smithers/packages/backend/internal/ssh"
	"github.com/smithersai/smithers/packages/backend/repository"
)

// WorkspaceAccess is the credential material for one public SSH connection to
// a workspace. It is never persisted, and its Token is never logged.
type WorkspaceAccess = transport.WorkspaceAccess

// WorkspaceBridge validates a caller's workspace access and serves the
// caller's SSH session through the workspace's execution transport.
type WorkspaceBridge = transport.WorkspaceBridge

// WorkspaceTCPBridge serves local port forwarding. It connects only to guest
// loopback through the authenticated machine transport, never the host
// network. A bridge without it refuses local forwarding.
type WorkspaceTCPBridge = transport.WorkspaceTCPBridge

// WorkspaceTCPConnection is one forwarded guest connection; it preserves EOF
// independently in each direction.
type WorkspaceTCPConnection = transport.WorkspaceTCPConnection

// BranchResolver checks roster membership, branch authorization and the
// member's provisioned identity without waking or executing anything. Supply
// it together with a WorkspaceBridge.
type BranchResolver = transport.BranchResolver

// AmbiguousBranchError is returned by ResolveBranchName when a login matches
// more than one scratch branch. Candidates holds only authorized branch names.
type AmbiguousBranchError = transport.AmbiguousBranchError

// ResolveBranchName picks the branch an SSH login names from an
// already-authorized branch list. It tries, in order: the branch named
// exactly, then "smithers/<login>", then the single "scratch/<owner>/<login>".
// It returns ErrWorkspaceAccessDenied for "main", a malformed login, or no
// match, and an *AmbiguousBranchError when several scratch branches match.
func ResolveBranchName(login string, branches []string) (string, error) {
	return transport.ResolveBranchName(login, branches)
}

// ErrWorkspaceAccessDenied refuses a caller or login with no workspace access.
var ErrWorkspaceAccessDenied = transport.ErrWorkspaceAccessDenied

// ErrWorkspaceUnavailable means the controller could not answer: the machine
// is missing or moving, or the controller failed. It is never a credential
// failure.
var ErrWorkspaceUnavailable = transport.ErrWorkspaceUnavailable

// UnlimitedWorkspaceLifetime as Config.WorkspaceMaxTimeout removes the
// workspace session lifetime cap; the idle deadline still applies.
const UnlimitedWorkspaceLifetime = transport.UnlimitedWorkspaceLifetime

// Config configures New. A zero size, timeout, session or auth-attempt limit
// takes the gateway default; a zero MaxConnections or MaxConnectionsPerIP is
// unlimited.
type Config struct {
	// Database remains caller-owned and must outlive Shutdown.
	Database        *pgxpool.Pool
	Repository      *repository.Client
	WorkspaceBridge WorkspaceBridge
	BranchLogins    bool
	BranchResolver  BranchResolver
	// Admission caps each push at its owner's remaining storage.
	Admission                admission.Policy
	Metrics                  prometheus.Registerer
	LFSSigningSecret         string
	PublicAPIOrigin          string
	HostKeyDir               string
	Addr                     string
	AuthAttemptsPerMinute    int
	MaxConnections           int
	MaxConnectionsPerIP      int
	MaxReceivePackSize       int64
	MaxUploadPackRequestSize int64
	ReceivePackTimeout       time.Duration
	UploadPackTimeout        time.Duration
	IdleTimeout              time.Duration
	MaxTimeout               time.Duration
	WorkspaceMaxTimeout      time.Duration
	MaxSessionsPerConn       int
}

// Server is the product Git/SSH gateway built by New.
type Server struct {
	server *transport.Server
	cancel context.CancelFunc
	bus    *revocation.Bus
}

// New uses the same product queries, authorization, audit and revocation
// implementation as the HTTP app. It never creates a deployment query model.
func New(ctx context.Context, cfg Config) (*Server, error) {
	if cfg.Database == nil {
		return nil, errors.New("ssh: product database is required")
	}
	if cfg.Repository == nil {
		return nil, errors.New("ssh: repository transport is required")
	}
	if cfg.Admission == nil {
		return nil, errors.New("ssh: admission policy is required")
	}
	if cfg.Addr == "" {
		cfg.Addr = "127.0.0.1:2222"
	}
	bridge, err := lfsauth.NewBridge(lfsauth.BridgeConfig{Secret: cfg.LFSSigningSecret, PublicBaseURL: cfg.PublicAPIOrigin})
	if err != nil {
		return nil, fmt.Errorf("ssh: LFS authentication: %w", err)
	}
	if cfg.BranchLogins && cfg.BranchResolver == nil {
		cfg.BranchResolver = &transport.InstallBranchResolver{Database: cfg.Database}
	}
	queries := db.New(cfg.Database)
	cfg.Repository.SetPushMeter(services.NewGitStorageMeter(cfg.Admission, queries))
	metrics := cfg.Metrics
	if metrics == nil {
		metrics = prometheus.NewRegistry()
	}
	server := &transport.Server{
		Queries: queries, Authorizer: services.NewSSHAuthorizationService(queries),
		RepoHostClient: cfg.Repository, LFSAuthBridge: bridge,
		AuditService: services.NewAuditService(queries), Metrics: transport.NewMetrics(metrics),
		AuthLimiter: transport.NewAuthLimiter(transport.AuthLimiterConfig{AttemptsPerMinute: cfg.AuthAttemptsPerMinute}),
		HostKeyDir:  cfg.HostKeyDir, Addr: cfg.Addr, MaxConnections: cfg.MaxConnections,
		MaxConnectionsPerIP: cfg.MaxConnectionsPerIP, MaxReceivePackSize: cfg.MaxReceivePackSize,
		MaxUploadPackRequestSize: cfg.MaxUploadPackRequestSize, ReceivePackTimeout: cfg.ReceivePackTimeout,
		UploadPackTimeout: cfg.UploadPackTimeout, IdleTimeout: cfg.IdleTimeout,
		MaxTimeout: cfg.MaxTimeout, WorkspaceMaxTimeout: cfg.WorkspaceMaxTimeout,
		MaxSessionsPerConn: cfg.MaxSessionsPerConn, WorkspaceBridge: cfg.WorkspaceBridge,
		BranchLogins: cfg.BranchLogins, BranchResolver: cfg.BranchResolver,
		// The engine's own install fact, so an SSH door in front of an
		// install's engine cannot be composed without it.
		InstallMainMirror: cfg.Repository.InstallMainMirror(),
	}
	busCtx, cancel := context.WithCancel(ctx)
	bus := revocation.NewBus(cfg.Database, queries)
	if err := bus.Start(busCtx); err != nil {
		cancel()
		return nil, fmt.Errorf("ssh: revocation listener: %w", err)
	}
	transport.SetRevocationSource(bus)
	return &Server{server: server, cancel: cancel, bus: bus}, nil
}

// ListenAndServe listens on Config.Addr and serves until Shutdown.
func (s *Server) ListenAndServe() error { return s.server.ListenAndServe() }

// Prepare validates the gateway and loads its host key without opening a port.
func (s *Server) Prepare() error { return s.server.Prepare() }

// Serve shares one gateway across the install's loopback and Settings listeners.
func (s *Server) Serve(listener net.Listener) error { return s.server.Serve(listener) }

// Shutdown drains open sessions until ctx ends, then stops the revocation
// listener. It joins ctx's error when the listener does not stop in time.
func (s *Server) Shutdown(ctx context.Context) error {
	err := s.server.Shutdown(ctx)
	s.cancel()
	select {
	case <-s.bus.Done():
		return err
	case <-ctx.Done():
		return errors.Join(err, ctx.Err())
	}
}

// KeepaliveSender is the SSH connection surface needed by forwarded hops.
type KeepaliveSender = transport.KeepaliveSender

// StartKeepalive keeps a silent forwarded workspace session alive until stopped.
func StartKeepalive(ctx context.Context, sender KeepaliveSender) func() {
	return transport.StartKeepalive(ctx, sender)
}
