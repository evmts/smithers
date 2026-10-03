package services

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

const testCustomImageDigest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const testCustomImageRef = "docker.io/library/python:3.13-slim"

type customImageHeadQueries struct {
	*workspaceHeadTestQuerier
	swaps int
}

func (q *customImageHeadQueries) SwapWorkspaceHeadPushTokenID(context.Context, string, int64, pgtype.Int8, pgtype.Int8) (bool, error) {
	q.swaps++
	return false, errors.New("unexpected head token swap")
}

type customImageHeadRuntime struct {
	workspaceapi.WorkspaceRuntime
	inspections, executions int
}

func (*customImageHeadRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{ManagedServices: true}
}

func (*customImageHeadRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (r *customImageHeadRuntime) InspectWorkspace(context.Context, string) (workspaceapi.Workspace, error) {
	r.inspections++
	return workspaceapi.Workspace{}, errors.New("unexpected reporter inspection")
}

func (r *customImageHeadRuntime) ExecuteCommand(context.Context, string, workspaceapi.Command) (workspaceapi.CommandResult, error) {
	r.executions++
	return workspaceapi.CommandResult{}, errors.New("unexpected reporter process")
}

func TestWorkspaceCustomImageAndNoNetworkDoNotInstallOrRepairHeadReporter(t *testing.T) {
	for _, tc := range []struct {
		name   string
		custom bool
		mode   string
	}{
		{name: "custom proxy", custom: true, mode: "proxy"},
		{name: "custom none", custom: true, mode: "none"},
		{name: "ordinary none", mode: "none"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := sampleDBWorkspace("reporter-ineligible")
			row.NetworkMode = customText(tc.mode)
			if tc.custom {
				row.ImageRef, row.ImageDigest = customText(testCustomImageRef), customText(testCustomImageDigest)
			}
			reads, tokens, sandboxExecs := 0, 0, 0
			q := &customImageHeadQueries{workspaceHeadTestQuerier: &workspaceHeadTestQuerier{mockWorkspaceQuerier: &mockWorkspaceQuerier{
				getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { reads++; return row, nil },
				createAccessTokenFn: func(context.Context, db.CreateAccessTokenParams) (db.AccessToken, error) {
					tokens++
					return db.AccessToken{}, errors.New("unexpected reporter credential")
				},
			}}}
			runtime := &customImageHeadRuntime{}
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime), WithWorkspaceGitBaseURL("https://git.example"))
			observed := workspaceapi.Workspace{Home: "/home/developer", Root: "/home/developer/workspace"}
			require.Equal(t, row, svc.ensureRuntimeWorkspaceHeadReporter(context.Background(), row, row.UserID, observed))
			repaired, err := svc.ensureWorkspaceHeadReporter(context.Background(), row)
			require.NoError(t, err)
			require.Equal(t, row, repaired)
			vm := &mockWorkspaceSandboxVMClient{execAwaitFn: func(context.Context, string, sandbox.ExecRequest) (sandbox.ExecResult, error) {
				sandboxExecs++
				return sandbox.ExecResult{}, errors.New("unexpected sandbox reporter process")
			}}
			svc = newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(vm), WithWorkspaceGitBaseURL("https://git.example"))
			repaired, err = svc.ensureWorkspaceHeadReporter(context.Background(), row)
			require.NoError(t, err)
			require.Equal(t, row, repaired)
			installed, err := svc.installWorkspaceHeadReporter(context.Background(), row, "vm-reporter-ineligible")
			require.NoError(t, err)
			require.Equal(t, row, installed)
			require.Equal(t, row, svc.installWorkspaceHeadReporterBestEffort(context.Background(), row, "vm-reporter-ineligible"))
			require.Zero(t, reads)
			require.Zero(t, tokens)
			require.Zero(t, q.swaps)
			require.Zero(t, runtime.inspections)
			require.Zero(t, runtime.executions)
			require.Zero(t, sandboxExecs)
		})
	}
}

type customImageResolverFunc func(context.Context, string) (workspaceapi.WorkspaceImage, error)

func (f customImageResolverFunc) Resolve(ctx context.Context, ref string) (workspaceapi.WorkspaceImage, error) {
	return f(ctx, ref)
}

func customText(value string) pgtype.Text { return pgtype.Text{String: value, Valid: value != ""} }

