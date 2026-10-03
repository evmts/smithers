package services

import (
	"context"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// WorkspaceImage separates registry admission from evidence of an actual boot.
type WorkspaceImage struct {
	Ref          string `json:"ref"`
	Digest       string `json:"digest"`
	BootedDigest string `json:"booted_digest,omitempty"`
}

func (s *WorkspaceService) admitWorkspaceImage(ctx context.Context, input *CreateWorkspaceInput) error {
	if !s.customImagesEnabled && (input.ImageRequested || input.Image != "" || input.Network != nil) {
		return workspaceCustomImagesDisabled()
	}
	if input.Network != nil {
		network := *input.Network
		if network.Mode == "" {
			network.Mode = "proxy"
		}
		if network.Mode != "proxy" && network.Mode != "none" {
			return pkgerrors.BadRequest("network.mode must be none or proxy")
		}
		input.Network = &network
	}
	if input.SnapshotID != "" && (input.ImageRequested || input.Image != "" || input.Network != nil) {
		return pkgerrors.BadRequest("image and network cannot be combined with snapshot_id; a restore inherits its source")
	}
	if s.runtime != nil {
		if input.Image != "" && !s.runtime.Capabilities().CustomImages {
			return pkgerrors.BadRequest("this workspace runtime does not accept custom images")
		}
		if input.Network != nil && !s.runtime.Capabilities().NetworkPolicy {
			return pkgerrors.BadRequest("this workspace runtime does not accept a network policy")
		}
	}
	if input.Image == "" {
		if input.ImageRequested {
			return pkgerrors.New(pkgerrors.CodeWorkspaceImageUnresolvable, "The requested public image reference is empty")
		}
		return nil
	}
	if normalizeWorkspaceKind(input.Kind) != "container" || input.Environment.Image != "" || input.Environment.ClosureHash != "" || input.Environment.Revision != "" {
		return pkgerrors.BadRequest("image requires kind container and cannot select a Nix environment")
	}
	resolver := s.imageResolver
	if resolver == nil {
		resolver = publicWorkspaceImageResolver{}
	}
	image, err := resolver.Resolve(ctx, input.Image)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return pkgerrors.New(pkgerrors.CodeWorkspaceImageUnresolvable, "The public image could not be resolved to a digest").WithCause(err)
	}
	if image.Ref != input.Image || !imageDigestPattern.MatchString(image.Digest) {
		return pkgerrors.New(pkgerrors.CodeWorkspaceImageUnresolvable, "The public image resolver returned an invalid digest")
	}
	input.admittedImage = &image
	return nil
}

func workspaceNetworkOf(row db.Workspace) workspaceapi.WorkspaceNetwork {
	mode := row.NetworkMode.String
	if mode == "" {
		mode = "proxy"
	}
	return workspaceapi.WorkspaceNetwork{Mode: mode}
}

func workspaceImageOf(row db.Workspace) *workspaceapi.WorkspaceImage {
	if row.ImageRef.String == "" {
		return nil
	}
	return &workspaceapi.WorkspaceImage{Ref: row.ImageRef.String, Digest: row.ImageDigest.String}
}

func networkPointer(row db.Workspace) *workspaceapi.WorkspaceNetwork {
	if !row.NetworkMode.Valid {
		return nil
	}
	network := workspaceNetworkOf(row)
	return &network
}
func applyWorkspaceAdmission(params *db.CreateWorkspaceParams, metadata workspaceCreateMetadata) {
	if metadata.image != nil {
		params.ImageRef, params.ImageDigest = pgtype.Text{String: metadata.image.Ref, Valid: true}, pgtype.Text{String: metadata.image.Digest, Valid: true}
	}
	if metadata.network != nil {
		params.NetworkMode = pgtype.Text{String: metadata.network.Mode, Valid: true}
	}
}

func refuseWorkspaceAdmissionMismatch(row db.Workspace, metadata workspaceCreateMetadata) error {
	if metadata.image != nil && (metadata.image.Ref != row.ImageRef.String || metadata.image.Digest != row.ImageDigest.String) {
		return pkgerrors.Conflict("workspace exists with a different image; choose another name or delete it")
	}
	if metadata.network != nil {
		actual := workspaceNetworkOf(row)
		if actual.Mode != metadata.network.Mode {
			return pkgerrors.Conflict("workspace exists with a different network policy; choose another name or delete it")
		}
	}
	return nil
}

