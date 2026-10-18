package reposites

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/url"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/smithersai/smithers/packages/backend/blobs"
	"golang.org/x/net/publicsuffix"
)

const MaxPublishBytes = 16 << 20
const MaxFiles = 512

type Refusal struct {
	Code   string
	Status int
}

func (e *Refusal) Error() string           { return e.Code }
func refuse(code string, status int) error { return &Refusal{code, status} }

type Config struct {
	ReservedHosts    []string
	Enabled          bool
	Suffix           string
	FirstPartyOrgIDs []string
	CNAME            string
}
type Repository struct {
	ID             int64
	Owner          string
	Name           string
	OrganizationID int64
}
type File struct {
	Key         string `json:"key"`
	SHA256      string `json:"sha256"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}
type Version struct {
	ID    string          `json:"id"`
	Files map[string]File `json:"files"`
}
type Site struct {
	URL             string     `json:"url,omitempty"`
	ScopeGeneration string     `json:"-"`
	Repository      Repository `json:"repository"`
	Enabled         bool       `json:"enabled"`
	Name            string     `json:"name,omitempty"`
	AppPrefix       string     `json:"appPrefix"`
	Active          string     `json:"active,omitempty"`
	Versions        []string   `json:"versions"`
	Domains         []string   `json:"domains"`
}
type DNSRecord struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
}
type Certificate struct {
	ID        string      `json:"id"`
	Status    string      `json:"status"`
	SSLStatus string      `json:"sslStatus"`
	Records   []DNSRecord `json:"records"`
}
type Host struct {
	Checking     bool        `json:"checking"`
	Generation   int64       `json:"generation"`
	LeaseUntil   time.Time   `json:"leaseUntil"`
	Hostname     string      `json:"hostname"`
	RepositoryID int64       `json:"repositoryId"`
	FirstParty   bool        `json:"firstParty"`
	Removed      bool        `json:"removed"`
	Token        string      `json:"token,omitempty"`
	Verified     bool        `json:"verified"`
	Bound        bool        `json:"bound"`
	Certificate  Certificate `json:"certificate"`
	CheckedAt    time.Time   `json:"checkedAt"`
	Error        string      `json:"error,omitempty"`
	Records      []DNSRecord `json:"records"`
}
type Upload struct {
	Path string `json:"path"`
	Data []byte `json:"data"`
}
type Command struct {
	Action    string   `json:"action"`
	Name      string   `json:"name,omitempty"`
	AppPrefix string   `json:"appPrefix,omitempty"`
	Expected  string   `json:"expected,omitempty"`
	Version   string   `json:"version,omitempty"`
	Domain    string   `json:"domain,omitempty"`
	Files     []Upload `json:"files,omitempty"`
}

// Certificates owns only vendor I/O. Status is not authority to bind a Host:
// the service independently verifies the current product DNS ownership nonce.
type Certificates interface {
	Ensure(context.Context, string) (Certificate, error)
	Get(context.Context, string) (Certificate, error)
	Delete(context.Context, string) error
}
type DNSAddresses interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}
type DNS interface {
	LookupTXT(context.Context, string) ([]string, error)
	LookupCNAME(context.Context, string) (string, error)
}
type Service struct {
	Repository   func(context.Context, int64) (Repository, error)
	Config       Config
	Store        Store
	Blobs        blobs.Store
	Certificates Certificates
	DNS          DNS
	Now          func() time.Time
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now().UTC()
}
func siteKey(id int64) string              { return "repo/" + strconv.FormatInt(id, 10) }
func hostKey(host string) string           { return "host/" + host }
func versionKey(id int64, v string) string { return "version/" + strconv.FormatInt(id, 10) + "/" + v }
func decode[T any](data []byte) (v T, err error) {
	if len(data) == 0 {
		return v, nil
	}
	err = json.Unmarshal(data, &v)
	return
}
func encode(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
func (s *Service) enabled() error {
	if !s.Config.Enabled || s.Store == nil || s.Blobs == nil {
		return refuse("site_unavailable", 503)
	}
	return nil
}

// Available reports site_unavailable (503) while sites are off, so a caller can
// refuse before it looks at the request.
func (s *Service) Available() error { return s.enabled() }
func (s *Service) Site(ctx context.Context, id int64) (Site, error) {
	b, e := s.Store.Read(ctx, siteKey(id))
	if e != nil {
		return Site{}, e
	}
	v, e := decode[Site](b)
	if e == nil && v.Repository.ID == 0 {
		e = refuse("site_not_enabled", 404)
	}
	return v, e
}

func validLabel(v string) bool {
	if len(v) == 0 || len(v) > 63 || v[0] == '-' || v[len(v)-1] == '-' {
		return false
	}
	for _, c := range v {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}
func NormalizeHost(raw string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(raw))
	if len(v) > 253 || net.ParseIP(v) != nil || strings.ContainsAny(v, ":/@\\?#%\x00") || strings.HasSuffix(v, ".") {
		return "", refuse("invalid_domain", 400)
	}
	labels := strings.Split(v, ".")
	if len(labels) < 2 {
		return "", refuse("invalid_domain", 400)
	}
	for _, l := range labels {
		if !validLabel(l) {
			return "", refuse("invalid_domain", 400)
		}
	}
	suffix, _ := publicsuffix.PublicSuffix(v)
	if suffix == v {
		return "", refuse("invalid_domain", 400)
	}
	return v, nil
}
func safePath(v string) bool {
	return strings.HasPrefix(v, "/") && !strings.HasPrefix(v, "//") && utf8.ValidString(v) && !strings.ContainsAny(v, "\\\x00\r\n") && path.Clean(v) == strings.TrimSuffix(v, "/") || v == "/"
}
func reservedPath(v, prefix string) bool {
	return v == "/api" || strings.HasPrefix(v, "/api/") || v == "/__smithers" || strings.HasPrefix(v, "/__smithers/") || (prefix != "" && (v == strings.TrimSuffix(prefix, "/") || strings.HasPrefix(v, prefix)))
}
func normalizePrefix(v string) (string, error) {
	if v == "" {
		return "", nil
	}
	if !strings.HasSuffix(v, "/") {
		v += "/"
	}
	if !safePath(v) || v == "/" || reservedPath(strings.TrimSuffix(v, "/"), "") {
		return "", refuse("invalid_app_prefix", 400)
	}
	return v, nil
}
func (s *Service) firstParty(repo Repository) bool {
	// Only the operator can pin these immutable database identities. Local names
	// may be created, renamed or reclaimed and never grant this authority.
	return repo.OrganizationID > 0 && slices.Contains(s.Config.FirstPartyOrgIDs, strconv.FormatInt(repo.OrganizationID, 10))
}
func (s *Service) reservedHost(host string) bool {
	return host == "smithers.sh" || strings.HasSuffix(host, ".smithers.sh") || host == s.Config.Suffix || strings.HasSuffix(host, "."+s.Config.Suffix) || slices.ContainsFunc(s.Config.ReservedHosts, func(v string) bool { return strings.EqualFold(host, v) })
}

// Execute is the single owner action seam used by HTTP, app flows and CLI.
// Authorization belongs to the repository route before this method, never to
// a domain name or a publication manifest supplied by the caller.
func (s *Service) Execute(ctx context.Context, repo Repository, c Command) (any, error) {
	if e := s.enabled(); e != nil {
		return nil, e
	}
	if repo.ID <= 0 {
		return nil, refuse("repository_required", 400)
	}
	switch c.Action {
	case "enable":
		return s.enable(ctx, repo, c)
	case "publish":
		return s.publish(ctx, repo, c)
	case "activate":
		return s.activate(ctx, repo, c)
	case "domain.add":
		return s.addDomain(ctx, repo, c.Domain)
	case "domain.verify":
		return s.reconcile(ctx, repo.ID, c.Domain)
	case "domain.remove":
		return s.removeDomain(ctx, repo.ID, c.Domain)
	case "status":
		site, e := s.Site(ctx, repo.ID)
		if e != nil {
			return nil, e
		}
		hosts := []Host{}
		for _, name := range site.Domains {
			b, e := s.Store.Read(ctx, hostKey(name))
			if e != nil {
				return nil, e
			}
			h, e := decode[Host](b)
			if e != nil {
				return nil, e
			}
			if !h.Removed {
				hosts = append(hosts, h)
			}
		}
		return struct {
			Site  Site   `json:"site"`
			Hosts []Host `json:"hosts"`
		}{site, hosts}, nil
	default:
		return nil, refuse("unknown_site_action", 400)
	}
}
func (s *Service) enable(ctx context.Context, repo Repository, c Command) (Site, error) {
	prefix, e := normalizePrefix(c.AppPrefix)
	if e != nil {
		return Site{}, e
	}
	name := strings.ToLower(c.Name)
	if name == "" && s.firstParty(repo) {
		name = strings.ToLower(repo.Name)
	}
	if name != "" && (!s.firstParty(repo) || !validLabel(name) || ReservedName(name)) {
		return Site{}, refuse("site_name_unavailable", 409)
	}
	key := siteKey(repo.ID)
	keys := []string{key}
	host := ""
	if name != "" {
		host = name + "." + s.Config.Suffix
		keys = append(keys, hostKey(host))
	}
	var out Site
	e = s.Store.Change(ctx, keys, func(values map[string]json.RawMessage) error {
		site, e := decode[Site](values[key])
		if e != nil {
			return e
		}
		if site.Repository.ID != 0 {
			if site.Name != name || site.AppPrefix != prefix {
				return refuse("site_already_enabled", 409)
			}
			out = site
			return nil
		}
		if host != "" {
			h, e := decode[Host](values[hostKey(host)])
			if e != nil {
				return e
			}
			if h.RepositoryID != 0 && h.RepositoryID != repo.ID {
				return refuse("site_name_unavailable", 409)
			}
			values[hostKey(host)] = encode(Host{Hostname: host, RepositoryID: repo.ID, FirstParty: true, Verified: true, Bound: true, CheckedAt: s.now()})
		}
		out = Site{URL: func() string {
			if host != "" {
				return "https://" + host
			}
			return ""
		}(), Repository: repo, Enabled: true, Name: name, AppPrefix: prefix, Versions: []string{}, Domains: []string{}}
		values[key] = encode(out)
		return nil
	})
	return out, e
}
func (s *Service) publish(ctx context.Context, repo Repository, c Command) (Site, error) {
	site, e := s.Site(ctx, repo.ID)
	if e != nil {
		return Site{}, e
	}
	if len(c.Files) == 0 || len(c.Files) > MaxFiles {
		return Site{}, refuse("invalid_publication", 400)
	}
	manifest := Version{Files: map[string]File{}}
	total := 0
	for _, f := range c.Files {
		p := "/" + strings.TrimPrefix(f.Path, "/")
		if len(p) > 8192 || !safePath(p) || strings.HasSuffix(p, "/") || reservedPath(p, site.AppPrefix) {
			return Site{}, refuse("invalid_publication_path", 400)
		}
		if _, ok := manifest.Files[p]; ok {
			return Site{}, refuse("duplicate_publication_path", 400)
		}
		total += len(f.Data)
		if total > MaxPublishBytes {
			return Site{}, refuse("publication_too_large", 413)
		}
		hash := sha256.Sum256(f.Data)
		digest := hex.EncodeToString(hash[:])
		key := "sites/" + strconv.FormatInt(repo.ID, 10) + "/sha256/" + digest
		kind := mime.TypeByExtension(path.Ext(p))
		if kind == "" {
			kind = "application/octet-stream"
		}
		if path.Ext(p) == ".md" {
			kind = "text/markdown; charset=utf-8"
		}
		// A digest key never receives different bytes; verify even an existing blob
		// before advertising it in a manifest. No client gets a mutable upload URL.
		exists, e := s.Blobs.Exists(ctx, key)
		if e != nil {
			return Site{}, e
		}
		if !exists {
			putter, ok := s.Blobs.(blobs.Putter)
			if !ok {
				return Site{}, refuse("site_storage_unavailable", 503)
			}
			if e = putter.Put(ctx, key, kind, bytes.NewReader(f.Data)); e != nil {
				return Site{}, e
			}
		}
		reader, e := s.Blobs.NewReader(ctx, key)
		if e != nil {
			return Site{}, e
		}
		h := sha256.New()
		n, e := io.Copy(h, io.LimitReader(reader, int64(len(f.Data))+1))
		closeErr := reader.Close()
		if e != nil {
			return Site{}, e
		}
		if closeErr != nil {
			return Site{}, closeErr
		}
		if n != int64(len(f.Data)) || hex.EncodeToString(h.Sum(nil)) != digest {
			return Site{}, refuse("publication_integrity", 409)
		}
		manifest.Files[p] = File{Key: key, SHA256: digest, Size: int64(len(f.Data)), ContentType: kind}
	}
	// Index aliases are explicit; Markdown and every other file retain their
	// exact own URL. A supplied path can never silently overwrite an alias.
	for p, f := range manifest.Files {
		if path.Base(p) == "index.html" {
			alias := strings.TrimSuffix(p, "index.html")
			if _, ok := manifest.Files[alias]; ok {
				return Site{}, refuse("duplicate_publication_path", 400)
			}
			manifest.Files[alias] = f
		}
	}
	data := encode(manifest.Files)
	hash := sha256.Sum256(data)
	manifest.ID = hex.EncodeToString(hash[:])
	vk := versionKey(repo.ID, manifest.ID)
	sk := siteKey(repo.ID)
	var out Site
	e = s.Store.Change(ctx, []string{sk, vk}, func(values map[string]json.RawMessage) error {
		current, e := decode[Site](values[sk])
		if e != nil {
			return e
		}
		if current.Enabled && current.Active == manifest.ID {
			out = current
			return nil
		}
		if !current.Enabled || current.Active != c.Expected {
			return refuse("publication_stale", 409)
		}
		if len(values[vk]) != 0 && !bytes.Equal(values[vk], encode(manifest)) {
			return refuse("publication_integrity", 409)
		}
		values[vk] = encode(manifest)
		if !slices.Contains(current.Versions, manifest.ID) {
			current.Versions = append(current.Versions, manifest.ID)
		}
		current.Active = manifest.ID
		out = current
		values[sk] = encode(current)
		return nil
	})
	return out, e
}
func (s *Service) activate(ctx context.Context, repo Repository, c Command) (Site, error) {
	sk, vk := siteKey(repo.ID), versionKey(repo.ID, c.Version)
	var out Site
	e := s.Store.Change(ctx, []string{sk, vk}, func(v map[string]json.RawMessage) error {
		current, e := decode[Site](v[sk])
		if e != nil {
			return e
		}
		if current.Enabled && current.Active == c.Version {
			out = current
			return nil
		}
		if !current.Enabled || current.Active != c.Expected {
			return refuse("publication_stale", 409)
		}
		if !slices.Contains(current.Versions, c.Version) || len(v[vk]) == 0 {
			return refuse("publication_not_found", 404)
		}
		current.Active = c.Version
		v[sk] = encode(current)
		out = current
		return nil
	})
	return out, e
}

// Resolve is the read-only Host authority seam. It does not accept an upstream
// origin from an owner. Deployment composition chooses the serving cell.
func (s *Service) Resolve(ctx context.Context, raw string) (Site, error) {
	if e := s.enabled(); e != nil {
		return Site{}, e
	}
	host, e := NormalizeHost(raw)
	if e != nil {
		return Site{}, refuse("unknown_site_host", 421)
	}
	b, e := s.Store.Read(ctx, hostKey(host))
	if e != nil {
		return Site{}, e
	}
	h, e := decode[Host](b)
	if e != nil {
		return Site{}, e
	}
	if h.RepositoryID == 0 || h.Removed {
		return Site{}, refuse("unknown_site_host", 421)
	}
	if !h.FirstParty && s.now().Sub(h.CheckedAt) > time.Minute {
		h, e = s.reconcile(ctx, h.RepositoryID, host)
		if e != nil {
			return Site{}, refuse("site_host_unverified", 421)
		}
	}
	if !h.Bound {
		return Site{}, refuse("site_host_unverified", 421)
	}
	site, e := s.Site(ctx, h.RepositoryID)
	if s.Repository == nil {
		return Site{}, refuse("site_authority_unavailable", 503)
	}
	current, lookupErr := s.Repository(ctx, h.RepositoryID)
	if lookupErr != nil || current.ID != h.RepositoryID {
		return Site{}, refuse("unknown_site_host", 421)
	}
	if h.FirstParty && !s.firstParty(current) {
		return Site{}, refuse("site_host_unverified", 421)
	}
	site.Repository = current
	site.ScopeGeneration = h.Token
	if e != nil || !site.Enabled {
		return Site{}, refuse("unknown_site_host", 421)
	}
	return site, nil
}
func (s *Service) Content(ctx context.Context, host, p string) (File, io.ReadCloser, error) {
	site, e := s.Resolve(ctx, host)
	if e != nil {
		return File{}, nil, e
	}
	if !safePath(p) || reservedPath(p, site.AppPrefix) {
		return File{}, nil, refuse("site_file_not_found", 404)
	}
	b, e := s.Store.Read(ctx, versionKey(site.Repository.ID, site.Active))
	if e != nil {
		return File{}, nil, e
	}
	v, e := decode[Version](b)
	if e != nil {
		return File{}, nil, e
	}
	f, ok := v.Files[p]
	if !ok {
		return File{}, nil, refuse("site_file_not_found", 404)
	}
	r, e := s.Blobs.NewReader(ctx, f.Key)
	return f, r, e
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func (s *Service) addDomain(ctx context.Context, repo Repository, raw string) (Host, error) {
	name, e := NormalizeHost(raw)
	if e != nil {
		return Host{}, e
	}
	if s.reservedHost(name) {
		return Host{}, refuse("reserved_domain", 409)
	}
	token, e := randomToken()
	if e != nil {
		return Host{}, e
	}
	sk, hk := siteKey(repo.ID), hostKey(name)
	var out Host
	e = s.Store.Change(ctx, []string{sk, hk}, func(v map[string]json.RawMessage) error {
		site, e := decode[Site](v[sk])
		if e != nil {
			return e
		}
		if !site.Enabled {
			return refuse("site_not_enabled", 409)
		}
		h, e := decode[Host](v[hk])
		if e != nil {
			return e
		}
		if h.Removed && h.Certificate.ID != "" {
			return refuse("domain_cleanup_pending", 409)
		}
		if h.RepositoryID != 0 && !h.Removed {
			if h.RepositoryID != repo.ID {
				return refuse("domain_in_use", 409)
			}
			out = h
			return nil
		}
		out = Host{Hostname: name, RepositoryID: repo.ID, Token: token, Records: []DNSRecord{{"TXT", "_smithers." + name, token}, {"CNAME", name, s.Config.CNAME}}}
		v[hk] = encode(out)
		if !slices.Contains(site.Domains, name) {
			site.Domains = append(site.Domains, name)
		}
		v[sk] = encode(site)
		return nil
	})
	if e != nil {
		return Host{}, e
	}
	return s.reconcile(ctx, repo.ID, name)
}
func (s *Service) reconcile(ctx context.Context, repoID int64, raw string) (Host, error) {
	name, e := NormalizeHost(raw)
	if e != nil {
		return Host{}, e
	}
	key := hostKey(name)
	b, e := s.Store.Read(ctx, key)
	if e != nil {
		return Host{}, e
	}
	h, e := decode[Host](b)
	if e != nil {
		return Host{}, e
	}
	if h.RepositoryID != repoID || h.Removed || h.FirstParty {
		return Host{}, refuse("domain_not_found", 404)
	}
	token := h.Token
	claimed := false
	e = s.Store.Change(ctx, []string{key}, func(v map[string]json.RawMessage) error {
		current, e := decode[Host](v[key])
		if e != nil {
			return e
		}
		if current.Removed || current.RepositoryID != repoID || current.Token != token {
			return refuse("domain_stale", 409)
		}
		h = current
		if current.Checking && s.now().Before(current.LeaseUntil) {
			h.Bound = false
			return nil
		}
		h.Checking = true
		h.Generation++
		h.LeaseUntil = s.now().Add(45 * time.Second)
		claimed = true
		v[key] = encode(h)
		return nil
	})
	if e != nil || !claimed {
		return h, e
	}
	generation := h.Generation
	h.Bound = false
	h.Verified = false
	h.CheckedAt = s.now()
	h.Error = ""
	if s.Certificates == nil || s.DNS == nil {
		h.Error = "domain_provider_unavailable"
	} else {
		cert, e := s.Certificates.Ensure(ctx, name)
		if e != nil {
			h.Error = "domain_provider_unavailable"
		} else {
			h.Certificate = cert
			records, e := s.DNS.LookupTXT(ctx, "_smithers."+name)
			if e == nil && slices.Contains(records, token) {
				h.Verified = true
			}
			target, e := s.DNS.LookupCNAME(ctx, name)
			routed := e == nil && strings.EqualFold(strings.TrimSuffix(target, "."), strings.TrimSuffix(s.Config.CNAME, "."))
			if !routed {
				if addresses, ok := s.DNS.(DNSAddresses); ok {
					actual, aerr := addresses.LookupIPAddr(ctx, name)
					expected, eerr := addresses.LookupIPAddr(ctx, s.Config.CNAME)
					if aerr == nil && eerr == nil {
						for _, a := range actual {
							for _, b := range expected {
								if a.IP.Equal(b.IP) {
									routed = true
								}
							}
						}
					}
				}
			}
			h.Bound = h.Verified && routed && cert.Status == "active" && cert.SSLStatus == "active"
		}
	}
	h.Checking = false
	h.LeaseUntil = time.Time{}
	h.CheckedAt = s.now()
	h.Records = []DNSRecord{{"TXT", "_smithers." + name, h.Token}, {"CNAME", name, s.Config.CNAME}}
	h.Records = append(h.Records, h.Certificate.Records...)
	e = s.Store.Change(ctx, []string{key}, func(v map[string]json.RawMessage) error {
		current, e := decode[Host](v[key])
		if e != nil {
			return e
		}
		if current.Removed || current.Token != token || current.RepositoryID != repoID || current.Generation != generation {
			return refuse("domain_stale", 409)
		}
		v[key] = encode(h)
		return nil
	})
	return h, e
}
func (s *Service) removeDomain(ctx context.Context, repoID int64, raw string) (Host, error) {
	name, e := NormalizeHost(raw)
	if e != nil {
		return Host{}, e
	}
	key := hostKey(name)
	var out Host
	e = s.Store.Change(ctx, []string{key}, func(v map[string]json.RawMessage) error {
		h, e := decode[Host](v[key])
		if e != nil {
			return e
		}
		if h.RepositoryID != repoID || h.FirstParty {
			return refuse("domain_not_found", 404)
		}
		h.Removed = true
		h.Bound = false
		h.Token = ""
		v[key] = encode(h)
		out = h
		return nil
	})
	if e != nil {
		return out, e
	}
	if out.Certificate.ID != "" {
		if s.Certificates == nil {
			return out, refuse("domain_cleanup_pending", 503)
		}
		if e = s.Certificates.Delete(ctx, out.Certificate.ID); e != nil {
			return out, refuse("domain_cleanup_pending", 503)
		}
		e = s.Store.Change(ctx, []string{key}, func(v map[string]json.RawMessage) error {
			h, e := decode[Host](v[key])
			if e != nil {
				return e
			}
			if !h.Removed || h.RepositoryID != repoID || h.Certificate.ID != out.Certificate.ID {
				return refuse("domain_stale", 409)
			}
			h.Certificate = Certificate{}
			h.Records = nil
			out = h
			v[key] = encode(h)
			return nil
		})
		if e != nil {
			return out, e
		}
	}
	return out, nil
}

// ReturnURL accepts only an active site origin and a safe relative path. The
// central identity origin itself is configured separately, never caller-chosen.
func (s *Service) ReturnURL(ctx context.Context, raw string) (*url.URL, error) {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.Fragment != "" || strings.ContainsAny(raw, "\\\r\n") {
		return nil, refuse("invalid_return_url", 400)
	}
	if _, e = s.Resolve(ctx, u.Host); e != nil {
		return nil, refuse("invalid_return_url", 400)
	}
	decoded, e := url.PathUnescape(u.EscapedPath())
	if e != nil || !safePath(decoded) || strings.HasPrefix(decoded, "//") || strings.Contains(strings.ToLower(decoded), "%2f") || strings.Contains(strings.ToLower(decoded), "%5c") {
		return nil, refuse("invalid_return_url", 400)
	}
	return u, nil
}

var _ DNS = net.DefaultResolver