func customImageTestRow() db.Workspace {
	row := sampleDBWorkspace("custom-image")
	row.ImageRef, row.ImageDigest = customText(testCustomImageRef), customText(testCustomImageDigest)
	row.NetworkMode = customText("proxy")
	return row
}

func TestCustomImageAdmissionRefusesBeforePersistence(t *testing.T) {
	for _, async := range []bool{false, true} {
		t.Run(map[bool]string{false: "synchronous", true: "asynchronous"}[async], func(t *testing.T) {
			refused := pkgerrors.BadRequest("image is not publicly accessible")
			calls := 0
			q := &mockWorkspaceQuerier{createWorkspaceFn: func(context.Context, db.CreateWorkspaceParams) (db.Workspace, error) {
				t.Fatal("refused image reached persistence")
				return db.Workspace{}, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)), WithWorkspaceImageResolver(customImageResolverFunc(func(ctx context.Context, ref string) (workspaceapi.WorkspaceImage, error) {
				calls++
				require.Equal(t, testCustomImageRef, ref)
				return workspaceapi.WorkspaceImage{}, refused
			})))
			create := s.CreateWorkspace
			if async {
				create = s.CreateWorkspaceAsync
			}
			_, err := create(context.Background(), CreateWorkspaceInput{RepositoryID: 101, UserID: 1, Image: testCustomImageRef})
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, 400, api.Status)
			require.Equal(t, 1, calls)
		})
	}
}

func TestCustomImageAndNetworkAdmissionRuntimeCapabilities(t *testing.T) {
	for _, tc := range []struct {
		name  string
		caps  workspaceapi.WorkspaceCapabilities
		input CreateWorkspaceInput
	}{
		{"custom image", workspaceapi.WorkspaceCapabilities{NetworkPolicy: true}, CreateWorkspaceInput{Image: testCustomImageRef}},
		{"isolated network", workspaceapi.WorkspaceCapabilities{CustomImages: true}, CreateWorkspaceInput{Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &mockWorkspaceQuerier{createWorkspaceFn: func(context.Context, db.CreateWorkspaceParams) (db.Workspace, error) {
				t.Fatal("unsupported policy reached persistence")
				return db.Workspace{}, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(&resourceRuntime{caps: tc.caps}), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
				return workspaceapi.WorkspaceImage{Ref: testCustomImageRef, Digest: testCustomImageDigest}, nil
			})))
			tc.input.RepositoryID, tc.input.UserID = 101, 1
			_, err := s.CreateWorkspaceAsync(context.Background(), tc.input)
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, 400, api.Status)
		})
	}
}

func TestWorkspaceNetworkAdmissionRefusesInvalidPolicies(t *testing.T) {
	for _, mode := range []string{"all", "allowlist", "NONE", " none "} {
		t.Run(mode, func(t *testing.T) {
			q := &mockWorkspaceQuerier{createWorkspaceFn: func(context.Context, db.CreateWorkspaceParams) (db.Workspace, error) {
				t.Fatal("invalid policy reached persistence")
				return db.Workspace{}, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)))
			_, err := s.CreateWorkspaceAsync(context.Background(), CreateWorkspaceInput{RepositoryID: 101, UserID: 1, Network: &workspaceapi.WorkspaceNetwork{Mode: mode}})
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, 400, api.Status)
		})
	}
}

func jsonString(value any) string { data, _ := json.Marshal(value); return string(data) }

func TestWorkspaceCustomImageRuntimeSpecKeepsPinnedPolicy(t *testing.T) {
	row := customImageTestRow()
	for _, kind := range []string{"container"} {
		t.Run(kind, func(t *testing.T) {
			row.Kind = kind
			s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(&resourceRuntime{caps: workspaceapi.WorkspaceCapabilities{CustomImages: true, NetworkPolicy: true}}))
			spec, err := s.runtimeWorkspaceSpec(context.Background(), row)
			require.NoError(t, err)
			require.Equal(t, &workspaceapi.WorkspaceImage{Ref: row.ImageRef.String, Digest: row.ImageDigest.String}, spec.Image)
			require.Equal(t, &workspaceapi.WorkspaceNetwork{Mode: row.NetworkMode.String}, spec.Network)
			require.Nil(t, spec.Environment, "custom OCI images must not require a Nix image registry")
		})
	}
}

