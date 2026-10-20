package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

func sandboxEgressFixture(t *testing.T) (SandboxEgressAllowlist, []string, []sandbox.EgressHostRule) {
	t.Helper()
	domains := []string{"api.example.test", "blobs.example.storage.googleapis.com"}
	rules := []sandbox.EgressHostRule{{Host: "storage.googleapis.com", Methods: []string{"GET", "HEAD"}, Paths: []string{"/proxy-golang-org-prod/*"}}}
	a, err := NewSandboxEgressAllowlist(domains, rules)
	require.NoError(t, err)
	return a, domains, rules
}

func TestSandboxEgressAllowlistZeroValue(t *testing.T) {
	p := &sandbox.EgressProxyPolicy{AllowDomains: []string{"existing.test"}, HostRules: sandbox.ConversationWithheldHostRules()}
	want := *p
	SandboxEgressAllowlist{}.Apply(p)
	assert.Equal(t, want, *p)
	SandboxEgressAllowlist{}.Apply(nil)
	a, err := NewSandboxEgressAllowlist(nil, nil)
	require.NoError(t, err)
	p = &sandbox.EgressProxyPolicy{}
	a.Apply(p)
	assert.Nil(t, p.AllowDomains)
}

func TestSandboxEgressAllowlistValidation(t *testing.T) {
	a, err := NewSandboxEgressAllowlist([]string{" B.Example. ", "a.example", "b.example"}, nil)
	require.NoError(t, err)
	p := &sandbox.EgressProxyPolicy{}
	a.Apply(p)
	assert.Equal(t, []string{"a.example", "b.example"}, p.AllowDomains)
	for _, domain := range []string{"*", "127.0.0.1", "::1"} {
		_, err := NewSandboxEgressAllowlist([]string{domain}, nil)
		require.Error(t, err)
	}
	_, err = NewSandboxEgressAllowlist(nil, []sandbox.EgressHostRule{{Host: "storage.googleapis.com"}})
	require.Error(t, err)
}

func TestSandboxEgressAllowlistApplyCopiesAndPreserves(t *testing.T) {
	a, domains, rules := sandboxEgressFixture(t)
	existing := sandbox.ConversationWithheldHostRules()
	quota := &sandbox.EgressQuota{BillingUserID: 7, DailyBytes: 1024}
	secrets := []sandbox.EgressProxySecret{{Name: "TOKEN", Value: "secret"}}
	p := &sandbox.EgressProxyPolicy{AllowDomains: []string{"old.test"}, HostRules: existing, Quota: quota, Secrets: secrets, ExtraAllowDomains: []string{"repo.example"}}
	domains[0] = "mutated.test"
	rules[0].Host = "mutated.test"
	rules[0].Methods[0] = "POST"
	rules[0].Paths[0] = "/bad/*"
	a.Apply(p)
	_, wantDomains, wantRules := sandboxEgressFixture(t)
	assert.Equal(t, wantDomains, p.AllowDomains)
	assert.Equal(t, append(existing, wantRules...), p.HostRules)
	assert.Same(t, quota, p.Quota)
	assert.Equal(t, secrets, p.Secrets)
	assert.Equal(t, []string{"repo.example"}, p.ExtraAllowDomains)
	p.AllowDomains[0] = "changed.test"
	i := len(existing)
	p.HostRules[i].Host = "changed.test"
	p.HostRules[i].Methods[0] = "DELETE"
	p.HostRules[i].Paths[0] = "/changed/*"
	other := &sandbox.EgressProxyPolicy{}
	a.Apply(other)
	assert.Equal(t, wantDomains, other.AllowDomains)
	assert.Equal(t, wantRules, other.HostRules)
	a.Apply(nil)
}
