// Legacy global orchestration state has been removed.
// Use token-based orchestration from SmithersProvider instead:
// - createOrchestrationPromise() returns { promise, token }
// - signalOrchestrationCompleteByToken(token)
// - signalOrchestrationErrorByToken(token, err)
//
// This file is kept empty for backwards compatibility with test imports.
// Tests that previously called signalOrchestrationComplete() in afterEach
// can safely remove those calls - the token-based system auto-cleans up.