func TestWorkspaceCustomImageNamedReuseRefusesDifferentPolicy(t *testing.T) {
	for _, tc := range []struct {
		name         string
		image        string
		digest       string
		network      workspaceapi.WorkspaceNetwork
		wantConflict bool
	}{
		{"same", testCustomImageRef, testCustomImageDigest, workspaceapi.WorkspaceNetwork{Mode: "proxy"}, false},
		{"different digest", testCustomImageRef, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", workspaceapi.WorkspaceNetwork{Mode: "proxy"}, true},
		{"different image", "ghcr.io/example/python:latest", testCustomImageDigest, workspaceapi.WorkspaceNetwork{Mode: "proxy"}, true},
		{"different mode", testCustomImageRef, testCustomImageDigest, workspaceapi.WorkspaceNetwork{Mode: "none"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := customImageTestRow()
			q := &mockWorkspaceQuerier{getActiveWorkspaceForIdentityFn: func(context.Context, db.GetActiveWorkspaceForIdentityParams) (db.Workspace, error) { return row, nil }, createWorkspaceFn: func(context.Context, db.CreateWorkspaceParams) (db.Workspace, error) {
				t.Fatal("named reuse inserted another row")
				return db.Workspace{}, nil
			}}
			provider := &mockWorkspaceSandboxVMClient{getVMFn: func(context.Context, string) (sandbox.Sandbox, error) {
				if tc.wantConflict {
					t.Fatal("policy mismatch reached runtime")
				}
				return sandbox.Sandbox{ID: row.VmID, State: sandbox.StateRunning}, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(provider), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
				return workspaceapi.WorkspaceImage{Ref: tc.image, Digest: tc.digest}, nil
			})))
			got, err := s.CreateWorkspaceAsync(context.Background(), CreateWorkspaceInput{RepositoryID: row.RepositoryID, UserID: row.UserID, Name: row.Name, Image: tc.image, Network: &tc.network})
			if !tc.wantConflict {
				require.NoError(t, err)
				require.Equal(t, row.ID, got.ID)
				return
			}
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, 409, api.Status)
		})
	}
}

func TestWorkspaceCustomImageResolverCancellationPropagates(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)), WithWorkspaceImageResolver(customImageResolverFunc(func(ctx context.Context, _ string) (workspaceapi.WorkspaceImage, error) {
		return workspaceapi.WorkspaceImage{}, ctx.Err()
	})))
	_, err := s.CreateWorkspaceAsync(ctx, CreateWorkspaceInput{RepositoryID: 101, UserID: 1, Image: testCustomImageRef})
	require.True(t, errors.Is(err, context.Canceled), "image admission must retain cancellation: %v", err)
}

func TestCustomImageAdmissionRejectsInvalidResolverReceipts(t *testing.T) {
	for _, image := range []workspaceapi.WorkspaceImage{
		{Ref: testCustomImageRef},
		{Ref: testCustomImageRef, Digest: "sha256:bad"},
		{Ref: "ghcr.io/other/image:1", Digest: testCustomImageDigest},
	} {
		t.Run(jsonString(image), func(t *testing.T) {
			s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) { return image, nil })))
			input := CreateWorkspaceInput{Image: testCustomImageRef}
			var api *pkgerrors.APIError
			require.ErrorAs(t, s.admitWorkspaceImage(context.Background(), &input), &api)
			require.Equal(t, pkgerrors.CodeWorkspaceImageUnresolvable, api.Code)
			require.Nil(t, input.admittedImage)
		})
	}
}

func TestCustomImageAdmissionRejectsIncompatibleRestoreAndEnvironment(t *testing.T) {
	for _, input := range []CreateWorkspaceInput{
		{Image: testCustomImageRef, Kind: "vm"},
		{Image: testCustomImageRef, SnapshotID: "snapshot"},
		{Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}, SnapshotID: "snapshot"},
		{Image: testCustomImageRef, Environment: WorkspaceEnvironment{Image: "nix-image"}},
		{Image: testCustomImageRef, Environment: WorkspaceEnvironment{ClosureHash: "closure"}},
		{Image: testCustomImageRef, Environment: WorkspaceEnvironment{Revision: "commit"}},
	} {
		t.Run(jsonString(input), func(t *testing.T) {
			s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
				t.Fatal("incompatible policy reached registry")
				return workspaceapi.WorkspaceImage{}, nil
			})))
			var api *pkgerrors.APIError
			require.ErrorAs(t, s.admitWorkspaceImage(context.Background(), &input), &api)
			require.Equal(t, 400, api.Status)
		})
	}
}

