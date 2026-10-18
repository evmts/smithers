package reposites

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"time"
)

type transfer struct {
	HostToken    string    `json:"hostToken"`
	Return       string    `json:"return"`
	RepositoryID int64     `json:"repositoryId"`
	StateHash    string    `json:"stateHash"`
	RequestKey   string    `json:"requestKey"`
	ProofHash    string    `json:"proofHash"`
	UserID       int64     `json:"userId"`
	Expires      time.Time `json:"expires"`
	Used         bool      `json:"used"`
}

func tokenHash(v string) string { h := sha256.Sum256([]byte(v)); return hex.EncodeToString(h[:]) }
func validToken(v string) bool {
	if len(v) != 64 {
		return false
	}
	b, e := hex.DecodeString(v)
	return e == nil && len(b) == 32
}

// BeginTransfer persists only a digest of the destination's host-only state.
func (s *Service) BeginTransfer(ctx context.Context, returnTo, state string) (string, error) {
	u, e := s.ReturnURL(ctx, returnTo)
	if e != nil || !validToken(state) {
		return "", refuse("invalid_return_url", 400)
	}
	site, e := s.Resolve(ctx, u.Host)
	if e != nil {
		return "", e
	}
	id, e := randomToken()
	if e != nil {
		return "", e
	}
	key := "transfer/request/" + tokenHash(id)
	record := transfer{Return: u.String(), RepositoryID: site.Repository.ID, StateHash: tokenHash(state), RequestKey: key, Expires: s.now().Add(10 * time.Minute)}
	e = s.Store.Change(ctx, []string{key, hostKey(u.Host)}, func(v map[string]json.RawMessage) error {
		h, e := decode[Host](v[hostKey(u.Host)])
		if e != nil {
			return e
		}
		if h.Removed || !h.Bound || h.RepositoryID != site.Repository.ID {
			return refuse("transfer_audience", 401)
		}
		record.HostToken = h.Token
		if len(v[key]) != 0 {
			return refuse("transfer_conflict", 409)
		}
		v[key] = encode(record)
		return nil
	})
	return id, e
}

// AuthorizeTransfer runs only with the central browser's authenticated user.
// The returned proof is a 60-second, single-use audience-bound credential; the
// long-lived session key is never returned here or put in a URL.
func (s *Service) AuthorizeTransfer(ctx context.Context, request string, userID int64) (*url.URL, error) {
	if !validToken(request) || userID <= 0 {
		return nil, refuse("invalid_transfer", 400)
	}
	key := "transfer/request/" + tokenHash(request)
	b, e := s.Store.Read(ctx, key)
	if e != nil {
		return nil, e
	}
	record, e := decode[transfer](b)
	if e != nil || record.Return == "" {
		return nil, refuse("invalid_transfer", 400)
	}
	target, e := s.ReturnURL(ctx, record.Return)
	if e != nil {
		return nil, e
	}
	proof, e := randomToken()
	if e != nil {
		return nil, e
	}
	pk := "transfer/proof/" + tokenHash(proof)
	e = s.Store.Change(ctx, []string{key, pk, hostKey(target.Host)}, func(v map[string]json.RawMessage) error {
		h, e := decode[Host](v[hostKey(target.Host)])
		if e != nil {
			return e
		}
		if h.Removed || !h.Bound || h.RepositoryID != record.RepositoryID || h.Token != record.HostToken {
			return refuse("transfer_audience", 401)
		}
		current, e := decode[transfer](v[key])
		if e != nil {
			return e
		}
		if current.Used || !s.now().Before(current.Expires) || current.ProofHash != "" || current.Return != record.Return {
			return refuse("transfer_expired", 409)
		}
		current.UserID = userID
		current.ProofHash = tokenHash(proof)
		current.Expires = s.now().Add(time.Minute)
		v[key] = encode(current)
		v[pk] = encode(current)
		return nil
	})
	if e != nil {
		return nil, e
	}
	target.Path = "/api/auth/site/complete"
	target.RawPath = ""
	target.RawQuery = url.Values{"proof": {proof}}.Encode()
	target.Fragment = ""
	return target, nil
}

// ConsumeTransfer atomically fences proof replay and domain removal/rebinding.
// Minting a new session is a separate existing identity port after consumption;
// an uncertain mint cannot authorize a second use of this proof.
type TransferGrant struct {
	UserID       int64
	RepositoryID int64
	Host         string
	BindingToken string
	ReturnPath   string
}

func (s *Service) ConsumeTransfer(ctx context.Context, proof, state, host string) (TransferGrant, error) {
	if !validToken(proof) || !validToken(state) {
		return TransferGrant{}, refuse("invalid_transfer", 401)
	}
	pk := "transfer/proof/" + tokenHash(proof)
	b, e := s.Store.Read(ctx, pk)
	if e != nil {
		return TransferGrant{}, e
	}
	record, e := decode[transfer](b)
	if e != nil || record.RequestKey == "" {
		return TransferGrant{}, refuse("invalid_transfer", 401)
	}
	target, e := s.ReturnURL(ctx, record.Return)
	if e != nil || target.Host != host {
		return TransferGrant{}, refuse("transfer_audience", 401)
	}
	var grant TransferGrant
	e = s.Store.Change(ctx, []string{pk, record.RequestKey, hostKey(host)}, func(v map[string]json.RawMessage) error {
		current, e := decode[transfer](v[pk])
		if e != nil {
			return e
		}
		h, e := decode[Host](v[hostKey(host)])
		if e != nil {
			return e
		}
		if h.Removed || !h.Bound || h.RepositoryID != record.RepositoryID || h.Token != record.HostToken {
			return refuse("transfer_audience", 401)
		}
		if current.Used || current.UserID <= 0 || !s.now().Before(current.Expires) || subtle.ConstantTimeCompare([]byte(current.StateHash), []byte(tokenHash(state))) != 1 {
			return refuse("transfer_expired", 401)
		}
		current.Used = true
		v[pk] = encode(current)
		v[record.RequestKey] = encode(current)
		grant = TransferGrant{UserID: current.UserID, RepositoryID: record.RepositoryID, Host: host, BindingToken: record.HostToken, ReturnPath: target.RequestURI()}
		return nil
	})
	return grant, e
}

// NewTransferState creates the destination-only browser challenge.
func NewTransferState() (string, error) { return randomToken() }

// TransferDestination is public only to the central consent handler. It
// discloses no identity or session and rechecks the current destination binding.
func (s *Service) TransferDestination(ctx context.Context, id string) (*url.URL, error) {
	if !validToken(id) {
		return nil, refuse("invalid_transfer", 400)
	}
	b, e := s.Store.Read(ctx, "transfer/request/"+tokenHash(id))
	if e != nil {
		return nil, e
	}
	record, e := decode[transfer](b)
	if e != nil || record.Return == "" || record.Used || record.ProofHash != "" || !s.now().Before(record.Expires) {
		return nil, refuse("transfer_expired", 409)
	}
	return s.ReturnURL(ctx, record.Return)
}
