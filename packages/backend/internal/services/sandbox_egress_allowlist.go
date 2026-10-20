package services

import (
	"slices"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// SandboxEgressAllowlist is the deployment policy applied to each new box.
// Its zero value preserves the provider's default allowlist.
type SandboxEgressAllowlist struct {
	domains []string
	rules   []sandbox.EgressHostRule
}

func NewSandboxEgressAllowlist(domains []string, rules []sandbox.EgressHostRule) (SandboxEgressAllowlist, error) {
	var normalized []string
	var err error
	if len(domains) > 0 {
		normalized, err = NormalizeEgressAllowDomains(domains)
		if err != nil {
			return SandboxEgressAllowlist{}, err
		}
	}
	for _, rule := range rules {
		if err := rule.Validate(); err != nil {
			return SandboxEgressAllowlist{}, err
		}
	}
	return SandboxEgressAllowlist{domains: normalized, rules: cloneSandboxEgressHostRules(rules)}, nil
}

func cloneSandboxEgressHostRules(rules []sandbox.EgressHostRule) []sandbox.EgressHostRule {
	cloned := slices.Clone(rules)
	for i := range cloned {
		cloned[i].Methods = slices.Clone(cloned[i].Methods)
		cloned[i].Paths = slices.Clone(cloned[i].Paths)
	}
	return cloned
}

// Apply replaces the deployment domains and adds restrictions without changing
// repository extras, quota or credentials. Each policy owns its slices.
func (a SandboxEgressAllowlist) Apply(policy *sandbox.EgressProxyPolicy) {
	if policy == nil {
		return
	}
	if a.domains != nil {
		policy.AllowDomains = slices.Clone(a.domains)
	}
	if len(a.rules) > 0 {
		policy.HostRules = append(slices.Clone(policy.HostRules), cloneSandboxEgressHostRules(a.rules)...)
	}
}
