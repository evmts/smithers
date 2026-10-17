package modelproxy

import (
	"log/slog"
	"net/http"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// observeRequest records authenticated correlation and transfer metadata. No
// model input/output, credential, URL or upstream error detail enters this log.
// The chi wrapper preserves Flush for streaming responses.
func observeRequest(w http.ResponseWriter, r *http.Request, caller Caller, provider string) (http.ResponseWriter, func()) {
	started := time.Now()
	logger := slog.Default().With("source", caller.Source, "reference", caller.Reference, "provider", provider, "request_id", chimiddleware.GetReqID(r.Context()))
	logger.Info("model proxy request started")
	response := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
	return response, func() {
		logger.Info("model proxy request finished", "status", response.Status(), "response_bytes", response.BytesWritten(), "elapsed_ms", time.Since(started).Milliseconds(), "cancelled", r.Context().Err() != nil)
	}
}