func TestWorkspaceNetworkAdmissionCanonicalizesWithoutMutatingCaller(t *testing.T) {
	original := &workspaceapi.WorkspaceNetwork{}
	input := CreateWorkspaceInput{Network: original}
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true))
	require.NoError(t, s.admitWorkspaceImage(context.Background(), &input))
	require.Equal(t, "proxy", input.Network.Mode)
	require.Empty(t, original.Mode)
	input.Network.Mode = "none"
	require.Empty(t, original.Mode)
}

func TestWorkspaceCustomImageRestoreAndForkInheritPolicy(t *testing.T) {
	source := customImageTestRow()
	source.ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	source.VmID = ""
	stop := errors.New("stop after admitted insert")
	for _, operation := range []string{"restore", "restore async", "fork"} {
		t.Run(operation, func(t *testing.T) {
			inserted := false
			q := &mockWorkspaceQuerier{
				getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return source, nil },
				getWorkspaceSnapshotByRepoFn: func(context.Context, db.GetWorkspaceSnapshotByRepoParams) (db.WorkspaceSnapshot, error) {
					return sampleDBWorkspaceSnapshot("cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa", source.ID, "saved", "fs-snapshot"), nil
				},
				createWorkspaceFn: func(_ context.Context, arg db.CreateWorkspaceParams) (db.Workspace, error) {
					inserted = true
					require.Equal(t, source.ImageRef, arg.ImageRef)
					require.Equal(t, source.ImageDigest, arg.ImageDigest)
					require.Equal(t, source.NetworkMode, arg.NetworkMode)
					require.True(t, arg.IsFork)
					return db.Workspace{}, stop
				},
			}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
				t.Fatal("inheritance must retain admitted digest without re-resolving mutable tag")
				return workspaceapi.WorkspaceImage{}, nil
			})))
			var err error
			input := CreateWorkspaceInput{RepositoryID: source.RepositoryID, UserID: source.UserID, Name: "restored", SnapshotID: "cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa"}
			switch operation {
			case "restore":
				_, err = s.CreateWorkspace(context.Background(), input)
			case "restore async":
				_, err = s.CreateWorkspaceAsync(context.Background(), input)
			case "fork":
				_, err = s.forkSandboxWorkspace(context.Background(), ForkWorkspaceInput{Name: "fork"}, source)
			}
			require.Error(t, err)
			require.True(t, inserted, "inheritance must reach a persisted child row")
		})
	}
}

type customImageReceiptRuntime struct {
	*resourceRuntime
	image workspaceapi.WorkspaceImage
	err   error
	calls int
}

func (r *customImageReceiptRuntime) WorkspaceImageReceipt(context.Context, string) (workspaceapi.WorkspaceImage, error) {
	r.calls++
	return r.image, r.err
}

type customImageReceiptQueries struct {
	*mockWorkspaceQuerier
	save func(context.Context, db.SetWorkspaceImageReceiptParams) (db.Workspace, error)
}

func (q *customImageReceiptQueries) SetWorkspaceImageReceipt(ctx context.Context, arg db.SetWorkspaceImageReceiptParams) (db.Workspace, error) {
	return q.save(ctx, arg)
}

func TestWorkspaceCustomImageRuntimeReceiptPersistsOnlyMatchingBoot(t *testing.T) {
	row := customImageTestRow()
	for _, tc := range []struct {
		name, digest string
		err          error
		wantSave     bool
	}{
		{name: "matching boot", digest: testCustomImageDigest, wantSave: true},
		{name: "different boot", digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
		{name: "malformed receipt", digest: "sha256:bad"},
		{name: "runtime failure", err: errors.New("receipt unavailable")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			saved := false
			q := &customImageReceiptQueries{mockWorkspaceQuerier: &mockWorkspaceQuerier{}, save: func(_ context.Context, arg db.SetWorkspaceImageReceiptParams) (db.Workspace, error) {
				saved = true
				require.Equal(t, row.ID, arg.ID)
				require.Equal(t, testCustomImageDigest, arg.BootedImageDigest)
				out := row
				out.BootedImageDigest = customText(arg.BootedImageDigest)
				return out, nil
			}}
			runtime := &customImageReceiptRuntime{resourceRuntime: &resourceRuntime{}, image: workspaceapi.WorkspaceImage{Ref: row.ImageRef.String, Digest: tc.digest}, err: tc.err}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(runtime))
			got, err := s.recordRuntimeWorkspaceImage(context.Background(), row)
			if tc.wantSave {
				require.NoError(t, err)
				require.Equal(t, testCustomImageDigest, got.BootedImageDigest.String)
			} else {
				require.Error(t, err)
				require.Empty(t, got.BootedImageDigest.String)
			}
			require.Equal(t, tc.wantSave, saved)
		})
	}
}

