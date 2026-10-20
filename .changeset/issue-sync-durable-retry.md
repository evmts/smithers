---
"@smthrs/integrations": patch
---

Remove IssueSync intake's local reaction retry loop. Conflicts now reject after one request with status and Retry-After intact so durable callers own retry scheduling and preserve the provider delivery identity.
