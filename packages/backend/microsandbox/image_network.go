package microsandbox

import (
	"context"
	"errors"
	"reflect"
	"strings"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

func cloneImage(image *workspaceapi.WorkspaceImage) *workspaceapi.WorkspaceImage {
	if image == nil {
		return nil
	}
	result := *image
	return &result
}

func cloneNetwork(network *workspaceapi.WorkspaceNetwork) *workspaceapi.WorkspaceNetwork {
	if network == nil {
		return nil
	}
	result := *network
	return &result
}

func normalizeNetwork(network *workspaceapi.WorkspaceNetwork) (*workspaceapi.WorkspaceNetwork, error) {
	result := cloneNetwork(network)
	if result == nil {
		result = &workspaceapi.WorkspaceNetwork{Mode: "proxy"}
	}
	if result.Mode == "" {
		result.Mode = "proxy"
	}
	if result.Mode != "none" && result.Mode != "proxy" {
		return nil, errors.New("network mode must be none or proxy")
	}
	return result, nil
}

func validateImage(image workspaceapi.WorkspaceImage) error {
	if strings.TrimSpace(image.Ref) == "" || strings.ContainsAny(image.Ref, " \t\r\n\x00") || !strings.HasPrefix(image.Digest, "sha256:") || !lowerHex(strings.TrimPrefix(image.Digest, "sha256:"), 64) {
		return errors.New("workspace image requires an OCI reference and a sha256 digest")
	}
	if _, digest, pinned := strings.Cut(image.Ref, "@"); pinned && digest != image.Digest {
		return errors.New("workspace image reference and digest differ")
	}
	return nil
}

func (r *Runtime) hostPorts(network *workspaceapi.WorkspaceNetwork) []uint16 {
	if network != nil && network.Mode == "none" {
		return nil
	}
	return r.config.HostPorts
}

// WorkspaceImageReceipt reports the image observed by msb, never an inferred
// observation from product metadata. A mismatched or missing digest fails.
func (r *Runtime) WorkspaceImageReceipt(ctx context.Context, id string) (workspaceapi.WorkspaceImage, error) {
	r.mu.Lock()
	ws, err := r.workspaceLocked(id)
	if err != nil {
		r.mu.Unlock()
		return workspaceapi.WorkspaceImage{}, err
	}
	machine, requested := ws.Machine, cloneImage(ws.Image)
	r.mu.Unlock()
	// Holder identifies the backend process that booted the machine. Recovery
	// changes it, while installation/workspace ownership remains durable.
	records, err := r.cli.listSandboxes(ctx, map[string]string{providerLabel: providerName, ownerLabel: r.owner, workspaceLabel: digest(id)[:20]})
	if err != nil {
		return workspaceapi.WorkspaceImage{}, err
	}
	for _, record := range records {
		if record.Name != machine {
			continue
		}
		ref, digest, pinned := strings.Cut(record.Image, "@")
		if !pinned || !strings.HasPrefix(digest, "sha256:") || !lowerHex(strings.TrimPrefix(digest, "sha256:"), 64) {
			return workspaceapi.WorkspaceImage{}, errors.New("runtime did not report a digest-pinned workspace image")
		}
		if requested != nil {
			if digest != requested.Digest {
				return workspaceapi.WorkspaceImage{}, errors.New("booted workspace image digest differs from admitted digest")
			}
			ref = requested.Ref
		}
		return workspaceapi.WorkspaceImage{Ref: ref, Digest: digest}, nil
	}
	return workspaceapi.WorkspaceImage{}, workspaceapi.ErrWorkspaceNotFound
}

var _ workspaceapi.WorkspaceImageReporter = (*Runtime)(nil)

func cloneResources(resources *workspaceapi.WorkspaceResources) *workspaceapi.WorkspaceResources {
	if resources == nil {
		return nil
	}
	result := *resources
	return &result
}

func (r *Runtime) resourcesFor(requested *workspaceapi.WorkspaceResources) (*workspaceapi.WorkspaceResources, error) {
	resources := cloneResources(requested)
	if resources == nil {
		resources = &workspaceapi.WorkspaceResources{}
	}
	if resources.VCPUCount < 0 || resources.MemoryMB < 0 || resources.DiskMB < 0 {
		return nil, errors.New("workspace resources must be positive; zero keeps the runtime default")
	}
	if resources.VCPUCount == 0 {
		resources.VCPUCount = int32(r.config.CPUs)
	}
	if resources.MemoryMB == 0 {
		resources.MemoryMB = int32(r.config.MemoryMiB)
	}
	if resources.DiskMB == 0 {
		resources.DiskMB = int32(r.config.DiskMiB)
	}
	if resources.VCPUCount <= 0 || resources.MemoryMB <= 0 || resources.DiskMB <= 0 {
		return nil, errors.New("workspace runtime resource defaults must be positive")
	}
	return resources, nil
}

func (r *Runtime) checkExistingPolicy(existing workspaceapi.Workspace, spec workspaceapi.WorkspaceSpec) error {
	if spec.Image != nil && !reflect.DeepEqual(existing.Image, spec.Image) {
		return errors.New("workspace exists with a different image")
	}
	if spec.Network != nil {
		network, err := normalizeNetwork(spec.Network)
		if err != nil {
			return err
		}
		current, err := normalizeNetwork(existing.Network)
		if err != nil {
			return err
		}
		if !reflect.DeepEqual(current, network) {
			return errors.New("workspace exists with a different network policy")
		}
	}
	if spec.Resources != nil {
		resources, err := r.resourcesFor(spec.Resources)
		if err != nil {
			return err
		}
		current, err := r.resourcesFor(existing.Resources)
		if err != nil {
			return err
		}
		if !reflect.DeepEqual(current, resources) {
			return errors.New("workspace exists with different resources")
		}
	}
	return nil
}
