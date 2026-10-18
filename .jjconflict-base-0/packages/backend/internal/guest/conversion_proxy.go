package guest

import (
	"crypto/subtle"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
)

// MountProxy exposes only the converter to an operator-authenticated Worker.
// Host cookies and authentication never cross this boundary. The Worker owns
// a host-only capability cookie and passes its value in the dedicated header.
func (h *Handler) MountProxy(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(h.proxyBoundary)
		r.Get("/api/guest-proxy/repos/{owner}/{repo}/session", h.Boot)
		r.Post("/api/guest-proxy/repos/{owner}/{repo}/conversions", h.Convert)
		r.Get("/api/guest-proxy/repos/{owner}/{repo}/conversions/key", h.ConversionKey)
		r.Get("/api/guest-proxy/repos/{owner}/{repo}/conversions/{key}", h.Conversion)
	})
}
func (h *Handler) proxyBoundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected, err := url.Parse(h.Config.ProxyOrigin)
		origin, originErr := url.Parse(r.Header.Get("Origin"))
		if err != nil || originErr != nil || expected.Scheme != "https" || expected.Host == "" || expected.Path != "" || expected.RawQuery != "" || expected.Fragment != "" || origin.String() != expected.String() || len(h.Config.ProxySecret) < 32 || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Smithers-Guest-Proxy")), []byte(h.Config.ProxySecret)) != 1 {
			conversionRefuse(w, Refusal("guest_not_allowed"))
			return
		}
		address := net.ParseIP(r.Header.Get("X-Smithers-Guest-IP"))
		if address == nil {
			conversionRefuse(w, Refusal("guest_unavailable"))
			return
		}
		// No cookies, bearer, model options, or caller-controlled forwarding chain.
		request := r.Clone(r.Context())
		request.Header = r.Header.Clone()
		session := request.Header.Get("X-Smithers-Guest-Session")
		request.Header.Del("Cookie")
		request.Header.Del("Authorization")
		request.Header.Del("X-Smithers-Guest-Proxy")
		request.Header.Del("X-Smithers-Guest-Session")
		request.RemoteAddr = net.JoinHostPort(address.String(), "0")
		repo, err := h.repositoryAccess(request, false)
		if err != nil {
			conversionRefuse(w, err)
			return
		}
		if len(session) == 64 && !strings.ContainsAny(session, ";\r\n") {
			request.AddCookie(&http.Cookie{Name: "smithers_guest_" + formatID(repo.ID), Value: session})
		}
		response := newResponseBuffer()
		next.ServeHTTP(response, request)
		for k, values := range response.Header() {
			if strings.EqualFold(k, "Set-Cookie") {
				continue
			}
			w.Header()[k] = values
		}
		for _, cookie := range (&http.Response{Header: response.Header()}).Cookies() {
			if cookie.Name == "smithers_guest_"+formatID(repo.ID) {
				w.Header().Set("X-Smithers-Guest-Session", cookie.Value)
			}
		}
		w.WriteHeader(response.Code)
		_, _ = w.Write(response.Body.Bytes())
	})
}
