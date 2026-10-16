package services

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestServiceMachineAuthorityCannotAuthorizePersonDoors(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	q, ctx := db.New(pool), t.Context()
	owner, err := q.CreateUser(ctx, db.CreateUserParams{Username: "service-owner", LowerUsername: "service-owner"})
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "app", LowerName: "app"})
	require.NoError(t, err)
	service := NewWorkspaceService(q)
	for _, kind := range []string{"learning", "review", "mythical-wiki"} {
		t.Run(kind, func(t *testing.T) {
			row, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams{RepositoryID: repo.ID, UserID: owner.ID, Name: kind, Status: "running", Kind: "container", TargetBookmark: "main"})
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `INSERT INTO flow_runtime_host_bindings(id,tenant_id,principal_id,binding_kind,binding_id,repository_id,user_id,workspace_id,catalog_key,service_name,runtime_artifact_digest,source_revision,owner_generation,credential_ciphertext,credential_hash,state) VALUES($1,'test','test',$2,'test',$3,$4,$5,'coding','test',$6,$7,1,'test',decode(repeat('00',32),'hex'),'running')`, uuid.NewString(), kind, repo.ID, owner.ID, row.ID, strings.Repeat("b", 64), strings.Repeat("a", 40))
			require.NoError(t, err)
			authority, err := service.loadServiceMachineAuthority(ctx, serviceMachineRequest{workspaceID: row.ID, repositoryID: repo.ID})
			require.NoError(t, err)
			require.NoError(t, service.withServiceMachineMutation(ctx, authority, func(serviceCtx context.Context) error {
				require.ErrorContains(t, service.requireWorkspaceAccess(serviceCtx, row.ID, owner.ID, owner.ID, WorkspaceAccessRead), "background machine belongs to its run")
				require.ErrorContains(t, service.withWorkspaceMutationAuthority(serviceCtx, row, owner.ID, func(context.Context) error { t.Fatal("service authority leaked into person mutation"); return nil }), "background machine belongs to its run")
				return nil
			}))
			_, err = service.loadServiceMachineAuthority(ctx, serviceMachineRequest{workspaceID: row.ID, repositoryID: repo.ID + 1})
			require.ErrorContains(t, err, "service machine authority mismatch")
			wrong := authority
			wrong.row.UserID++
			require.ErrorContains(t, service.withServiceMachineMutation(ctx, wrong, func(context.Context) error { t.Fatal("changed machine owner authorized"); return nil }), "service machine authority changed")
			_, err = pool.Exec(ctx, `UPDATE workspaces SET deleted_at=clock_timestamp() WHERE id=$1`, row.ID)
			require.NoError(t, err)
			require.Error(t, service.withServiceMachineMutation(ctx, authority, func(context.Context) error { t.Fatal("deleted machine authorized"); return nil }))
		})
	}
}
