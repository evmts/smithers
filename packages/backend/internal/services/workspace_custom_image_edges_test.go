package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCustomImageDefaultResolverPersistsVerifiedAdmissionBeforeProvisioning(t *testing.T) {
	requests := atomic.Int32{}
	client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		assert.Equal(t, "registry-1.docker.io", r.Host)
		assert.Equal(t, "/v2/library/python/manifests/3.13-slim", r.URL.Path)
		fmt.Fprint(w, customImageManifest)
	}))
	// Replace only external registry routing. The default resolver still builds
	// its own HTTP client, hashes real HTTP response bytes, and admits the image.
	// This top-level test is synchronous; parallel tests run after its cleanup.
	previous := http.DefaultTransport
	http.DefaultTransport = client.Transport
	t.Cleanup(func() { http.DefaultTransport = previous })
	storeFailure := errors.New("workspace insert unavailable")
	for _, mode := range []string{"proxy", "none"} {
		t.Run(mode, func(t *testing.T) {
			insertions := 0
			q := &mockWorkspaceQuerier{createWorkspaceFn: func(_ context.Context, arg db.CreateWorkspaceParams) (db.Workspace, error) {
				insertions++
				require.Equal(t, testCustomImageRef, arg.ImageRef.String)
				require.True(t, arg.ImageRef.Valid)
				require.Equal(t, customManifestDigest(customImageManifest), arg.ImageDigest.String)
				require.True(t, arg.ImageDigest.Valid)
				require.Equal(t, mode, arg.NetworkMode.String)
				require.True(t, arg.NetworkMode.Valid)
				return db.Workspace{}, storeFailure
			}}
			s := newWorkspaceServiceForTests(q, WithWorkspaceCustomImagesEnabled(true), WithWorkspaceSandboxClient(sandboxUntouched(t)))
			_, err := s.CreateWorkspace(context.Background(), CreateWorkspaceInput{RepositoryID: 101, UserID: 1, Name: "verified-image", Image: testCustomImageRef, Network: &workspaceapi.WorkspaceNetwork{Mode: mode}})
			require.ErrorContains(t, err, storeFailure.Error())
			require.Equal(t, 1, insertions)
		})
	}
	require.EqualValues(t, 2, requests.Load())
}

func TestWorkspaceCustomImageLegacyRuntimeSpecOmitsCallerPolicy(t *testing.T) {
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceRuntime(&resourceRuntime{}))
	spec, err := s.runtimeWorkspaceSpec(context.Background(), sampleDBWorkspace("legacy-default-image"))
	require.NoError(t, err)
	require.Nil(t, spec.Image)
	require.Nil(t, spec.Network)
}

func TestWorkspaceCustomImageReceiptUnavailableEvidenceDoesNotInventBoot(t *testing.T) {
	for _, scenario := range []string{"legacy image", "runtime without reporter", "receipt store missing", "receipt store failure"} {
		t.Run(scenario, func(t *testing.T) {
			row := customImageTestRow()
			reporter := &customImageReceiptRuntime{resourceRuntime: &resourceRuntime{}, image: workspaceapi.WorkspaceImage{Ref: row.ImageRef.String, Digest: row.ImageDigest.String}}
			runtime := workspaceapi.WorkspaceRuntime(reporter)
			q := WorkspaceQuerier(&mockWorkspaceQuerier{})
			storeFailure := errors.New("receipt update unavailable")
			if scenario == "legacy image" {
				row.ImageRef = customText("")
			}
			if scenario == "runtime without reporter" {
				runtime = &resourceRuntime{}
			}
			if scenario == "receipt store failure" {
				q = &customImageReceiptQueries{mockWorkspaceQuerier: &mockWorkspaceQuerier{}, save: func(_ context.Context, arg db.SetWorkspaceImageReceiptParams) (db.Workspace, error) {
					require.Equal(t, row.ID, arg.ID)
					require.Equal(t, row.ImageDigest.String, arg.BootedImageDigest)
					return row, storeFailure
				}}
			}
			s := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime))
			got, err := s.recordRuntimeWorkspaceImage(context.Background(), row)
			switch scenario {
			case "receipt store missing":
				var api *pkgerrors.APIError
				require.ErrorAs(t, err, &api)
				require.Equal(t, pkgerrors.CodeInternal, api.Code)
				require.Contains(t, api.Message, "receipt store unavailable")
			case "receipt store failure":
				require.ErrorIs(t, err, storeFailure)
			default:
				require.NoError(t, err)
				require.Zero(t, reporter.calls)
			}
			require.Equal(t, row, got)
			require.Empty(t, got.BootedImageDigest.String)
		})
	}
}