func TestWorkspaceCustomImageResponseKeepsAdmissionAndBootSeparate(t *testing.T) {
	row := customImageTestRow()
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true))
	response := s.toWorkspaceResponse(row)
	require.Equal(t, row.ImageRef.String, response.Image.Ref)
	require.Equal(t, row.ImageDigest.String, response.Image.Digest)
	require.Empty(t, response.Image.BootedDigest)
	data, err := json.Marshal(response)
	require.NoError(t, err)
	require.NotContains(t, string(data), "booted_digest")
	row.BootedImageDigest = row.ImageDigest
	response = s.toWorkspaceResponse(row)
	data, err = json.Marshal(response)
	require.NoError(t, err)
	require.Contains(t, string(data), `"booted_digest":"`+row.ImageDigest.String+`"`)
	require.Equal(t, workspaceapi.WorkspaceNetwork{Mode: row.NetworkMode.String}, response.Network)
	require.Equal(t, workspaceapi.WorkspaceNetwork{Mode: "proxy"}, s.toWorkspaceResponse(sampleDBWorkspace("legacy")).Network)
}

type customImageCloneRuntime struct {
	*resourceRuntime
	execute func(context.Context, string, workspaceapi.Command) (workspaceapi.CommandResult, error)
}

func (r *customImageCloneRuntime) ExecuteCommand(ctx context.Context, id string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	return r.execute(ctx, id, command)
}

func TestWorkspaceCustomImageRepositoryPreparationIsBestEffort(t *testing.T) {
	for _, tc := range []struct {
		name                 string
		probeCode, cloneCode int
		probeErr, cloneErr   error
		networkNone          bool
		wantCommands         int
	}{
		{name: "git absent", probeCode: 1, wantCommands: 1},
		{name: "probe unavailable", probeErr: errors.New("no shell"), wantCommands: 1},
		{name: "clone succeeds", wantCommands: 2},
		{name: "clone refuses", cloneCode: 128, wantCommands: 2},
		{name: "clone unavailable", cloneErr: errors.New("connection closed"), wantCommands: 2},
		{name: "no network", networkNone: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := customImageTestRow()
			if tc.networkNone {
				row.NetworkMode = customText("none")
			}
			commands, revocations := 0, 0
			q := &mockWorkspaceQuerier{deleteAccessTokenFn: func(context.Context, db.DeleteAccessTokenParams) error { revocations++; return nil }}
			runtime := &customImageCloneRuntime{resourceRuntime: &resourceRuntime{}, execute: func(ctx context.Context, id string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
				commands++
				require.Equal(t, row.ID, id)
				operation, ok := workspaceapi.OperationFromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "1", operation.PrincipalID)
				require.Equal(t, []string{"/bin/sh", "-c"}, command.Args[:2])
				if commands == 1 {
					require.Contains(t, command.Args[2], "command -v git")
					return workspaceapi.CommandResult{ExitCode: tc.probeCode}, tc.probeErr
				}
				require.Contains(t, command.Args[2], "git clone --branch 'main'")
				require.NotContains(t, command.Args[2], "Bearer")
				require.Contains(t, command.Environment["GIT_CONFIG_VALUE_0"], "Authorization: Bearer ")
				return workspaceapi.CommandResult{ExitCode: tc.cloneCode}, tc.cloneErr
			}}
			s := newWorkspaceServiceForTests(&customImageRepositoryQueries{q}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(runtime))
			require.NoError(t, s.ensureRuntimeWorkspaceRepository(context.Background(), row, row.UserID))
			require.Equal(t, tc.wantCommands, commands)
			wantRevocations := 0
			if tc.wantCommands == 2 {
				wantRevocations = 1
			}
			require.Equal(t, wantRevocations, revocations)
		})
	}
}

