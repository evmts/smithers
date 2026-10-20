---
"@smthrs/effect-code-storage": minor
---

Adds what a sandbox needs to clone without a credential in it:

- `CodeStorage` `gitRemote(repo)`: the repository's git remote, `https://<org>.code.storage/<repo>.git`, with a
  five-minute `git:read` token as Basic `t:<token>`.
- `GitRemote.Upstream`: a remote and the credential the host adds to every request it sends there.
- `GitRemote.head` also takes an `Upstream`, and sends its credential.
- `GitRemote.ref(upstream, branch)`: a branch's commit, asked with git protocol v2's `ls-refs` for that one ref,
  failing `ref_not_found` for a branch the remote doesn't have.
- `GitProxy.uploadPack(request, upstream)`: a read-only git smart HTTP proxy. It admits only the ref advertisement and
  `git-upload-pack`, refuses a push and everything else with 403, drops the guest's own headers but git's, and adds the
  upstream's credential. `git_proxy_requests` counts each request by `service` and `outcome`.