func TestWorkspaceCustomImageSandboxReceiptMissingExecutionDoesNotInspect(t *testing.T) {
	for _, scenario := range []string{"legacy image", "no guest", "no provider"} {
		t.Run(scenario, func(t *testing.T) {
			row := customImageTestRow()
			provider := &mockWorkspaceSandboxVMClient{getVMFn: func(context.Context, string) (sandbox.Sandbox, error) {
				t.Fatal("workspace without observable execution reached provider")
				return sandbox.Sandbox{}, nil
			}}
			s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceSandboxClient(provider))
			switch scenario {
			case "legacy image":
				row.ImageRef = customText("")
			case "no guest":
				row.VmID = ""
			case "no provider":
				s.sandbox = nil
			}
			digest, err := s.observeSandboxWorkspaceImage(context.Background(), row)
			require.NoError(t, err)
			require.Empty(t, digest)
		})
	}
}

type customImageEdgeRepositoryQueries struct {
	*mockWorkspaceQuerier
	lookup func(context.Context, int64) (db.GetRepoOwnerSlugAndNameByIDRow, error)
}

func (q *customImageEdgeRepositoryQueries) GetRepoOwnerSlugAndNameByID(ctx context.Context, id int64) (db.GetRepoOwnerSlugAndNameByIDRow, error) {
	return q.lookup(ctx, id)
}

func TestWorkspaceCustomImageClonePrerequisitesRemainOptionalAndCancellationWins(t *testing.T) {
	for _, scenario := range []string{"identity", "repository lookup", "clone URL", "token store"} {
		for _, canceled := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/canceled=%t", scenario, canceled), func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				row := customImageTestRow()
				failure := errors.New("clone prerequisite unavailable")
				commands, tokens, revocations := 0, 0, 0
				q := &customImageEdgeRepositoryQueries{mockWorkspaceQuerier: &mockWorkspaceQuerier{
					createAccessTokenFn: func(context.Context, db.CreateAccessTokenParams) (db.AccessToken, error) {
						tokens++
						if canceled {
							cancel()
						}
						return db.AccessToken{}, failure
					},
					deleteAccessTokenFn: func(context.Context, db.DeleteAccessTokenParams) error { revocations++; return nil },
				}, lookup: func(context.Context, int64) (db.GetRepoOwnerSlugAndNameByIDRow, error) {
					if scenario == "repository lookup" {
						if canceled {
							cancel()
						}
						return db.GetRepoOwnerSlugAndNameByIDRow{}, failure
					}
					return db.GetRepoOwnerSlugAndNameByIDRow{OwnerSlug: "alice", RepoName: "demo"}, nil
				}}
				runtime := &customImageCloneRuntime{resourceRuntime: &resourceRuntime{}, execute: func(context.Context, string, workspaceapi.Command) (workspaceapi.CommandResult, error) {
					commands++
					if canceled && scenario == "clone URL" {
						cancel()
					}
					return workspaceapi.CommandResult{}, nil
				}}
				s := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime))
				if scenario == "identity" {
					s.runtimeIdentity = func(context.Context, db.Workspace, int64) (workspaceapi.Operation, error) {
						if canceled {
							cancel()
						}
						return workspaceapi.Operation{}, failure
					}
				}
				if scenario == "clone URL" {
					s.gitBaseURL = "missing-scheme-and-host"
				}
				err := s.ensureCustomRuntimeWorkspaceRepository(ctx, row, row.UserID)
				if scenario == "identity" {
					var api *pkgerrors.APIError
					require.ErrorAs(t, err, &api)
					require.Equal(t, pkgerrors.CodeInternal, api.Code)
					require.Same(t, failure, api.Cause())
					require.Zero(t, commands)
				} else {
					if canceled {
						require.ErrorIs(t, err, context.Canceled)
					} else {
						require.NoError(t, err)
					}
					require.Equal(t, 1, commands, "prerequisite failure must never execute git clone")
				}
				wantTokens := 0
				if scenario == "token store" {
					wantTokens = 1
				}
				require.Equal(t, wantTokens, tokens)
				require.Zero(t, revocations, "failed mint must not revoke an unrelated credential")
			})
		}
	}
}

func TestWorkspaceCustomImageSandboxPolicyReadFailureRefusesRequest(t *testing.T) {
	row := customImageTestRow()
	failure := errors.New("repository egress policy unavailable")
	s := newWorkspaceServiceForTests(&mockWorkspaceQuerier{}, WithWorkspaceEgressAllowDomains(NewRepositoryEgressPolicyService(&egressPolicyStore{getErr: failure}, nil)))
	request, err := s.customImageWorkspaceVMRequest(context.Background(), row)
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, pkgerrors.CodeInternal, api.Code)
	require.Same(t, failure, api.Cause())
	require.Empty(t, request.Image, "failed policy admission cannot yield a bootable request")
	row.NetworkMode = customText("none")
	request, err = s.customImageWorkspaceVMRequest(context.Background(), row)
	require.NoError(t, err)
	require.False(t, request.EgressProxy.Enabled, "isolated guest does not depend on unavailable proxy policy")
}

