package modelhost

import (
	"encoding/json"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// maxRouteFieldBytes bounds one field of a model route. A model identifier
// comes from an owner's saved model, so it is bounded and filtered here
// rather than trusted into a log line.
const maxRouteFieldBytes = 48

// bindingProvider is the product's name for the provider a binding reaches.
// A resolver that chose the provider itself, such as managed credit, names
// it on the binding; otherwise the built-in credential names it.
func bindingProvider(binding Binding) string {
	if binding.Provider != "" {
		return binding.Provider
	}
	return services.ModelProviderNames[binding.CredentialName]
}

// modelRoute describes the model one turn resolved, for the turn's bounded
// progress diagnostics: whose credit it spends, which provider, protocol and
// model answer it, and the name of the credential variable it spends. Every
// field is a software-selected word or a filtered identifier, so no
// credential value, origin, prompt or provider output can travel on it.
func modelRoute(binding Binding, provider string) string {
	var model struct {
		Protocol string `json:"protocol"`
		ModelID  string `json:"modelId"`
	}
	_ = json.Unmarshal(binding.Model, &model)
	credit := "owner"
	switch {
	case binding.Managed:
		credit = "managed"
	case binding.Fast != nil:
		credit = "fast"
	}
	return strings.Join([]string{
		"credit=" + credit,
		"provider=" + routeField(provider),
		"protocol=" + routeField(model.Protocol),
		"model=" + routeField(model.ModelID),
		"credential=" + routeField(binding.CredentialName),
	}, " ")
}

// routeField keeps the characters a provider, protocol, model or credential
// name is spelled with, and nothing else. An empty or unrecognizable value
// reads as "unknown" rather than as a blank a reader would misattribute.
func routeField(value string) string {
	var kept strings.Builder
	for _, r := range value {
		if kept.Len() >= maxRouteFieldBytes {
			break
		}
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			kept.WriteRune(r)
		case r == '-', r == '_', r == '.', r == ':', r == '/', r == ' ':
			kept.WriteRune(r)
		}
	}
	if strings.TrimSpace(kept.String()) == "" {
		return "unknown"
	}
	return strings.TrimSpace(kept.String())
}