func TestWorkspaceCustomImageSandboxRequestHasNoToolchainBootstrap(t *testing.T) {
	row := customImageTestRow()
	row.NetworkMode = customText("none")
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true))
	request, err := s.customImageWorkspaceVMRequest(context.Background(), row)
	require.NoError(t, err)
	require.Equal(t, "docker.io/library/python@"+row.ImageDigest.String, request.Image)
	require.Empty(t, request.SnapshotID)
	require.Empty(t, request.Packages)
	require.NotNil(t, request.EgressProxy)
	require.False(t, request.EgressProxy.Enabled)
	require.NotNil(t, request.Firewall)
	require.Equal(t, "deny", string(request.Firewall.DefaultEgressAction))
	require.NotNil(t, request.Init)
	require.Len(t, request.Init.Services, 1)
	require.Equal(t, []string{"/bin/true"}, request.Init.Services[0].Exec)
}

func TestWorkspaceNetworkSandboxPolicyNoneDisablesProxy(t *testing.T) {
	base := &sandbox.EgressProxyPolicy{Enabled: true, Secrets: []sandbox.EgressProxySecret{{Name: "model", Hosts: []string{"api.openai.com"}, Value: "secret"}}}
	require.Same(t, base, workspaceSandboxEgress(db.Workspace{NetworkMode: customText("proxy")}, base))
	require.Same(t, base, workspaceSandboxEgress(db.Workspace{}, base))
	request := sandbox.CreateRequest{EgressProxy: base}
	applyWorkspaceSandboxNetwork(&request, db.Workspace{NetworkMode: customText("none")})
	require.NotNil(t, request.EgressProxy)
	require.False(t, request.EgressProxy.Enabled)
	require.Empty(t, request.EgressProxy.Secrets)
	require.NotNil(t, request.Firewall)
	require.Equal(t, "deny", string(request.Firewall.DefaultEgressAction))
	require.True(t, base.Enabled)
}

func TestWorkspaceNetworkSandboxInvalidPersistedPolicyFailsClosed(t *testing.T) {
	policy := workspaceSandboxEgress(db.Workspace{NetworkMode: customText("invalid")}, &sandbox.EgressProxyPolicy{Enabled: true})
	require.NotNil(t, policy)
	require.False(t, policy.Enabled)
}

func TestWorkspaceCustomImageImplicitBranchForkRequiresDefaultSourcePolicy(t *testing.T) {
	for _, tc := range []struct{ name, ref, mode string }{
		{"custom source", testCustomImageRef, "proxy"}, {"isolated source", "", "none"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := sampleDBWorkspace("primary-source")
			source.ImageRef = customText(tc.ref)
			source.ImageDigest = customText(testCustomImageDigest)
			source.NetworkMode = customText(tc.mode)
			derived := sampleDBWorkspace("derived")
			derived.IsFork = true
			derived.VmID = ""
			derived.TargetBookmark = "feature"
			q := &mockWorkspaceQuerier{getActiveWorkspaceForUserRepoKindFn: func(context.Context, db.GetActiveWorkspaceForUserRepoKindParams) (db.Workspace, error) {
				return source, nil
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)))
			got, forked := s.tryForkDerivedFromPrimary(context.Background(), derived, CreateWorkspaceSessionInput{UserID: derived.UserID, RepoOwner: "alice", RepoName: "demo", SourceBookmark: derived.TargetBookmark})
			require.False(t, forked)
			require.Equal(t, derived, got)
		})
	}
}