func TestWorkspaceCustomImageSandboxCloneInvalidPrerequisitesDoNotExecute(t *testing.T) {
	for _, scenario := range []string{"invalid base URL", "provider without command support", "isolated guest", "malformed clone URL", "clone URL without host"} {
		for _, canceled := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/canceled=%t", scenario, canceled), func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				if canceled {
					cancel()
				}
				row := customImageTestRow()
				q := &mockWorkspaceQuerier{createAccessTokenFn: func(context.Context, db.CreateAccessTokenParams) (db.AccessToken, error) {
					t.Fatal("invalid optional clone minted a credential")
					return db.AccessToken{}, nil
				}}
				provider := &mockWorkspaceSandboxVMClient{execAwaitFn: func(context.Context, string, sandbox.ExecRequest) (sandbox.ExecResult, error) {
					t.Fatal("invalid optional clone executed a guest command")
					return sandbox.ExecResult{}, nil
				}}
				s := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(provider))
				cloneURL := "https://git.example/alice/demo.git"
				var err error
				switch scenario {
				case "invalid base URL":
					s.gitBaseURL = "missing-scheme-and-host"
					err = s.prepareCustomSandboxRepository(ctx, row, row.VmID, CreateWorkspaceSessionInput{UserID: row.UserID, RepoOwner: "alice", RepoName: "demo"})
				case "provider without command support":
					s.sandbox = &workspaceZNoExecSandbox{}
				case "isolated guest":
					row.NetworkMode = customText("none")
				case "malformed clone URL":
					cloneURL = "https://%invalid/alice/demo.git"
				case "clone URL without host":
					cloneURL = "/alice/demo.git"
				}
				if scenario != "invalid base URL" {
					err = s.cloneCustomSandboxRepository(ctx, row, row.VmID, cloneURL, "must-not-be-used")
				}
				if canceled {
					require.ErrorIs(t, err, context.Canceled)
				} else {
					require.NoError(t, err)
				}
			})
		}
	}
}

func TestCustomImageRegistryDefaultClientRefusesRedirectWithoutFollowing(t *testing.T) {
	requests := atomic.Int32{}
	client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Location", "https://untrusted.example/private-manifest")
		w.WriteHeader(http.StatusFound)
	}))
	previous := http.DefaultTransport
	http.DefaultTransport = client.Transport
	t.Cleanup(func() { http.DefaultTransport = previous })
	image, err := (publicWorkspaceImageResolver{}).Resolve(context.Background(), testCustomImageRef)
	require.ErrorContains(t, err, "HTTP 302")
	require.Empty(t, image.Digest)
	require.EqualValues(t, 1, requests.Load(), "default registry client must not follow an untrusted redirect")
}

func TestCustomImageRegistryInterruptedHTTPResponsesRefuseAdmission(t *testing.T) {
	for _, scenario := range []string{"authenticated manifest disconnect", "manifest body truncated", "anonymous token disconnect"} {
		t.Run(scenario, func(t *testing.T) {
			requests := atomic.Int32{}
			client := customImageRegistryClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				if scenario == "manifest body truncated" {
					w.Header().Set("Content-Length", fmt.Sprint(len(customImageManifest)+20))
					fmt.Fprint(w, customImageManifest)
					return
				}
				if r.URL.Path != "/token" && r.Header.Get("Authorization") == "" {
					w.Header().Set("WWW-Authenticate", `Bearer realm="https://auth.docker.io/token"`)
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				if scenario == "authenticated manifest disconnect" && r.URL.Path == "/token" {
					fmt.Fprint(w, `{"token":"anonymous-public-token"}`)
					return
				}
				connection, _, err := w.(http.Hijacker).Hijack()
				if !assert.NoError(t, err) {
					return
				}
				connection.Close()
			}))
			image, err := (publicWorkspaceImageResolver{client: client}).Resolve(context.Background(), testCustomImageRef)
			require.Error(t, err)
			require.Empty(t, image.Digest, "broken HTTP exchange cannot admit an image")
			if scenario == "manifest body truncated" {
				require.ErrorIs(t, err, io.ErrUnexpectedEOF)
				require.EqualValues(t, 1, requests.Load())
			} else {
				require.ErrorIs(t, err, io.EOF)
				require.GreaterOrEqual(t, requests.Load(), int32(2))
			}
		})
	}
}

func TestCustomImageRegistryAnonymousTokenWithoutContextRefusesBeforeHTTP(t *testing.T) {
	client := &http.Client{Transport: registryHTTPTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("missing context reached HTTP transport")
		return nil, nil
	})}
	image, err := parsePublicImageReference(testCustomImageRef)
	require.NoError(t, err)
	token, err := anonymousImageToken(nil, client, image, `Bearer realm="https://auth.docker.io/token"`)
	require.ErrorContains(t, err, "nil Context")
	require.Empty(t, token)
}
