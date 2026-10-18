package reposites

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Cloudflare implements the Custom Hostnames API, not Worker routes or DNS
// mutation. The API origin can only be supplied by trusted composition (a
// loopback fake in tests). No response body or credential is included in errors.
type Cloudflare struct {
	ZoneID string
	Token  string
	Origin string
	Client *http.Client
}
type cfHostname struct {
	ID        string     `json:"id"`
	Hostname  string     `json:"hostname"`
	Status    string     `json:"status"`
	Ownership *DNSRecord `json:"ownership_verification"`
	SSL       struct {
		Status     string `json:"status"`
		Validation []struct {
			TXTName     string `json:"txt_name"`
			TXTValue    string `json:"txt_value"`
			CNAME       string `json:"cname"`
			CNAMETarget string `json:"cname_target"`
		} `json:"validation_records"`
	} `json:"ssl"`
}

func (v cfHostname) certificate() Certificate {
	r := Certificate{ID: v.ID, Status: v.Status, SSLStatus: v.SSL.Status, Records: []DNSRecord{}}
	if v.Ownership != nil {
		r.Records = append(r.Records, *v.Ownership)
	}
	for _, v := range v.SSL.Validation {
		if v.TXTName != "" {
			r.Records = append(r.Records, DNSRecord{"TXT", v.TXTName, v.TXTValue})
		}
		if v.CNAME != "" {
			r.Records = append(r.Records, DNSRecord{"CNAME", v.CNAME, v.CNAMETarget})
		}
	}
	return r
}
func (c *Cloudflare) request(ctx context.Context, method, path string, body any, out any) error {
	if c.ZoneID == "" || c.Token == "" {
		return errors.New("domain provider unavailable")
	}
	origin := c.Origin
	if origin == "" {
		origin = "https://api.cloudflare.com/client/v4"
	}
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimSuffix(origin, "/")+"/zones/"+url.PathEscape(c.ZoneID)+"/custom_hostnames"+path, bytes.NewReader(data))
	if err != nil {
		return errors.New("invalid domain provider configuration")
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{}
	if c.Client != nil {
		copy := *c.Client
		client = &copy
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if client.Timeout == 0 {
		client.Timeout = 10 * time.Second
	}
	res, err := client.Do(req)
	if err != nil {
		return errors.New("domain provider unavailable")
	}
	defer res.Body.Close()
	if method == http.MethodDelete && res.StatusCode == http.StatusNotFound {
		return nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return errors.New("domain provider request refused")
	}
	var envelope struct {
		Success bool            `json:"success"`
		Result  json.RawMessage `json:"result"`
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&envelope); err != nil || !envelope.Success {
		return errors.New("invalid domain provider response")
	}
	if out != nil {
		if err = json.Unmarshal(envelope.Result, out); err != nil {
			return errors.New("invalid domain provider result")
		}
	}
	return nil
}

// Ensure first looks up the exact hostname. This recovers an uncertain create
// without issuing a second certificate. The service still requires its own new
// DNS nonce before binding, including when a provider record already exists.
func (c *Cloudflare) Ensure(ctx context.Context, host string) (Certificate, error) {
	var existing []cfHostname
	if e := c.request(ctx, "GET", "?hostname="+url.QueryEscape(host), nil, &existing); e != nil {
		return Certificate{}, e
	}
	for _, v := range existing {
		if v.Hostname == host {
			if v.ID == "" {
				return Certificate{}, errors.New("invalid domain provider identity")
			}
			return v.certificate(), nil
		}
	}
	var v cfHostname
	e := c.request(ctx, "POST", "", map[string]any{"hostname": host, "ssl": map[string]string{"method": "txt", "type": "dv"}}, &v)
	if e == nil && (v.Hostname != host || v.ID == "") {
		e = errors.New("domain provider hostname mismatch")
	}
	return v.certificate(), e
}
func (c *Cloudflare) Get(ctx context.Context, id string) (Certificate, error) {
	var v cfHostname
	e := c.request(ctx, "GET", "/"+url.PathEscape(id), nil, &v)
	if e == nil && v.ID != id {
		e = errors.New("domain provider identity mismatch")
	}
	return v.certificate(), e
}
func (c *Cloudflare) Delete(ctx context.Context, id string) error {
	return c.request(ctx, "DELETE", "/"+url.PathEscape(id), nil, nil)
}
