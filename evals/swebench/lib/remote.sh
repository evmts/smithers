#!/bin/bash
# Benchmarks and real Docker checks run only on an operator-selected remote host.
swb_remote_required() {
  if [ "${BENCH_REMOTE_HOST:-}" != 1 ]; then
    echo 'SWEbench: run on the authorized remote host with BENCH_REMOTE_HOST=1; this Mac is excluded.' >&2
    return 2
  fi
  if [ -z "${SWB_ARTIFACT_ROOT:-}" ] || [ ! -d "$SWB_ARTIFACT_ROOT" ]; then
    echo 'SWEbench: set SWB_ARTIFACT_ROOT to an existing remote jobs directory.' >&2
    return 2
  fi
  case "$SWB_ARTIFACT_ROOT" in
    /*) ;;
    *) echo 'SWEbench: SWB_ARTIFACT_ROOT must be absolute.' >&2; return 2 ;;
  esac
}
