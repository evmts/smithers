#!/usr/bin/env python3
"""Seed scoped Cloud credentials with an explicit benchmark deadline, without exposing values."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ACCOUNTS = ("codex-1", "codex-3", "codex-acct-1")


def valid_receipt(token, expires_at):
    if not isinstance(token, str) or not token or any(char.isspace() for char in token):
        raise ValueError("A scoped Cloud token is required")
    if not isinstance(expires_at, str) or not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", expires_at):
        raise ValueError("An RFC3339 credential deadline is required")
    expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expiry <= datetime.now(timezone.utc):
        raise ValueError("The credential deadline has passed")
    return {"token": token, "expiresAt": expires_at}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="smithers-canary/bench")
    parser.add_argument("--cli", default="smthrs")
    parser.add_argument("--ttl", help="Minted token lifetime (default: 3h)")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--existing-token", action="store_true", help="Use BENCHMARK_SMITHERS_TOKEN without minting")
    source.add_argument("--token-stdin", action="store_true", help="Read an existing scoped token from stdin without minting")
    deadline = parser.add_mutually_exclusive_group()
    deadline.add_argument("--expires-at", help="Existing token's actual RFC3339 expiry from its creation receipt or token metadata")
    deadline.add_argument("--cutoff", help="Explicit RFC3339 benchmark cutoff; does not expire or revoke the existing token")
    parser.add_argument("--models", action="store_true", help="Seed auth bundles after a local refresh and cool the accounts")
    parser.add_argument("--cool-minutes", type=int, default=180)
    args = parser.parse_args()
    if not os.environ.get("SMITHERS_TOKEN"):
        parser.error("Set SMITHERS_TOKEN in the environment")
    if args.cool_minutes <= 0:
        parser.error("cool-minutes must be positive")
    existing = args.existing_token or args.token_stdin
    if existing and (not (args.expires_at or args.cutoff) or args.ttl):
        parser.error("Existing tokens require --expires-at or --cutoff and cannot use --ttl")
    if not existing and (args.expires_at or args.cutoff):
        parser.error("--expires-at and --cutoff require an existing-token mode")
    # Validate before cooling accounts or writing any repository secret. Expiry
    # is either the actual token grant's expiry or an explicit operator cutoff.
    # Neither changes the underlying token's authority or expiration.
    receipt = None
    if existing:
        token = sys.stdin.read().strip() if args.token_stdin else os.environ.get("BENCHMARK_SMITHERS_TOKEN")
        receipt = valid_receipt(token, args.expires_at or args.cutoff)

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

    if receipt is None:
        receipt = cli(["token", "mint", "--cloud", "--ttl", args.ttl or "3h",
                       "--scope", "write:repository", "--scope", "write:workspace"])
        valid_receipt(receipt["token"], receipt["expiresAt"])
    for name, value in [("BENCHMARK_SMITHERS_TOKEN", receipt["token"]),
                        ("BENCHMARK_TOKEN_EXPIRES_AT", receipt["expiresAt"]),
                        *([("BENCHMARK_CODEX_AUTH_BUNDLES", json.dumps(bundles))] if args.models else [])]:
        # File-flow /invoke excludes main-only secrets. Seed only a dedicated,
        # private benchmark repository, leaving the backend trust policy intact.
        cli(["secret", "set", name, "-R", args.repo, "--body-stdin"], value)
    metadata = {"repo": args.repo, "expiresAt": receipt["expiresAt"],
                "accounts": list(bundles), "tokenId": receipt.get("id")}
    if args.cutoff:
        metadata["expiryKind"] = "operator-cutoff"
    print(json.dumps(metadata))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, OSError, RuntimeError):
        print("Credential seeding failed; inspect the operation without displaying secret values.", file=sys.stderr)
        sys.exit(1)
