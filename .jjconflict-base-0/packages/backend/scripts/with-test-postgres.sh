#!/usr/bin/env bash
# with-test-postgres.sh: run one command against a throwaway PostgreSQL.
#
#   bash packages/backend/scripts/with-test-postgres.sh <command...>
#
# The landing gate strips every database credential from its environment
# (.smithers/flows/land/engineering-gate-environment.mjs), so a raw `go test`
# there silently skips every PostgreSQL test. This script starts a private
# server for the one command: initdb into a fresh temporary directory with
# trust authentication, listening only on 127.0.0.1 at a free port with no
# Unix socket. It exports SMITHERS_TEST_DATABASE_URL and
# SMITHERS_REQUIRE_DATABASE_TESTS=1, so a database test that cannot reach the
# server fails instead of skipping. It stops the server and removes the
# directory on every exit, and exits with the command's status.
#
# PostgreSQL's programs come from PG_BIN, else pg_ctl on PATH, else the usual
# Homebrew and Debian locations. If none starts, the script fails loudly
# before running the command.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: with-test-postgres.sh <command...>" >&2
  exit 2
fi

postgres_bin() {
  if [ -n "${PG_BIN:-}" ]; then
    printf '%s\n' "$PG_BIN"
    return
  fi
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  local candidate
  for candidate in /opt/homebrew/opt/postgresql@18/bin /opt/homebrew/bin /usr/lib/postgresql/18/bin /usr/local/bin; do
    if [ -x "$candidate/pg_ctl" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' "PATH"
}

free_port() {
  if command -v node >/dev/null 2>&1; then
    node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
  else
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
  fi
}

bin=$(postgres_bin)
for tool in initdb pg_ctl; do
  if [ ! -x "$bin/$tool" ]; then
    echo "with-test-postgres: no PostgreSQL $tool at $bin (set PG_BIN to PostgreSQL's bin directory)" >&2
    exit 69
  fi
done

dir=$(mktemp -d "${TMPDIR:-/tmp}/with-test-postgres.XXXXXX")
data="$dir/data"
cleanup() {
  local status=$?
  if [ -f "$data/postmaster.pid" ]; then
    "$bin/pg_ctl" -D "$data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$dir"
  exit "$status"
}
trap cleanup EXIT

if ! "$bin/initdb" -D "$data" -U postgres --auth=trust --no-sync >"$dir/initdb.log" 2>&1; then
  echo "with-test-postgres: initdb failed:" >&2
  tail -n 40 "$dir/initdb.log" >&2 || true
  exit 70
fi

port=$(free_port)
if ! "$bin/pg_ctl" -D "$data" -l "$dir/postgres.log" -w -t 60 \
  -o "-p $port -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c fsync=off -c dynamic_shared_memory_type=mmap -c max_connections=200" \
  start >"$dir/pg_ctl.log" 2>&1; then
  echo "with-test-postgres: postgres did not start on 127.0.0.1:$port:" >&2
  tail -n 20 "$dir/pg_ctl.log" >&2 2>/dev/null || true
  tail -n 40 "$dir/postgres.log" >&2 2>/dev/null || true
  exit 70
fi

export SMITHERS_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$port/postgres?sslmode=disable"
export SMITHERS_REQUIRE_DATABASE_TESTS=1
"$@"