func TestWorkspaceCustomImageViewSandboxReceipt(t *testing.T) {
	for _, tc := range []struct {
		name, observed, status         string
		providerErr                    error
		denied, wantError, wantReceipt bool
	}{
		{name: "provider does not report image"},
		{name: "matching provider image", observed: "docker.io/library/python@" + testCustomImageDigest, wantReceipt: true},
		{name: "mutable provider image", observed: testCustomImageRef, wantError: true},
		{name: "different provider digest", observed: "python@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", wantError: true},
		{name: "malformed provider digest", observed: "python@sha256:bad", wantError: true},
		{name: "provider unavailable", providerErr: errors.New("unavailable"), wantError: true},
		{name: "stopped workspace", status: "suspended"},
		{name: "access denied", denied: true, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := customImageTestRow()
			if tc.status != "" {
				row.Status = tc.status
			}
			q := &mockWorkspaceQuerier{getWorkspaceByRepoFn: func(context.Context, db.GetWorkspaceByRepoParams) (db.Workspace, error) { return row, nil }}
			calls := 0
			provider := &mockWorkspaceSandboxVMClient{getVMFn: func(_ context.Context, id string) (sandbox.Sandbox, error) {
				calls++
				require.False(t, tc.denied, "unauthorized view must not inspect provider")
				require.Equal(t, row.VmID, id)
				return sandbox.Sandbox{ID: id, Image: tc.observed}, tc.providerErr
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(provider))
			requester := row.UserID
			if tc.denied {
				requester++
			}
			response, err := s.GetWorkspace(context.Background(), row.ID, row.RepositoryID, requester)
			if tc.wantError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				if tc.wantReceipt {
					require.Equal(t, testCustomImageDigest, response.Image.BootedDigest)
				} else {
					require.Empty(t, response.Image.BootedDigest)
				}
			}
			wantCalls := 1
			if tc.denied || tc.status != "" {
				wantCalls = 0
			}
			require.Equal(t, wantCalls, calls)
		})
	}
}

func TestWorkspaceCustomImageViewRuntimeReceiptFollowsAccess(t *testing.T) {
	row := customImageTestRow()
	for _, denied := range []bool{false, true} {
		q := &mockWorkspaceQuerier{getWorkspaceByRepoFn: func(context.Context, db.GetWorkspaceByRepoParams) (db.Workspace, error) { return row, nil }}
		runtime := &customImageReceiptRuntime{resourceRuntime: &resourceRuntime{}, image: workspaceapi.WorkspaceImage{Ref: row.ImageRef.String, Digest: row.ImageDigest.String}}
		s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceRuntime(runtime))
		user := row.UserID
		if denied {
			user++
		}
		response, err := s.GetWorkspace(context.Background(), row.ID, row.RepositoryID, user)
		if denied {
			require.Error(t, err)
			require.Zero(t, runtime.calls)
		} else {
			require.NoError(t, err)
			require.Equal(t, row.ImageDigest.String, response.Image.BootedDigest)
			require.Equal(t, 1, runtime.calls)
		}
	}
}

func TestWorkspaceCustomImageProvisionSurvivesClonePrerequisiteFailure(t *testing.T) {
	for _, tc := range []struct {
		name, mode                 string
		tokenFailure, cloneFailure bool
		wantTokens                 int
	}{
		{name: "token unavailable", mode: "proxy", tokenFailure: true, wantTokens: 1},
		{name: "git unavailable", mode: "proxy", cloneFailure: true, wantTokens: 1},
		{name: "no network", mode: "none", tokenFailure: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := customImageTestRow()
			row.Status = "starting"
			row.VmID = ""
			row.NetworkMode = customText(tc.mode)
			booted, tokens, revoked := false, 0, 0
			q := &mockWorkspaceQuerier{
				createAccessTokenFn: func(context.Context, db.CreateAccessTokenParams) (db.AccessToken, error) {
					tokens++
					require.True(t, booted, "optional clone prerequisites must not precede healthy guest boot")
					if tc.tokenFailure {
						return db.AccessToken{}, errors.New("token store unavailable")
					}
					return db.AccessToken{ID: 42}, nil
				},
				deleteAccessTokenFn: func(context.Context, db.DeleteAccessTokenParams) error { revoked++; return nil },
				updateWorkspaceExecutionInfoFn: func(_ context.Context, arg db.UpdateWorkspaceExecutionInfoParams) (db.Workspace, error) {
					row.VmID = arg.VmID
					row.Status = arg.Status
					return row, nil
				},
			}
			provider := &mockWorkspaceSandboxVMClient{
				createVMFn: func(_ context.Context, req sandbox.CreateRequest) (sandbox.CreateResult, error) {
					booted = true
					require.Equal(t, "docker.io/library/python@"+row.ImageDigest.String, req.Image)
					return sandbox.CreateResult{ID: "healthy-guest"}, nil
				},
				execAwaitFn: func(_ context.Context, _ string, req sandbox.ExecRequest) (sandbox.ExecResult, error) {
					if tc.mode == "none" {
						t.Fatal("isolated guest attempted repository clone")
					}
					require.Contains(t, req.Command, "command -v git")
					code := int32(0)
					if tc.cloneFailure {
						code = 127
					}
					return sandbox.ExecResult{StatusCode: &code}, nil
				},
				deleteVMFn: func(context.Context, string) error { t.Fatal("clone failure deleted healthy custom guest"); return nil },
			}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(provider))
			got, err := s.createWorkspaceVM(context.Background(), row, CreateWorkspaceSessionInput{RepositoryID: row.RepositoryID, UserID: row.UserID, RepoOwner: "alice", RepoName: "demo", SourceBookmark: "main"})
			require.NoError(t, err)
			require.Equal(t, "running", got.Status)
			require.Equal(t, "healthy-guest", got.VmID)
			require.True(t, booted)
			require.Equal(t, tc.wantTokens, tokens)
			wantRevoked := 0
			if tc.wantTokens > 0 && !tc.tokenFailure {
				wantRevoked = 1
			}
			require.Equal(t, wantRevoked, revoked)
		})
	}
}

