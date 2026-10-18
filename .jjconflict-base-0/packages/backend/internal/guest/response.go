package guest

import (
	"bytes"
	"net/http"
)

// responseBuffer keeps the fixed model action and proxy internal; neither
// forwards provider headers or untrusted cookies to the visitor.
type responseBuffer struct {
	Body   bytes.Buffer
	Code   int
	header http.Header
}

func newResponseBuffer() *responseBuffer      { return &responseBuffer{header: make(http.Header)} }
func (r *responseBuffer) Header() http.Header { return r.header }
func (r *responseBuffer) WriteHeader(status int) {
	if r.Code == 0 {
		r.Code = status
	}
}
func (r *responseBuffer) Write(data []byte) (int, error) {
	if r.Code == 0 {
		r.WriteHeader(200)
	}
	return r.Body.Write(data)
}
