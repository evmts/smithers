/**
 * Snapshot: 4e26f6af; source read from local objects, read-only.
 * Commits, parent SHAs, dates and patches retain the source snapshot; authors use the mock cast.
 * Runs, checks, issues, reviews, branches, approvals and release metadata are synthesized mock data.
 * The 80-commit window retains its one external parent; original clock skew is preserved.
 * Three source commits that quote private paths or a personal domain are left out; omittedCommits.json
 * keeps only their real SHA and parents so history walks through them.
 * There is no root package.json. create-vibelang/package.json supplies the sole observed version.
 * github=null prevents navigation into the private upstream; the Smithers repo is publicly readable.
 * Real backing scripts/instructions stand in for undeclared mock workflow source.
 * Go uses lang=txt because FileBlob has no Go language. All 73 blobs are complete at 4e26f6af.
 * Converter source and golden pairs are read from the same pinned revision.
 * examples/users/src/main.vibe and the refreshed source docs are quoted verbatim.
 * Docs hovers match names to .vibe FileBlob symbols, preferring the closest code context.
 * Evals and their linked runs are illustrative mock results, never compiler execution receipts.
 * Fixture language intelligence is illustrative, not a compiler execution receipt.
 * Blame uses one illustrative last-touch range per file; five sources predate this history window.
 */
import type { Dataset } from "../../types"
import MOCK_NOW from "./MOCK_NOW.json"
import repo from "./repo.json"
import people from "./people.json"
import tree from "./tree.json"
import files from "./files.json"
import blame from "./blame.json"
import commits from "./commits.json"
import omittedCommits from "./omittedCommits.json"
import branches from "./branches.json"
import tags from "./tags.json"
import labels from "./labels.json"
import issues from "./issues.json"
import pulls from "./pulls.json"
import stack from "./stack.json"
import runs from "./runs.json"
import approvals from "./approvals.json"
import flows from "./flows.json"
import agents from "./agents.json"
import wiki from "./wiki.json"
import docs from "./docs.json"
import releases from "./releases.json"
import settings from "./settings.json"
import ask from "./ask.json"
import evals from "./evals.json"

export const dataset: Dataset = {
  MOCK_NOW: MOCK_NOW as Dataset["MOCK_NOW"],
  repo: { ...repo, config: { ...repo.config, evals: { ...repo.config.evals, suites: evals } } } as Dataset["repo"],
  people: people as Dataset["people"],
  tree: tree as Dataset["tree"],
  files: files as Dataset["files"],
  blame: blame as Dataset["blame"],
  commits: commits as Dataset["commits"],
  omittedCommits: omittedCommits as Dataset["omittedCommits"],
  branches: branches as Dataset["branches"],
  tags: tags as Dataset["tags"],
  labels: labels as Dataset["labels"],
  issues: issues as Dataset["issues"],
  pulls: pulls as Dataset["pulls"],
  stack: stack as Dataset["stack"],
  runs: runs as Dataset["runs"],
  approvals: approvals as Dataset["approvals"],
  flows: flows as Dataset["flows"],
  agents: agents as Dataset["agents"],
  wiki: wiki as Dataset["wiki"],
  docs: docs as Dataset["docs"],
  releases: releases as Dataset["releases"],
  settings: settings as Dataset["settings"],
  ask: ask as Dataset["ask"],
  evals: evals as Dataset["evals"]
}
