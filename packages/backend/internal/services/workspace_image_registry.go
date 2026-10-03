package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// WorkspaceImageResolver resolves public OCI manifests without credentials or
// pulling layers. The returned digest is the hash of the admitted manifest.
type WorkspaceImageResolver interface {
	Resolve(context.Context, string) (workspaceapi.WorkspaceImage, error)
}

func WithWorkspaceImageResolver(resolver WorkspaceImageResolver) WorkspaceServiceOption {
	return func(s *WorkspaceService) { s.imageResolver = resolver }
}

type publicWorkspaceImageResolver struct{ client *http.Client }

var imageDigestPattern = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
var imageRepositoryPattern = regexp.MustCompile(`^[a-z0-9]+(?:(?:\.|_{1,2}|-+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:\.|_{1,2}|-+)[a-z0-9]+)*)*$`)
var imageTagPattern = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$`)
var imageAuthParameter = regexp.MustCompile(`([a-z]+)="([^"\r\n]*)"`)

type publicImageReference struct{ host, repository, selector string }

func parsePublicImageReference(ref string) (publicImageReference, error) {
	var out publicImageReference
	if ref == "" || ref != strings.TrimSpace(ref) || len(ref) > 512 || strings.ContainsAny(ref, "\t\r\n ?#\\") || strings.Contains(ref, "://") {
		return out, errors.New("invalid OCI reference")
	}
	name := ref
	if strings.Contains(name, "@") {
		parts := strings.Split(name, "@")
		if len(parts) != 2 || !imageDigestPattern.MatchString(parts[1]) {
			return out, errors.New("invalid OCI digest")
		}
		name, out.selector = parts[0], parts[1]
	}
	lastSlash, lastColon := strings.LastIndex(name, "/"), strings.LastIndex(name, ":")
	if lastColon > lastSlash {
		tag := name[lastColon+1:]
		if !imageTagPattern.MatchString(tag) {
			return out, errors.New("invalid OCI tag")
		}
		if out.selector == "" {
			out.selector = tag
		}
		name = name[:lastColon]
	}
	if out.selector == "" {
		out.selector = "latest"
	}
	out.host = "docker.io"
	parts := strings.SplitN(name, "/", 2)
	if len(parts) == 2 && (strings.ContainsAny(parts[0], ".:") || parts[0] == "localhost") {
		out.host, name = parts[0], parts[1]
	}
	switch out.host {
	case "docker.io", "index.docker.io", "registry-1.docker.io":
		out.host = "registry-1.docker.io"
		if !strings.Contains(name, "/") {
			name = "library/" + name
		}
	case "ghcr.io", "public.ecr.aws":
	default:
		return out, errors.New("image registry must be Docker Hub, ghcr.io or public.ecr.aws")
	}
	if len(name) > 255 || !imageRepositoryPattern.MatchString(name) {
		return out, errors.New("invalid OCI repository")
	}
	out.repository = name
	return out, nil
}

