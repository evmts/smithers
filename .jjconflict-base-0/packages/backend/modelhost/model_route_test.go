package modelhost

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
	"github.com/smithersai/smithers/packages/backend/ports"
)

// A managed turn spends one credential name for every provider, so without the
// resolver's choice its refusal reads "The model provider is out of quota or
// credits" and no operator can tell which provider ran out.
func TestManagedBindingNamesItsProviderInARefusal(t *testing.T) {
	for _, tc := range []struct {
		configured map[string]string
		provider   string
	}{
		{map[string]string{modelproxy.ProviderCerebras: "cerebras-private-fixture"}, "Cerebras"},
		{map[string]string{modelproxy.ProviderOpenAI: "openai-private-fixture"}, "OpenAI"},
		{map[string]string{modelproxy.ProviderAnthropic: "anthropic-private-fixture"}, "Anthropic"},
	} {
		managed, err := NewManagedModels(ownerResolving(Binding{}, ErrOwnerModelUnset), modelproxy.NewStaticKeys(tc.configured), testProxyURL)
		require.NoError(t, err)
		binding, err := managed.ResolveChatModel(context.Background(), 7, 0, json.RawMessage(`{}`))
		require.NoError(t, err)
		require.Equal(t, tc.provider, binding.Provider)
		require.Equal(t, tc.provider, bindingProvider(binding))
		require.Equal(t, tc.provider+" is out of quota or credits.", (&chat.ProviderRefusal{Code: "provider_quota", Provider: bindingProvider(binding)}).Text())
		for _, secret := range tc.configured {
			require.NotContains(t, binding.Provider, secret)
		}
	}
}

// An owner's own key still names its provider, and an unknown credential names
// none rather than inventing one.
func TestOwnerBindingProviderComesFromItsCredential(t *testing.T) {
	require.Equal(t, "OpenAI", bindingProvider(Binding{CredentialName: "OPENAI_API_KEY"}))
	require.Equal(t, "Cerebras", bindingProvider(Binding{CredentialName: "CEREBRAS_API_KEY"}))
	require.Empty(t, bindingProvider(Binding{CredentialName: "TEAM_INFERENCE_KEY"}))
	require.Empty(t, bindingProvider(Binding{CredentialName: ManagedCredentialName}), "a managed binding without a chosen provider names none")
}

func TestModelRouteDescribesTheSelectionWithoutSecrets(t *testing.T) {
	managed := Binding{
		Model:            json.RawMessage(`{"protocol":"openai-chat","modelId":"gpt-oss-120b","credential":"SMITHERS_MANAGED","baseUrl":"https://api.example.test/model-proxy/cerebras"}`),
		CredentialName:   ManagedCredentialName,
		CredentialOrigin: "https://api.example.test",
		Provider:         "Cerebras",
		Managed:          true,
	}
	require.Equal(t, "credit=managed provider=Cerebras protocol=openai-chat model=gpt-oss-120b credential=SMITHERS_MANAGED",
		modelRoute(managed, bindingProvider(managed)))

	own := Binding{
		Model:           json.RawMessage(`{"protocol":"openai-responses","modelId":"gpt-6-sol","credential":"OPENAI_API_KEY"}`),
		CredentialName:  "OPENAI_API_KEY",
		CredentialValue: "sk-owner-secret-fixture",
	}
	route := modelRoute(own, bindingProvider(own))
	require.Equal(t, "credit=owner provider=OpenAI protocol=openai-responses model=gpt-6-sol credential=OPENAI_API_KEY", route)
	require.NotContains(t, route, own.CredentialValue)
	require.NotContains(t, route, "api.example.test")

	fast := Binding{Fast: &modelproxy.InstallFastSource{}, Model: json.RawMessage(`{"protocol":"openai-chat","modelId":"gpt-oss-120b"}`)}
	require.Equal(t, "credit=fast provider=unknown protocol=openai-chat model=gpt-oss-120b credential=unknown", modelRoute(fast, bindingProvider(fast)))

	// An unresolvable binding still reads as a route, not as blanks.
	require.Equal(t, "credit=owner provider=unknown protocol=unknown model=unknown credential=unknown", modelRoute(Binding{}, ""))
}

