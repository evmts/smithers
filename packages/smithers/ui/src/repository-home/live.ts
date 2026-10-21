/**
 * The rows a home's live blocks draw (`issues`, `stack`, `runs`, `flows`).
 * A declaration names a live block, never its data: the host reads the rows
 * through its own access checks and hands them over here, already shaped.
 */

/** One row of a live block: an issue, a pull request, a TODO, a run. */
export type RepositoryHomeEntry = {
  /** Stable among its list's rows. */
  readonly key: string;
  /** A short handle before the title, such as `#6131` or `T41`. */
  readonly label?: string;
  readonly title: string;
  /** Where the row opens. In the app: a plain click calls `onNavigate`. `http(s)`: a new tab. */
  readonly href: string;
  /** The row's state: a status string as `StatusPill` takes it, and its label. */
  readonly status?: { readonly status: string; readonly label: string };
  /** When it last changed, in ms since the epoch: shown at the row's end as how long ago. */
  readonly at?: number;
};

/** Some of a list's rows, how many it has in all, and where the whole list is. */
export type RepositoryHomeList = {
  readonly entries: ReadonlyArray<RepositoryHomeEntry>;
  readonly total: number;
  readonly href?: string;
};

/** One line saying why a live block has no rows to show, such as `Not synced`. */
export type RepositoryHomeNotice = { readonly notice: string };

/** The `issues` block: triage at a glance, the issues to triage, and the pull requests waiting. */
export type RepositoryHomeIssues = {
  readonly proposed: number;
  readonly accepted: number;
  readonly notAccepted: number;
  /** Open issues with no triage decision. */
  readonly triage: RepositoryHomeList;
  /** Open pull requests. */
  readonly pulls: RepositoryHomeList;
  /** The repository's issues page, which the counts open. */
  readonly href: string;
};

/** The `runs` block: recent runs and how many of them failed. */
export type RepositoryHomeRuns = RepositoryHomeList & { readonly failed: number };

/** One flow the `flows` block offers: its name, a short line, and what `onAsk` gets when it is pressed. */
export type RepositoryHomeFlow = { readonly flow: string; readonly name: string; readonly title: string };

/** Every live block's rows. A live block whose rows are absent here is not drawn. */
export type RepositoryHomeLive = {
  readonly issues?: RepositoryHomeIssues | RepositoryHomeNotice;
  readonly stack?: RepositoryHomeList | RepositoryHomeNotice;
  readonly runs?: RepositoryHomeRuns | RepositoryHomeNotice;
  readonly flows?: ReadonlyArray<RepositoryHomeFlow>;
};

/** Whether a live block's value is a notice rather than its rows. */
export const isNotice = (value: object): value is RepositoryHomeNotice => "notice" in value;