func (r publicWorkspaceImageResolver) Resolve(ctx context.Context, ref string) (workspaceapi.WorkspaceImage, error) {
	parsed, err := parsePublicImageReference(ref)
	if err != nil {
		return workspaceapi.WorkspaceImage{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	client := r.client
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	endpoint := "https://" + parsed.host + "/v2/" + parsed.repository + "/manifests/" + parsed.selector
	manifest := func(token string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		return client.Do(req)
	}
	response, err := manifest("")
	if err != nil {
		return workspaceapi.WorkspaceImage{}, err
	}
	if response.StatusCode == http.StatusUnauthorized {
		challenge := response.Header.Get("WWW-Authenticate")
		response.Body.Close()
		token, err := anonymousImageToken(ctx, client, parsed, challenge)
		if err != nil {
			return workspaceapi.WorkspaceImage{}, err
		}
		response, err = manifest(token)
		if err != nil {
			return workspaceapi.WorkspaceImage{}, err
		}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspaceapi.WorkspaceImage{}, fmt.Errorf("registry refused manifest: HTTP %d", response.StatusCode)
	}
	const maxManifestBytes = 4 << 20
	data, err := io.ReadAll(io.LimitReader(response.Body, maxManifestBytes+1))
	if err != nil {
		return workspaceapi.WorkspaceImage{}, err
	}
	if len(data) == 0 || len(data) > maxManifestBytes {
		return workspaceapi.WorkspaceImage{}, errors.New("registry manifest size is invalid")
	}
	if !validPublicImageManifest(data) {
		return workspaceapi.WorkspaceImage{}, errors.New("registry did not return an OCI or Docker v2 manifest")
	}
	hash := sha256.Sum256(data)
	digest := "sha256:" + hex.EncodeToString(hash[:])
	if header := response.Header.Get("Docker-Content-Digest"); header != "" && header != digest {
		return workspaceapi.WorkspaceImage{}, errors.New("registry manifest digest does not match its content")
	}
	if strings.HasPrefix(parsed.selector, "sha256:") && parsed.selector != digest {
		return workspaceapi.WorkspaceImage{}, errors.New("registry returned a different image digest")
	}
	return workspaceapi.WorkspaceImage{Ref: ref, Digest: digest}, nil
}

// A schema version alone does not identify an image. Check the mandatory
// descriptor shape without fetching config or layers, including manifests
// whose optional top-level mediaType is omitted.
func validPublicImageManifest(data []byte) bool {
	type descriptor struct {
		MediaType string `json:"mediaType"`
		Digest    string `json:"digest"`
		Size      *int64 `json:"size"`
	}
	var body struct {
		SchemaVersion int           `json:"schemaVersion"`
		MediaType     string        `json:"mediaType"`
		Config        *descriptor   `json:"config"`
		Layers        *[]descriptor `json:"layers"`
		Manifests     *[]descriptor `json:"manifests"`
	}
	if json.Unmarshal(data, &body) != nil || body.SchemaVersion != 2 {
		return false
	}
	validDescriptor := func(d descriptor) bool {
		return d.MediaType != "" && d.Size != nil && *d.Size >= 0 && imageDigestPattern.MatchString(d.Digest)
	}
	switch body.MediaType {
	case "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json":
		if body.Config == nil || body.Layers == nil || body.Manifests != nil {
			return false
		}
	case "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json":
		if body.Manifests == nil || body.Config != nil || body.Layers != nil {
			return false
		}
	case "":
		if body.Config == nil && body.Manifests == nil {
			return false
		}
	default:
		return false
	}
	if body.Manifests != nil {
		if body.Config != nil || body.Layers != nil {
			return false
		}
		for _, d := range *body.Manifests {
			if !validDescriptor(d) {
				return false
			}
		}
		return true
	}
	if body.Config == nil || body.Layers == nil || !validDescriptor(*body.Config) {
		return false
	}
	for _, d := range *body.Layers {
		if !validDescriptor(d) {
			return false
		}
	}
	return true
}

func anonymousImageToken(ctx context.Context, client *http.Client, image publicImageReference, challenge string) (string, error) {
	if !strings.HasPrefix(strings.ToLower(challenge), "bearer ") {
		return "", errors.New("registry does not permit anonymous bearer authentication")
	}
	parameters := map[string]string{}
	for _, match := range imageAuthParameter.FindAllStringSubmatch(challenge, -1) {
		parameters[match[1]] = match[2]
	}
	realm, err := url.Parse(parameters["realm"])
	if err != nil || realm.Scheme != "https" || realm.User != nil || realm.Fragment != "" || realm.RawQuery != "" {
		return "", errors.New("registry token endpoint is invalid")
	}
	expected := map[string]string{"registry-1.docker.io": "auth.docker.io", "ghcr.io": "ghcr.io", "public.ecr.aws": "public.ecr.aws"}[image.host]
	trustedPath := realm.Path == "/token"
	if image.host == "public.ecr.aws" {
		trustedPath = realm.Path == "/token/"
	}
	if realm.Host != expected || !trustedPath || realm.RawPath != "" {
		return "", errors.New("registry token endpoint is not trusted")
	}
	query := realm.Query()
	query.Set("service", parameters["service"])
	query.Set("scope", "repository:"+image.repository+":pull")
	if image.host == "public.ecr.aws" {
		query.Set("scope", "aws")
	}
	realm.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, realm.String(), nil)
	if err != nil {
		return "", err
	}
	response, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registry refused anonymous token: HTTP %d", response.StatusCode)
	}
	var body struct {
		Token       string `json:"token"`
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body); err != nil {
		return "", err
	}
	if body.Token == "" {
		body.Token = body.AccessToken
	}
	if body.Token == "" || len(body.Token) > 16384 || strings.ContainsAny(body.Token, "\r\n") {
		return "", errors.New("registry returned an invalid token")
	}
	return body.Token, nil
}