func (s *WorkspaceService) recordRuntimeWorkspaceImage(ctx context.Context, row db.Workspace) (db.Workspace, error) {
	if row.ImageRef.String == "" {
		return row, nil
	}
	reporter, ok := s.runtime.(workspaceapi.WorkspaceImageReporter)
	if !ok {
		return row, nil
	}
	image, err := reporter.WorkspaceImageReceipt(ctx, row.ID)
	if err != nil {
		return row, runtimeOperationError("observe workspace image", err)
	}
	if !imageDigestPattern.MatchString(image.Digest) || (row.ImageDigest.String != "" && image.Digest != row.ImageDigest.String) {
		return row, pkgerrors.Internal("workspace runtime booted a different image digest")
	}
	store, ok := s.q.(interface {
		SetWorkspaceImageReceipt(context.Context, db.SetWorkspaceImageReceiptParams) (db.Workspace, error)
	})
	if !ok {
		return row, pkgerrors.Internal("workspace image receipt store unavailable")
	}
	return store.SetWorkspaceImageReceipt(ctx, db.SetWorkspaceImageReceiptParams{ID: row.ID, BootedImageDigest: image.Digest})
}

func (s *WorkspaceService) observeSandboxWorkspaceImage(ctx context.Context, row db.Workspace) (string, error) {
	if row.ImageRef.String == "" || row.VmID == "" || s.sandbox == nil {
		return "", nil
	}
	observed, err := s.sandbox.InspectSandbox(ctx, row.VmID)
	if err != nil {
		return "", runtimeOperationError("observe workspace image", err)
	}
	if observed.Image == "" {
		return "", nil
	}
	_, digest, pinned := strings.Cut(observed.Image, "@")
	if !pinned || !imageDigestPattern.MatchString(digest) || digest != row.ImageDigest.String {
		return "", pkgerrors.Internal("workspace provider booted a different image digest")
	}
	return digest, nil
}

// Caller images need no coding toolchain. Repository setup is an optional
// convenience, and cannot turn a healthy benchmark guest into a failed box.
func (s *WorkspaceService) ensureCustomRuntimeWorkspaceRepository(ctx context.Context, row db.Workspace, requesterID int64) error {
	operationCtx, err := s.runtimeRepositoryContext(ctx, row, requesterID, "custom-image-clone")
	if err != nil {
		return err
	}
	probe, err := s.runtime.ExecuteCommand(operationCtx, row.ID, workspaceapi.Command{Args: []string{"/bin/sh", "-c", "command -v git >/dev/null 2>&1 && test ! -e .git"}})
	if err != nil || probe.ExitCode != 0 {
		return ctx.Err()
	}
	slug, err := s.workspaceRepoSlug(ctx, row.RepositoryID)
	if err != nil {
		return ctx.Err()
	}
	cloneURL, err := workspaceRepoGitURL(s.gitBaseURL, slug)
	if err != nil {
		return ctx.Err()
	}
	token, err := issueTemporaryRepoCloneToken(ctx, s.q, row.UserID, "custom-image-clone")
	if err != nil {
		return ctx.Err()
	}
	defer revokeTemporaryRepoCloneToken(ctx, s.q, row.UserID, token.ID)
	result, err := s.runtime.ExecuteCommand(operationCtx, row.ID, workspaceapi.Command{
		Args:        []string{"/bin/sh", "-c", "git clone --branch " + shellQuote(targetWorkspaceBookmark(row.TargetBookmark)) + " -- " + shellQuote(cloneURL) + " ."},
		Environment: map[string]string{"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.extraHeader", "GIT_CONFIG_VALUE_0": "Authorization: Bearer " + token.Plaintext},
	})
	if err != nil || result.ExitCode != 0 {
		slog.Warn("custom image repository clone skipped", "workspace_id", row.ID)
	}
	return ctx.Err()
}

func workspaceSandboxEgress(row db.Workspace, base *sandbox.EgressProxyPolicy) *sandbox.EgressProxyPolicy {
	switch row.NetworkMode.String {
	case "none":
		return &sandbox.EgressProxyPolicy{Enabled: false}
	case "", "proxy":
		return base
	default:
		return &sandbox.EgressProxyPolicy{Enabled: false}
	}
}

