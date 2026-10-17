# Dependency patches

`patchedDependencies` lists every patch in this directory twice:
`package.json#patchedDependencies` is used by Bun and
`pnpm-workspace.yaml#patchedDependencies` is used by pnpm. Keep their exact
package versions and patch paths identical, and regenerate both lockfiles when
a patch changes. Frozen installation must apply the checked-in patch bytes.

## Deployment tools need no patch

The private deployment packages, `@smthrs/build-infra` and
`@smthrs/bug-worker`, pin `alchemy` `2.0.0-beta.82`. It brings
`@alchemy.run/*` `2.0.0-beta.82` and `@distilled.cloud/*` `1.0.0-rc.15`, which
call the stable Effect 4 APIs. The ten patches that adapted `alchemy` and its
Cloudflare runtime `2.0.0-beta.76` and `@distilled.cloud/*` `1.0.0-rc.8` to
Effect `4.0.0-rc.115` are removed.

After an Alchemy upgrade, run the offline stack tests in
`apps/site/scripts/deployment.test.mjs`, the suites of both deployment
packages, and both package managers' frozen installs before deploying with the
new version. These checks import and inspect stacks; they do not deploy
infrastructure. The public `@smthrs/*` tarballs do not depend on the
deployment packages.

## dprint static Linux binary

`dprint@0.57.1.patch` makes the npm `dprint` wrapper run the static musl build
on every Linux host with a musl build, instead of the glibc build. The glibc
build names `/lib64/ld-linux-*.so` as its ELF interpreter, so a NixOS Cloud
guest without a working loader link answered every `dprint check` with
`spawnSync … ENOENT`; the static build needs no interpreter. When the musl
optional package is not installed, the unmodified wrapper downloads it from
the registry through `HTTPS_PROXY` and verifies it against the digest in the
package's `hashes.json`; it fails closed without the network. The patch also
exports `getTarget` so `packages/smithers/build/targets/test/DprintLinuxBinary.test.ts`
can pin the selection. Remove it when upstream dprint prefers an
interpreter-free Linux binary.
