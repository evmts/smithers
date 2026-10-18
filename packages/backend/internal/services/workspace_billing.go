package services

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/smithersai/smithers/packages/backend/internal/billingstore"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

func (s *WorkspaceService) workspaceBillingContext(ctx context.Context, userID, repositoryID int64) (context.Context, sandbox.BillingOwner, error) {
	if s.billing == nil {
		return ctx, sandbox.BillingOwner{Type: "user", ID: userID}, nil
	}
	store, ok := s.q.(interface {
		GetRepoByID(context.Context, int64) (db.Repository, error)
	})
	if !ok {
		return nil, sandbox.BillingOwner{}, pkgerrors.Internal("workspace repository store unavailable")
	}
	repo, err := store.GetRepoByID(ctx, repositoryID)
	if err != nil {
		return nil, sandbox.BillingOwner{}, err
	}
	owner, err := s.repositorySandboxPayer(ctx, repo)
	if err != nil {
		return nil, owner, err
	}
	return sandbox.WithBillingOwner(ctx, owner), owner, nil
}

func (s *WorkspaceService) repositorySandboxPayer(ctx context.Context, repo db.Repository) (sandbox.BillingOwner, error) {
	return RepositorySandboxPayer(ctx, repo, s.billing, s.q)
}

// RepositorySandboxPayer is who pays for a machine on repo. Until organizations
// have plans of their own (mvp.md M-09), a machine on an organization's
// repository without a paid plan bills the machine service user that runs it:
// the free organization plan cannot carry a factory's lanes (plue#839).
// billing is read when it reports OwnerHasPaidPlan and machines when it
// reports GetBranchMachineOwner; without either, or without the service user,
// the organization keeps paying.
func RepositorySandboxPayer(ctx context.Context, repo db.Repository, billing, machines any) (sandbox.BillingOwner, error) {
	owner, err := billingstore.RepositorySandboxOwner(repo)
	if err != nil || owner.Type != BillingOwnerTypeOrg {
		return owner, err
	}
	plans, ok := billing.(interface {
		OwnerHasPaidPlan(context.Context, string, int64) (bool, error)
	})
	if !ok {
		return owner, nil
	}
	if paid, err := plans.OwnerHasPaidPlan(ctx, owner.Type, owner.ID); err != nil || paid {
		return owner, err
	}
	store, ok := machines.(branchMachineOwnerStore)
	if !ok {
		return owner, nil
	}
	id, err := store.GetBranchMachineOwner(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return owner, nil
	}
	if err != nil {
		return owner, err
	}
	return sandbox.BillingOwner{Type: BillingOwnerTypeUser, ID: id}, nil
}

func (s *WorkspaceService) sandboxIdleTimeout(ctx context.Context, userID, repositoryID int64) (int32, error) {
	ctx, owner, err := s.workspaceBillingContext(ctx, userID, repositoryID)
	if err != nil {
		return 0, err
	}
	entitlement, err := sandboxEntitlementForUser(ctx, s.billing, owner.ID)
	if err != nil {
		return 0, err
	}
	store, ok := s.q.(interface {
		GetRepoByID(context.Context, int64) (db.Repository, error)
	})
	if !ok {
		return 0, pkgerrors.Internal("workspace repository store unavailable")
	}
	repo, err := store.GetRepoByID(ctx, repositoryID)
	if err != nil {
		return 0, err
	}
	return lowerSandboxIdleTimeout(entitlement.IdleTimeoutSecs, repo.WorkspaceIdleTimeoutSecs), nil
}

// Zero is infinity for the plan; a repository's positive override may only lower it.
func lowerSandboxIdleTimeout(plan int64, override int32) int32 {
	if override > 0 && (plan == 0 || int64(override) < plan) {
		return override
	}
	return int32(plan)
}

func (s *WorkspaceService) createWorkspaceRow(ctx context.Context, arg db.CreateWorkspaceParams) (db.Workspace, error) {
	if s.billing != nil {
		idle, err := s.sandboxIdleTimeout(ctx, arg.UserID, arg.RepositoryID)
		if err != nil {
			return db.Workspace{}, err
		}
		arg.IdleTimeoutSecs = pgtype.Int4{Int32: idle, Valid: true}
	}
	return s.createBranchMachineRow(ctx, arg)
}

func (s *WorkspaceService) stampResumedWorkspaceIdleTimeout(ctx context.Context, workspace db.Workspace) (db.Workspace, error) {
	if s.billing == nil {
		return workspace, nil
	}
	idle, err := s.sandboxIdleTimeout(ctx, workspace.UserID, workspace.RepositoryID)
	if err != nil {
		return workspace, err
	}
	store, ok := s.q.(interface {
		SetWorkspaceIdleTimeout(context.Context, db.SetWorkspaceIdleTimeoutParams) (db.Workspace, error)
	})
	if !ok {
		return workspace, pkgerrors.Internal("workspace idle timeout store unavailable")
	}
	return store.SetWorkspaceIdleTimeout(ctx, db.SetWorkspaceIdleTimeoutParams{ID: workspace.ID, IdleTimeoutSecs: idle})
}

// Each provision gets its own config copy; plan timeouts must not mutate the
// shared service while other users provision concurrently.
func (s *WorkspaceService) withWorkspaceIdleTimeout(workspace db.Workspace) *WorkspaceService {
	if s.billing == nil {
		return s
	}
	scoped := *s
	scoped.workspaceIdleTimeoutSeconds = int64(workspace.IdleTimeoutSecs)
	return &scoped
}

// egressQuotaForUser keeps the same billing user for workspace and standalone agents.
func egressQuotaForUser(ctx context.Context, policy BillingPolicy, userID int64) (*sandbox.EgressQuota, error) {
	if policy == nil {
		return nil, nil
	}
	entitlement, err := policy.SandboxEntitlement(ctx, userID)
	if err != nil {
		return nil, err
	}
	owner := sandbox.BillingOwnerFromContext(ctx, userID)
	quota := &sandbox.EgressQuota{BillingUserID: owner.ID, DailyBytes: entitlement.EgressBytesPerDay}
	if owner.Type == "org" {
		quota.BillingOwnerType = owner.Type
	}
	if err := (&sandbox.EgressProxyPolicy{Enabled: true, Quota: quota}).Validate(); err != nil {
		return nil, err
	}
	return quota, nil
}
