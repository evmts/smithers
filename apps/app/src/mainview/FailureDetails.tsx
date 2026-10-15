/** A raw diagnostic stays behind one keyboard-operable disclosure. */
export function FailureDetails({ detail }: { readonly detail: string }) {
  return detail.trim() === "" ? null :
    <details><summary>Details</summary><pre className="failure-detail" tabIndex={0} role="region" aria-label="Failure details">{detail}</pre></details>
}

