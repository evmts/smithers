package ports

import "context"

// ChatStage identifies a host execution boundary without including model input,
// credentials or provider output. Adapters report these through the turn context.
type ChatStage string

const (
	ChatStageDispatch       ChatStage = "dispatch"
	ChatStageCredential     ChatStage = "credential_issue"
	ChatStageSource         ChatStage = "source_lookup"
	ChatStageInstructions   ChatStage = "instructions_read"
	ChatStageModel          ChatStage = "model_resolve"
	ChatStageSandboxCreate  ChatStage = "sandbox_create"
	ChatStageSandboxCreated ChatStage = "sandbox_created"
	ChatStageService        ChatStage = "service_start"
	ChatStageHealth         ChatStage = "health_probe"
	ChatStageHostRequest    ChatStage = "host_request"
	ChatStageHostResponse   ChatStage = "host_response"
	ChatStageHostBody       ChatStage = "host_body"
	ChatStageCleanup        ChatStage = "host_cleanup"
)

// ChatProgress is metadata about one turn's current execution stage. SandboxID
// is the provider-issued identity, never a URL, credential or launch payload.
// Route names the model the turn resolved, in the bounded form described on
// ReportChatModelRoute.
type ChatProgress struct {
	Stage     ChatStage
	SandboxID string
	Route     string
}

type chatProgressKey struct{}

// WithChatProgress attaches a process-local observer. It never enters the grant
// wire format. The observer must return promptly and must not log payloads.
func WithChatProgress(ctx context.Context, observe func(ChatProgress)) context.Context {
	return context.WithValue(ctx, chatProgressKey{}, observe)
}

// ReportChatProgress reports a software-selected stage and optional sandbox
// identity. It is a no-op outside a dispatcher carrying an observer.
func ReportChatProgress(ctx context.Context, stage ChatStage, sandboxID string) {
	if observe, ok := ctx.Value(chatProgressKey{}).(func(ChatProgress)); ok && observe != nil {
		observe(ChatProgress{Stage: stage, SandboxID: sandboxID})
	}
}

// ReportChatModelRoute reports which model answers this turn, once its binding
// is resolved: whose credit it spends, the provider, protocol and model that
// serve it, and the name of the credential variable. The adapter builds the
// value from software-selected words and bounded identifiers alone, so no
// credential, origin, prompt or provider output can travel on it.
func ReportChatModelRoute(ctx context.Context, route string) {
	if observe, ok := ctx.Value(chatProgressKey{}).(func(ChatProgress)); ok && observe != nil {
		observe(ChatProgress{Stage: ChatStageModel, Route: route})
	}
}
