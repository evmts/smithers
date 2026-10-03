#!/usr/bin/env python3
"""Lease the shared benchmark account wheel without a host-home fallback."""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "harbor"))
from accounts import Pool, NoSeatLeft  # noqa: E402

BENCHMARK_ACCOUNTS = ("codex-1", "codex-3", "codex-acct-1")


def select(trial: str, check: bool = False) -> tuple[str, str]:
    environ = dict(os.environ)
    if not environ.get("SMITHERS_CODEX_ACCOUNTS_DIR"):
        raise ValueError("set SMITHERS_CODEX_ACCOUNTS_DIR to the remote benchmark accounts directory")
    environ.setdefault("SMITHERS_CODEX_POOL", ",".join(BENCHMARK_ACCOUNTS))
    labels = environ["SMITHERS_CODEX_POOL"].split(",")
    if not labels or any(label.strip() not in BENCHMARK_ACCOUNTS for label in labels):
        raise ValueError("SMITHERS_CODEX_POOL must contain only benchmark accounts: " + ",".join(BENCHMARK_ACCOUNTS))
    pool = Pool.from_environment(environ)
    if check:
        # Batch drivers check availability without spending a per-instance lease.
        disabled = pool.disabled()
        def healthy(label: str) -> bool:
            if label not in disabled:
                return True
            reset = disabled[label].get("resetAt")
            try:
                return bool(reset) and datetime.fromisoformat(reset).timestamp() <= time.time()
            except (ValueError, TypeError):
                return False
        available = [a for a in pool.accounts if healthy(a.label)]
        if not available:
            raise NoSeatLeft("no benchmark account available for preflight")
        account = available[0]
    else:
        account = pool.lease(trial)
    home = str(account.home)
    if account.label not in BENCHMARK_ACCOUNTS or "\n" in home:
        raise ValueError("invalid benchmark account returned by pool")
    return home, account.label


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--trial", default="")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        print("\n".join(select(args.trial, args.check)))
    except (ValueError, NoSeatLeft) as error:
        sys.stderr.write(f"codex account: {error}\n")
        sys.exit(1)
