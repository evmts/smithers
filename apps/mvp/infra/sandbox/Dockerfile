# The branch sandbox's image (decision 0013 §9): Debian trixie with git, tmux, bash and CA certificates. It holds no
# credentials: the forge proxy (worker/BranchSandboxes.ts) adds the read token outside the box.
#
# Users: `smithers` checks the branch out; each person's shell runs as their own user, made on first use in the
# `workspace` group (worker/branch/Users.ts), so one person's tmux server is closed to another's shell. The checkout is
# shared through the group: /workspace is group-owned and setgid, every shell's umask is 002, and git trusts the
# checkout whoever owns it. The base is pinned by digest; Alchemy pins the built image by its own digest.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git less tmux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 2000 workspace \
  && useradd --create-home --shell /bin/bash --uid 1000 --gid workspace smithers \
  && install -d -o smithers -g workspace -m 2775 /workspace \
  && git config --system safe.directory '*' \
  && git config --system core.sharedRepository group \
  && echo 'umask 002' >> /etc/bash.bashrc \
  && echo 'umask 002' >> /etc/profile
COPY tmux.conf /etc/tmux.conf
ENV LANG=C.UTF-8 TERM=xterm-256color
USER smithers
WORKDIR /workspace
# The box idles until the host attaches: a shell ignores whatever arguments the runtime appends.
ENTRYPOINT ["/bin/sh", "-c", "exec sleep infinity", "sandbox"]
