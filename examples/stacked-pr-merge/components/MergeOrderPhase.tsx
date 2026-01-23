/**
 * MergeOrderPhase - Phase 2: Determine optimal merge order
 */

import type { ReactNode } from "react";
import { Step } from "../../../src/components/Step.js";
import { Claude } from "../../../src/components/Claude.js";
import type { MergeCandidate } from "../types.js";

export interface MergeOrderPhaseProps {
  candidates: MergeCandidate[];
  onOrderDetermined?: (order: MergeCandidate[]) => void;
}

export function MergeOrderPhase({
  candidates,
  onOrderDetermined,
}: MergeOrderPhaseProps): ReactNode {
  if (candidates.length === 0) {
    return (
      <phase-content>
        <status>No merge candidates - skipping order determination</status>
      </phase-content>
    );
  }

  return (
    <phase-content>
      <summary>Determining merge order for {candidates.length} PRs</summary>

      <merge-order>
        {candidates.map((c, i) => (
          <position
            key={c.worktree.name}
            order={i + 1}
            name={c.worktree.name}
            pr={c.pr.number}
            size={c.pr.additions + c.pr.deletions}
            files={c.pr.changedFiles}
          />
        ))}
      </merge-order>

      <Step name="validate-order">
        <Claude model="sonnet">
          I'm about to merge these PRs in the following order:
          {candidates
            .map(
              (c, i) =>
                `${i + 1}. PR #${c.pr.number} - ${c.pr.title} (+${c.pr.additions}/-${c.pr.deletions}, ${c.pr.changedFiles} files)`,
            )
            .join("\n")}
          Analyze if this order makes sense: 1. Are there any obvious
          dependencies where one PR should come before another? 2. Are there any
          PRs that touch the same files and might conflict? 3. Should any PRs be
          merged together or split? If the order looks good, respond with
          "ORDER_APPROVED". If changes are needed, explain the recommended
          order.
        </Claude>
      </Step>
    </phase-content>
  );
}