// A model identifier is an owner's saved value, so the route filters and bounds
// it instead of carrying it into a log line as it was written.
func TestModelRouteFiltersAndBoundsOwnerSuppliedFields(t *testing.T) {
	hostile, err := json.Marshal(map[string]string{
		"protocol": "openai-chat\nlevel=ERROR msg=\"forged\"",
		"modelId":  strings.Repeat("m", 400),
	})
	require.NoError(t, err)
	route := modelRoute(Binding{Model: hostile, CredentialName: "OPENAI_API_KEY"}, "OpenAI")
	require.NotContains(t, route, "\n")
	require.NotContains(t, route, "\"")
	require.Contains(t, route, "protocol=openai-chatlevelERROR msgforged")
	require.Contains(t, route, "model="+strings.Repeat("m", maxRouteFieldBytes)+" ")
	require.NotContains(t, route, strings.Repeat("m", maxRouteFieldBytes+1))
}

// The route reaches the turn's progress observer, which joins it to the
// durable turn identity, so a stalled or refused turn names its provider.
func TestResolvedRouteReachesTheTurnProgressObserver(t *testing.T) {
	var seen []ports.ChatProgress
	ctx := ports.WithChatProgress(context.Background(), func(event ports.ChatProgress) { seen = append(seen, event) })
	managed := Binding{Model: json.RawMessage(`{"protocol":"openai-chat","modelId":"gpt-oss-120b"}`), CredentialName: ManagedCredentialName, CredentialOrigin: "https://api.example.test", Provider: "Cerebras", Managed: true}
	var got Binding
	used := false
	stop := errors.New("stop after launch")
	host, err := New(ownerResolving(managed, nil), recordingLauncher{got: &got, err: stop, used: &used})
	require.NoError(t, err)
	require.ErrorIs(t, host.RunChatTurn(ctx, ports.ChatTurnGrant{TurnID: "4b0f1c52-3a0e-4d53-9a55-1f1f7c3b8a10", OwnerID: 7, Generation: 3, Token: "producer-token"}), stop)
	var routes []string
	for _, event := range seen {
		if event.Route != "" {
			require.Equal(t, ports.ChatStageModel, event.Stage)
			routes = append(routes, event.Route)
		}
	}
	require.Equal(t, []string{"credit=managed provider=Cerebras protocol=openai-chat model=gpt-oss-120b credential=SMITHERS_MANAGED"}, routes)
	require.NotContains(t, strings.Join(routes, " "), got.CredentialValue)
}

// An operator reads which provider ordinary turns reach without running one.
func TestManagedDefaultProviderNamesWhatAnOrdinaryTurnSpends(t *testing.T) {
	require.Empty(t, ManagedDefaultProvider(nil))
	require.Empty(t, ManagedDefaultProvider(modelproxy.NewStaticKeys(map[string]string{})))
	require.Empty(t, ManagedDefaultProvider(modelproxy.NewStaticKeys(map[string]string{modelproxy.ProviderVercel: "judge-key"})),
		"the evaluation seat is not a managed chat default")
	// Production's shape: placeholder keys offer nothing, so the one funded
	// provider serves, not the preferred one.
	require.Equal(t, modelproxy.ProviderCerebras, ManagedDefaultProvider(modelproxy.NewStaticKeys(map[string]string{
		modelproxy.ProviderAnthropic: "placeholder-anthropic",
		modelproxy.ProviderOpenAI:    "placeholder-openai",
		modelproxy.ProviderCerebras:  "cerebras-private-fixture",
	})))
	require.Equal(t, modelproxy.ProviderAnthropic, ManagedDefaultProvider(modelproxy.NewStaticKeys(map[string]string{
		modelproxy.ProviderAnthropic: "anthropic-private-fixture",
		modelproxy.ProviderCerebras:  "cerebras-private-fixture",
	})))
}
