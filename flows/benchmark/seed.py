#!/usr/bin/env python3
"""Seed scoped, expiring Cloud credentials without putting values in argv or output."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ACCOUNTS = ("codex-1", "codex-3", "codex-acct-1")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="smithers-canary/bench")
    parser.add_argument("--cli", default="smthrs")
    parser.add_argument("--ttl", default="3h")
    parser.add_argument("--models", action="store_true", help="Seed auth bundles after a local refresh and cool the accounts")
    parser.add_argument("--cool-minutes", type=int, default=180)
    args = parser.parse_args()
    if not os.environ.get("SMITHERS_TOKEN"):
        parser.error("Set SMITHERS_TOKEN in the environment")
    if args.cool_minutes <= 0:
        parser.error("cool-minutes must be positive")

    def cli(argv, value=None):
        process = subprocess.run([args.cli, *argv, "--format", "json"], input=value,
                                 text=True, capture_output=True)
        if process.returncode:
            # Secret-bearing stdin and the mint receipt never enter diagnostics.
            raise RuntimeError(f"CLI operation failed: {argv[0]} {argv[1]}, exit {process.returncode}")
        return json.loads(process.stdout)

    bundles = {}
    if args.models:
        for label in ACCOUNTS:
            bundles[label] = json.loads((Path.home() / ".smithers/accounts" / label / "auth.json").read_text())
            if not bundles[label].get("tokens", {}).get("access_token"):
                raise RuntimeError(f"Refresh {label} locally before seeding")
        # Cool before copying: a locally refreshed copy invalidates the Cloud refresh token.
        for label in ACCOUNTS:
            process = subprocess.run(["codex-rr", "cool", label, str(args.cool_minutes)], capture_output=True)
            if process.returncode:
                raise RuntimeError(f"Could not cool {label}; no bundles were seeded")

    receipt = cli(["token", "mint", "--cloud", "--ttl", args.ttl,
                   "--scope", "write:repository", "--scope", "write:workspace"])
    for name, value in [("BENCHMARK_SMITHERS_TOKEN", receipt["token"]),
                        ("BENCHMARK_TOKEN_EXPIRES_AT", receipt["expiresAt"]),
                        *([("BENCHMARK_CODEX_AUTH_BUNDLES", json.dumps(bundles))] if args.models else [])]:
        cli(["secret", "set", name, "-R", args.repo, "--body-stdin", "--main-only"], value)
    print(json.dumps({"repo": args.repo, "expiresAt": receipt["expiresAt"],
                      "accounts": list(bundles), "tokenId": receipt.get("id")}))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, OSError, RuntimeError):
        print("Credential seeding failed; inspect the operation without displaying secret values.", file=sys.stderr)
        sys.exit(1)
