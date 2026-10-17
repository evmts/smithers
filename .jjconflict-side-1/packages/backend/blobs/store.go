// Package blobs exposes the canonical blob storage contract and integrity policy.
package blobs

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/blob"
	"io"
	"time"
)

// Store is the object storage contract every deployment adapter implements:
// signed upload and download URLs, existence and size checks, reads and deletes.
type Store = blob.Store

// FilesystemConfig configures the durable local blob store.
type FilesystemConfig = blob.FilesystemConfig

// FilesystemStore keeps objects under one local data root. Uploads are
// spooled and fsynced before an atomic publish, so a crash never exposes a
// partial object.
type FilesystemStore = blob.FilesystemStore

// NewFilesystemStore opens a durable filesystem-backed blob store.
func NewFilesystemStore(cfg FilesystemConfig) (*FilesystemStore, error) {
	return blob.NewFilesystemStore(cfg)
}

// ObjectAttrs is an object's size and, when the store computes it, its
// hex SHA-256 digest.
type ObjectAttrs = blob.ObjectAttrs

// SignedUpload is a URL to PUT to plus the headers the signature covers. The
// uploader must send every header verbatim.
type SignedUpload = blob.SignedUpload

// CreateOnlyUploadSigner is a store whose signed uploads fail when the key
// already holds an object, so a stale URL cannot overwrite verified data.
type CreateOnlyUploadSigner = blob.CreateOnlyUploadSigner

// CreateOnlyPromoter is a store that copies a staged object to a destination
// only when the destination does not exist yet.
type CreateOnlyPromoter = blob.CreateOnlyPromoter

// GenerationPurger is a store that removes every live and archived
// generation of one key.
type GenerationPurger = blob.GenerationPurger

// Putter is a store that writes an object server-side from a reader.
type Putter = blob.Putter

// AgentLogStore stores and reads agent session logs.
type AgentLogStore = blob.AgentLogStore

// LegacyFinalKeyPurgeGate reports whether every upload URL issued by a former
// signer has expired, so final keys may be purged.
type LegacyFinalKeyPurgeGate = blob.LegacyFinalKeyPurgeGate

// LegacyFinalKeyPurgeFencedStore wraps a store and refuses to purge legacy
// client-upload keys until its gate opens.
type LegacyFinalKeyPurgeFencedStore = blob.LegacyFinalKeyPurgeFencedStore

// DefaultSignedURLExpiry is the lifetime of a signed URL when none is set.
const DefaultSignedURLExpiry = blob.DefaultSignedURLExpiry

// MaxSignedURLExpiry is the longest signed URL lifetime, seven days.
const MaxSignedURLExpiry = blob.MaxSignedURLExpiry

// PendingUploadPrefix is the key namespace for unverified uploads.
const PendingUploadPrefix = blob.PendingUploadPrefix

// UnknownObjectSize marks an upload whose exact length is not declared.
const UnknownObjectSize = blob.UnknownObjectSize

// MaxAgentSessionLogBytes is the largest stored agent session log, 10 MiB.
const MaxAgentSessionLogBytes = blob.MaxAgentSessionLogBytes

// ErrObjectNotFound reports that no object exists at the key.
var ErrObjectNotFound = blob.ErrObjectNotFound

// ErrObjectAlreadyExists reports that a create-only write found an object at the key.
var ErrObjectAlreadyExists = blob.ErrObjectAlreadyExists

// ErrLegacyFinalKeyPurgeFenced reports a purge refused because legacy upload
// URLs may still be live.
var ErrLegacyFinalKeyPurgeFenced = blob.ErrLegacyFinalKeyPurgeFenced

// PurgeAllGenerations removes every generation of key when store is a
// GenerationPurger, and otherwise deletes key.
func PurgeAllGenerations(ctx context.Context, store Store, key string) error {
	return blob.PurgeAllGenerations(ctx, store, key)
}

// PendingUploadKey returns the staging key for finalKey under namespace:
// "pending/<namespace>/<finalKey>", or "pending/<finalKey>" when namespace is
// empty. Surrounding spaces and slashes are trimmed.
func PendingUploadKey(namespace, finalKey string) string {
	return blob.PendingUploadKey(namespace, finalKey)
}

// AgentLogObjectKey returns the key of an agent session log:
// "agent-logs/<repositoryID>/<sessionID>.json".
func AgentLogObjectKey(repositoryID int64, sessionID string) string {
	return blob.AgentLogObjectKey(repositoryID, sessionID)
}

// NormalizeSignedURLExpiry returns DefaultSignedURLExpiry for a non-positive
// expiry and clamps a longer one to MaxSignedURLExpiry.
func NormalizeSignedURLExpiry(expiry time.Duration) time.Duration {
	return blob.NormalizeSignedURLExpiry(expiry)
}

// ParseSignedURLExpiry parses a Go duration such as "15m". Empty returns
// DefaultSignedURLExpiry; zero, negative or longer than MaxSignedURLExpiry is
// an error.
func ParseSignedURLExpiry(raw string) (time.Duration, error) { return blob.ParseSignedURLExpiry(raw) }

// SignedCreateOnlyUpload signs a create-only upload of exactSizeBytes when
// store is a CreateOnlyUploadSigner, and otherwise a plain signed upload with
// no required headers.
func SignedCreateOnlyUpload(ctx context.Context, store Store, key, contentType string, exactSizeBytes int64, expiry time.Duration) (SignedUpload, error) {
	return blob.SignedCreateOnlyUpload(ctx, store, key, contentType, exactSizeBytes, expiry)
}

// Put writes r to key when store is a Putter, and errors otherwise.
func Put(ctx context.Context, store Store, key, contentType string, r io.Reader) error {
	return blob.Put(ctx, store, key, contentType, r)
}

// NewLegacyFinalKeyPurgeFencedStore wraps store behind gate. It errors when
// store or gate is nil, or when store lacks create-only uploads, promotion or
// generation purges.
func NewLegacyFinalKeyPurgeFencedStore(store Store, gate LegacyFinalKeyPurgeGate) (*LegacyFinalKeyPurgeFencedStore, error) {
	return blob.NewLegacyFinalKeyPurgeFencedStore(store, gate)
}
