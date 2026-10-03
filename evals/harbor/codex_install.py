"""Stage a pinned Linux Codex on the host; installation never opens task egress."""
from __future__ import annotations

import base64
import hashlib
import json
import shutil
import tarfile
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

VERSION = "0.160.0"
MAX_ARCHIVE_BYTES = 150 * 1024 * 1024
MAX_BINARY_BYTES = 512 * 1024 * 1024


def _registry_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == "registry.npmjs.org"
            and not parsed.fragment)


def stage(directory: Path, architecture: str) -> dict[str, str]:
    """Fetch the official platform package, verify npm integrity, extract only binaries.

    Archive paths and symlinks are never extracted into the filesystem. The
    downloaded archive and binaries live in the caller's temporary directory.
    """
    target = {"x86_64": "x64", "aarch64": "arm64"}.get(architecture)
    if target is None:
        raise ValueError(f"unsupported Codex guest architecture: {architecture!r}")
    url = f"https://registry.npmjs.org/@openai%2Fcodex/{VERSION}-linux-{target}"
    with urllib.request.urlopen(url, timeout=60) as response:
        if not _registry_url(response.geturl()):
            raise ValueError("Codex registry manifest redirected outside its registry")
        manifest = json.load(response)
    if manifest.get("name") != "@openai/codex" or manifest.get("version") != f"{VERSION}-linux-{target}":
        raise ValueError("Codex registry package identity mismatch")
    dist = manifest["dist"]
    archive_url = dist["tarball"]
    integrity = dist["integrity"]
    if not _registry_url(archive_url) or not archive_url.startswith("https://registry.npmjs.org/@openai/codex/-/") or not integrity.startswith("sha512-"):
        raise ValueError("Codex registry artifact lacks a trusted URL or SHA-512 integrity")
    archive = directory / "codex.tgz"
    digest = hashlib.sha512()
    size = 0
    with urllib.request.urlopen(archive_url, timeout=120) as response, archive.open("wb") as output:
        if not _registry_url(response.geturl()):
            raise ValueError("Codex registry artifact redirected outside its registry")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_ARCHIVE_BYTES:
                raise ValueError("Codex archive exceeds the host staging limit")
            digest.update(chunk)
            output.write(chunk)
    if base64.b64encode(digest.digest()).decode() != integrity.removeprefix("sha512-"):
        raise ValueError("Codex archive integrity mismatch")
    binaries = {}
    with tarfile.open(archive, "r:gz") as package:
        for name, suffix in (("codex", "/codex/codex"), ("rg", "/path/rg")):
            members = [member for member in package.getmembers() if member.name.endswith(suffix)]
            if len(members) != 1 or not members[0].isfile() or members[0].size > MAX_BINARY_BYTES:
                raise ValueError(f"Codex archive lacks exactly one regular {name} binary")
            destination = directory / name
            with package.extractfile(members[0]) as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)
            destination.chmod(0o700)
            binaries[name] = str(destination)
    archive.unlink()
    return {**binaries, "version": VERSION, "integrity": integrity, "package": url}