func TestCustomImageFeatureFlagRefusesBeforeRegistryOrRuntime(t *testing.T) {
	for _, input := range []CreateWorkspaceInput{
		{Image: testCustomImageRef}, {ImageRequested: true},
		{Network: &workspaceapi.WorkspaceNetwork{Mode: "none"}}, {Network: &workspaceapi.WorkspaceNetwork{Mode: "proxy"}}, {Network: &workspaceapi.WorkspaceNetwork{}},
	} {
		for _, async := range []bool{false, true} {
			t.Run(jsonString(input)+jsonString(async), func(t *testing.T) {
				q := &mockWorkspaceQuerier{createWorkspaceFn: func(context.Context, db.CreateWorkspaceParams) (db.Workspace, error) {
					t.Fatal("flag-off request reached persistence")
					return db.Workspace{}, nil
				}}
				s := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(sandboxUntouched(t)), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
					t.Fatal("flag-off request reached registry")
					return workspaceapi.WorkspaceImage{}, nil
				})))
				input.RepositoryID, input.UserID = 101, 1
				create := s.CreateWorkspace
				if async {
					create = s.CreateWorkspaceAsync
				}
				_, err := create(context.Background(), input)
				var api *pkgerrors.APIError
				require.ErrorAs(t, err, &api)
				require.Equal(t, pkgerrors.CodeWorkspaceCustomImagesDisabled, api.Code)
				require.Equal(t, 403, api.Status)
				require.Contains(t, api.Message, "SMITHERS_FEATURE_FLAGS_WORKSPACE_CUSTOM_IMAGES")
			})
		}
	}
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{})
	omitted := CreateWorkspaceInput{}
	require.NoError(t, s.admitWorkspaceImage(context.Background(), &omitted))
	require.Nil(t, omitted.admittedImage)
	require.Nil(t, omitted.Network)
	var params db.CreateWorkspaceParams
	applyWorkspaceAdmission(&params, workspaceCreateMetadata{})
	require.False(t, params.ImageRef.Valid)
	require.False(t, params.ImageDigest.Valid)
	require.False(t, params.NetworkMode.Valid)
	require.Nil(t, networkPointer(sampleDBWorkspace("legacy")))
}

func TestCustomImageFeatureFlagEnabledRefusesExplicitEmptyReference(t *testing.T) {
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceImageResolver(customImageResolverFunc(func(context.Context, string) (workspaceapi.WorkspaceImage, error) {
		t.Fatal("empty image reached registry")
		return workspaceapi.WorkspaceImage{}, nil
	})))
	input := CreateWorkspaceInput{ImageRequested: true}
	var api *pkgerrors.APIError
	require.ErrorAs(t, s.admitWorkspaceImage(context.Background(), &input), &api)
	require.Equal(t, pkgerrors.CodeWorkspaceImageUnresolvable, api.Code)
	require.Nil(t, input.admittedImage)
	input.SnapshotID = "snapshot"
	require.ErrorAs(t, s.admitWorkspaceImage(context.Background(), &input), &api)
	require.Equal(t, pkgerrors.CodeBadRequest, api.Code)
}

type customImageRepositoryQueries struct{ *mockWorkspaceQuerier }

func (*customImageRepositoryQueries) GetRepoOwnerSlugAndNameByID(context.Context, int64) (db.GetRepoOwnerSlugAndNameByIDRow, error) {
	return db.GetRepoOwnerSlugAndNameByIDRow{OwnerSlug: "alice", RepoName: "demo"}, nil
}
func (*customImageReceiptRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}
