---
roster: Org/
skills: Org/Skills/
cases: Org/Cases/
policy: Org/Policy/Gates.md
connections: Org/Connections.md
meetings: Org/Meetings.md
owner: owner
assistant: assistant
seats:
  default: openai:gpt-6-sol
  light: openai:gpt-6-luna
judge: none
vm:
  provider: microsandbox
  image: node:24-bookworm
  cpus: 2
  memoryMib: 2048
  maxConcurrentVMs: 2
wiki:
  generatedDir: Org/Runs/
  statusFile: Org/Status.md
  commit: false
  push: false
repositories: []
---

# Example organization

A four-role example used by tests and documentation. A real installation keeps its
own roster, skills, policies and connections in its private repository.
