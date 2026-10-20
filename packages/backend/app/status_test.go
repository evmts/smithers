package app

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

type configCanarySource struct{}

func (*configCanarySource) LatestCanaryRuns(context.Context) ([]services.CanaryRun, error) {
	return nil, nil
}

func TestPublicStatusSourceForwardedToCompose(t *testing.T) {
	source := &configCanarySource{}
	assert.Same(t, source, (Config{CanaryRuns: source}).options().CanaryRuns)
}

func TestSandboxEgressConfigForwardedToCompose(t *testing.T) {
	cfg := Config{SandboxEgressAllowDomains: []string{"blobs.example.storage.googleapis.com"}, SandboxEgressHostRules: []sandbox.EgressHostRule{{Host: "storage.googleapis.com", Methods: []string{"GET", "HEAD"}, Paths: []string{"/proxy-golang-org-prod/*"}}}}
	options := cfg.options()
	assert.Equal(t, cfg.SandboxEgressAllowDomains, options.SandboxEgressAllowDomains)
	assert.Equal(t, cfg.SandboxEgressHostRules, options.SandboxEgressHostRules)
}