func applyWorkspaceSandboxNetwork(req *sandbox.CreateRequest, row db.Workspace) {
	req.EgressProxy = workspaceSandboxEgress(row, req.EgressProxy)
	if row.NetworkMode.String != "" && row.NetworkMode.String != "proxy" {
		req.Firewall = &sandbox.FirewallPolicy{DefaultEgressAction: "deny"}
	}
}

func (s *WorkspaceService) customImageWorkspaceVMRequest(ctx context.Context, row db.Workspace) (sandbox.CreateRequest, error) {
	var egress *sandbox.EgressProxyPolicy
	var err error
	if row.NetworkMode.String != "none" {
		egress, err = s.workspaceEgressProxy(ctx, row.RepositoryID, row.ID)
	}
	if err != nil {
		return sandbox.CreateRequest{}, err
	}
	wait, remain, ready := true, true, true
	timeout := workspaceReadyTimeoutSeconds
	memory, cpus := s.workspaceSizeForKind("container")
	req := sandbox.CreateRequest{
		Image: workspaceImageOf(row).PinnedReference(), Kind: "container", MemSizeMB: memory, VCPUCount: cpus,
		EgressProxy: egress, Firewall: localMicrosandboxHostFirewall(s.gitBaseURL),
		IdleTimeoutSeconds: &s.workspaceIdleTimeoutSeconds,
		Persistence:        &sandbox.PersistencePolicy{Type: s.workspacePersistence, Priority: &s.workspacePersistencePriority},
		Init:               &sandbox.ServiceConfig{Enabled: true, Services: []sandbox.ServiceSpec{{Name: workspaceReadyService, Mode: sandbox.ServiceModeOneshot, Exec: []string{"/bin/true"}, User: "root", RemainAfterExit: &remain, ReadySignal: &ready}}},
		Users:              []sandbox.LinuxUserSpec{{Name: s.workspaceUsername, Home: defaultWorkspaceHome, Shell: "/bin/bash"}},
		WaitForReady:       &wait, ReadyTimeoutSeconds: &timeout, Workdir: defaultWorkspaceHome,
	}
	applyWorkspaceResources(&req, row)
	applyWorkspaceSandboxNetwork(&req, row)
	return req, nil
}

func (s *WorkspaceService) prepareCustomSandboxRepository(ctx context.Context, row db.Workspace, vmID string, input CreateWorkspaceSessionInput) error {
	if row.NetworkMode.String == "none" || row.SourceSnapshotID.Valid || input.RepoOwner == "" || input.RepoName == "" {
		return ctx.Err()
	}
	cloneURL, err := buildRepoCloneURL(s.gitBaseURL, input.RepoOwner, input.RepoName)
	if err != nil {
		return ctx.Err()
	}
	token, err := issueTemporaryRepoCloneToken(ctx, s.q, input.UserID, "sandbox-workspace-clone")
	if err != nil {
		return ctx.Err()
	}
	defer revokeTemporaryRepoCloneToken(ctx, s.q, input.UserID, token.ID)
	return s.cloneCustomSandboxRepository(ctx, row, vmID, cloneURL.String(), token.Plaintext)
}

func (s *WorkspaceService) cloneCustomSandboxRepository(ctx context.Context, row db.Workspace, vmID, cloneURL, token string) error {
	client, ok := s.sandbox.(workspaceArtifactClient)
	if !ok || row.NetworkMode.String == "none" {
		return ctx.Err()
	}
	parsed, err := url.Parse(cloneURL)
	if err != nil || parsed.Hostname() == "" {
		return ctx.Err()
	}
	script := "if ! command -v git >/dev/null 2>&1; then exit 0; fi; test -e " + shellQuote(defaultWorkspaceClonePath) + " && exit 0; " + strings.Join(gitBearerAuthEnvExports(token), "; ") + "; git clone --branch " + shellQuote(targetWorkspaceBookmark(row.TargetBookmark)) + " -- " + shellQuote(cloneURL) + " " + shellQuote(defaultWorkspaceClonePath)
	if _, err := artifactCommand(ctx, client, vmID, script, int64(workspaceCloneTimeout/time.Millisecond)); err != nil {
		slog.Warn("custom image repository clone skipped", "workspace_id", row.ID)
	}
	return ctx.Err()
}
