package ports

import "errors"

// ModelStreamReason is why one branch of a sealed model stream refused, in
// bounded software-chosen words. It classifies a refusal; it never restates
// the error it accompanies, so no prompt, credential, token, header, URL,
// address, provider output or database text can travel on a diagnostic that
// carries only a reason, a stage and a correlation id.
type ModelStreamReason string

const (
	// ReasonOwnerMissing: the stream carried no authenticated owner.
	ReasonOwnerMissing ModelStreamReason = "owner_missing"
	// ReasonRequestInvalid: the request or grant was rejected before any
	// provider work.
	ReasonRequestInvalid ModelStreamReason = "request_invalid"
	// ReasonCredentialMissing: the owner has no usable model credential, or
	// managed credit had no authorized turn to meter.
	ReasonCredentialMissing ModelStreamReason = "credential_missing"
	// ReasonDependencyUnavailable: a deployment dependency the stage needs —
	// a store, a metering read, a sandbox provider — did not answer.
	ReasonDependencyUnavailable ModelStreamReason = "dependency_unavailable"
	// ReasonHostRefused: the launched model host answered, refusing.
	ReasonHostRefused ModelStreamReason = "host_refused"
	// ReasonHostUnreachable: the launched model host was not reached at all.
	ReasonHostUnreachable ModelStreamReason = "host_unreachable"
	// ReasonResponseUnusable: the host's answer could not be read whole.
	ReasonResponseUnusable ModelStreamReason = "response_unusable"
	// ReasonUnclassified is what a diagnostic reports when no branch named
	// itself. It asserts no cause: it says only that nobody mapped this one.
	ReasonUnclassified ModelStreamReason = "unclassified"
)

// ModelStreamRefusal names which branch refused one sealed model stream and
// why. The route publishes a single public code for the whole catch-all, so
// without this the 502 answers for every unmapped cause and names none of
// them; with it the stage and reason say which branch refused, and the
// correlation id joins that record to the adapter's own launch-step lines for
// the same stream (an adapter turn is "model-stream-" + the correlation id).
//
// Stage reuses the ChatStage vocabulary a turn's progress already reports, so
// a refusal and a progress record name the same boundaries.
type ModelStreamRefusal struct {
	Stage       ChatStage
	Reason      ModelStreamReason
	Correlation string
	Err         error
}

func (refusal *ModelStreamRefusal) Error() string {
	if refusal.Err == nil {
		return "model stream refused at " + string(refusal.Stage) + " (" + string(refusal.Reason) + ")"
	}
	return "model stream refused at " + string(refusal.Stage) + " (" + string(refusal.Reason) + "): " + refusal.Err.Error()
}

func (refusal *ModelStreamRefusal) Unwrap() error { return refusal.Err }

// RefuseModelStream labels err with the stage and reason that refused it. The
// branch nearest the refusal owns the answer: a caller that wraps an already
// named error only adds a correlation id the inner branch could not know, and
// never overwrites the inner stage or reason with its own coarser one.
func RefuseModelStream(err error, stage ChatStage, reason ModelStreamReason, correlation string) error {
	if err == nil {
		return nil
	}
	if named, ok := ModelStreamRefusalOf(err); ok {
		if named.Correlation != "" || correlation == "" {
			return err
		}
		// The correlation id goes in a new refusal, not into the one the
		// caller was handed. An adapter may build a single refusal and
		// return it from every stream it refuses — reusing an error value
		// is ordinary Go, and this helper is exported for adapters to call
		// — so writing the id in place would hand the next stream this
		// one's id, and two concurrent streams would race over the field.
		// The named branch keeps its own stage and reason.
		return &ModelStreamRefusal{Stage: named.Stage, Reason: named.Reason, Correlation: correlation, Err: err}
	}
	return &ModelStreamRefusal{Stage: stage, Reason: reason, Correlation: correlation, Err: err}
}

// ModelStreamRefusalOf reports the nearest named branch in err's chain.
func ModelStreamRefusalOf(err error) (*ModelStreamRefusal, bool) {
	var refusal *ModelStreamRefusal
	if errors.As(err, &refusal) && refusal != nil {
		return refusal, true
	}
	return nil, false
}

// ModelStreamDiagnostic is the bounded record of one refusal: the stage, the
// reason and the correlation id, and nothing else. An error no branch named
// reports ReasonUnclassified rather than borrowing another branch's cause.
func ModelStreamDiagnostic(err error) (stage ChatStage, reason ModelStreamReason, correlation string) {
	if refusal, ok := ModelStreamRefusalOf(err); ok {
		reason = refusal.Reason
		if reason == "" {
			reason = ReasonUnclassified
		}
		return refusal.Stage, reason, refusal.Correlation
	}
	return "", ReasonUnclassified, ""
}
