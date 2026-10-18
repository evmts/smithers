package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/admission"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

// plue#839: a branch machine belongs to the machine service, and its host
// start is admitted under the repository payer. #3756 counted the payer's
// machines by repository ownership while the start still asked as the machine
// service, so the exact-VM check never matched, every start was refused as a
// changed VM, and lane bindings ended runtime_start_exhausted.
func TestBranchMachineHostStartIsAdmittedUnderItsRepositoryPayer(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var service, owner, userRepo, org, orgRepo int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&service))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES ('host-owner','host-owner') RETURNING id`).Scan(&owner))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name,default_bookmark) VALUES ($1,'repo','repo','main') RETURNING id`, owner).Scan(&userRepo))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name,lower_name) VALUES ('host-org','host-org') RETURNING id`).Scan(&org))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id,name,lower_name,default_bookmark) VALUES ($1,'repo','repo','main') RETURNING id`, org).Scan(&orgRepo))
	policy, err := admission.NewMetered(pool, admission.Config{Usage: admission.ProductUsage})
	require.NoError(t, err)
	var attempts atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	launcher, err := newAdmittedFlowLauncher(refusingHostTransport{server.URL}, db.New(pool), policy)
	require.NoError(t, err)
	for _, repo := range []int64{userRepo, orgRepo} {
		machine := uuid.NewString()
		_, err := pool.Exec(ctx, `INSERT INTO workspaces(id,repository_id,user_id,vm_id,status) VALUES ($1,$2,$3,'machine','running')`, machine, repo, service)
		require.NoError(t, err)
		before := attempts.Load()
		_, err = launcher.StartFlowHost(ctx, flowhost.HostLaunch{Authority: flowhost.Authority{RepositoryID: repo, UserID: service, WorkspaceID: machine}})
		require.ErrorContains(t, err, "external host refused launch", "the start is admitted and reaches the host transport")
		require.Equal(t, before+1, attempts.Load())
	}
}
