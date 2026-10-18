/* maya/tinyhttp: the default repo UI's stage-1 dataset (a made-up user's mid-size TypeScript library). */
import type { Dataset } from "../../types"
import repo from "./repo.json"
import people from "./people.json"
import tree from "./tree.json"
import files from "./files.json"
import blame from "./blame.json"
import commits from "./commits.json"
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

export const dataset: Dataset = {
  MOCK_NOW: "2026-10-17T21:00:00Z",
  repo: repo as Dataset["repo"],
  people: people as Dataset["people"],
  tree: tree as Dataset["tree"],
  files: files as Dataset["files"],
  blame: blame as Dataset["blame"],
  commits: commits as Dataset["commits"],
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
}
