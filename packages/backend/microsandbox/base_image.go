package microsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// bundleBaseImagePath is the install bundle's offline copy of DefaultImage
// (spec §16.1.0), packaged by apps/app/scripts/bundle-microsandbox.ts.
const bundleBaseImagePath = "share/microsandbox/base-image.oci.tar"

// baseImage records that DefaultImage is in Microsandbox's image store with
// its pinned digest, so each process checks the store once.
type baseImage struct {
	mu     sync.Mutex
	loaded bool
}

// pullPolicy is msb's --pull for the base image. An installed runtime never
// pulls: ensureBaseImage loads the bundle's archive instead.
func (r *Runtime) pullPolicy() string {
	if r.config.Bundle != nil {
		return "never"
	}
	return "if-missing"
}

// ensureBaseImage puts DefaultImage in Microsandbox's image store before a VM
// boots it. An installed runtime whose store lacks it loads the bundle's
// archive, verified against the pinned manifest, instead of pulling 412 MiB
// from Docker Hub; the stored image must carry the pinned digest. A runtime
// without a bundle leaves the image to `create --pull if-missing`.
func (r *Runtime) ensureBaseImage(ctx context.Context) error {
	if r.config.Bundle == nil {
		return nil
	}
	r.baseImage.mu.Lock()
	defer r.baseImage.mu.Unlock()
	if r.baseImage.loaded {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	digest, found, err := r.imageDigest(ctx, DefaultImage)
	if err != nil {
		return err
	}
	if !found {
		archive := r.config.Bundle.Library(bundleBaseImagePath)
		if err := archive.Check(); err != nil {
			return fmt.Errorf("%w: bundled base image: %w", ErrUnavailable, err)
		}
		if _, err := r.cli.run(ctx, nil, "load", "-i", archive.Path(), "-t", DefaultImage, "-q"); err != nil {
			return fmt.Errorf("%w: load the bundled base image: %v", ErrUnavailable, err)
		}
		if digest, found, err = r.imageDigest(ctx, DefaultImage); err != nil {
			return err
		}
	}
	_, want, _ := strings.Cut(DefaultImage, "@")
	if !found || digest != want {
		return fmt.Errorf("%w: the stored base image has digest %q, not %s", ErrUnavailable, digest, want)
	}
	r.baseImage.loaded = true
	return nil
}

// imageDigest returns the manifest digest Microsandbox records for image.
func (r *Runtime) imageDigest(ctx context.Context, image string) (string, bool, error) {
	out, err := r.cli.run(ctx, nil, "image", "inspect", image, "--format", "json")
	var missing *cliError
	if errors.As(err, &missing) && strings.Contains(missing.stderr, "image not found") {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("%w: inspect the base image: %v", ErrUnavailable, err)
	}
	var inspected struct {
		Digest string `json:"digest"`
	}
	if err := json.Unmarshal(out, &inspected); err != nil {
		return "", false, fmt.Errorf("%w: inspect the base image: %v", ErrUnavailable, err)
	}
	return inspected.Digest, true, nil
}
