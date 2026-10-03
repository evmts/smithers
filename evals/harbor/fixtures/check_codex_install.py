"""Pinned Codex staging and real Pier preparation, no downloads or VM work.

Minimal synthetic npm tarballs exercise real extraction/integrity code. Pier
uses its installed configuration and environment classes; only the host fetch
and remote CLI/upload boundaries are replaced because this is an offline gate.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import os
import sys
import tarfile
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from evals.harbor import codex_install as install
from evals.harbor import plue_env
try:
    from pier.models.task.config import EnvironmentConfig
    from pier.models.trial.paths import TrialPaths
    from pier.models.agent.install import AgentInstallSpec, InstallStep
    from pier.models.agent.network import NetworkAllowlist
    PIER = True
except ImportError:
    PIER = False

URL = "https://registry.npmjs.org/@openai/codex/-/codex-0.160.0-linux-x64.tgz"


class Response(io.BytesIO):
    def __init__(self, content: bytes, url: str):
        super().__init__(content)
        self.url = url
    def geturl(self):
        return self.url


def archive(entries=None) -> bytes:
    content = io.BytesIO()
    if entries is None:
        entries = [("package/vendor/x86_64-unknown-linux-musl/codex/codex", b"native-codex", tarfile.REGTYPE),
                   ("package/vendor/x86_64-unknown-linux-musl/path/rg", b"native-rg", tarfile.REGTYPE)]
    with tarfile.open(fileobj=content, mode="w:gz") as tar:
        for name, data, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            if kind == tarfile.REGTYPE:
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
            else:
                member.linkname = "../../outside"
                tar.addfile(member)
    return content.getvalue()


def manifest(data: bytes) -> dict:
    return {"name": "@openai/codex", "version": "0.160.0-linux-x64", "dist": {
        "tarball": URL, "integrity": "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()}}


def fetcher(data: bytes, metadata: dict | None = None, redirects: dict | None = None):
    metadata = manifest(data) if metadata is None else metadata
    redirects = redirects or {}
    def fetch(url, **kwargs):
        payload = data if url == URL else json.dumps(metadata).encode()
        return Response(payload, redirects.get(url, url))
    return fetch


class StagingTests(unittest.TestCase):
    def test_official_identity_integrity_and_fixed_destination_extraction(self):
        data = archive()  # vendor shape from the platform-specific npm package
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data)) as opened:
                result = install.stage(root, "x86_64")
            self.assertEqual(Path(result["codex"]).read_bytes(), b"native-codex")
            self.assertEqual(Path(result["rg"]).read_bytes(), b"native-rg")
            self.assertEqual(Path(result["codex"]).stat().st_mode & 0o777, 0o700)
            self.assertEqual(result["version"], "0.160.0")
            self.assertEqual(result["integrity"], manifest(data)["dist"]["integrity"])
            self.assertFalse((root / "codex.tgz").exists())
            self.assertEqual({p.name for p in root.iterdir()}, {"codex", "rg"})
            self.assertEqual(opened.call_args_list[0].args[0],
                             "https://registry.npmjs.org/@openai%2Fcodex/0.160.0-linux-x64")

    def test_arm64_pin_and_unsupported_guest_architecture(self):
        data = archive()
        metadata = manifest(data)
        metadata["version"] = "0.160.0-linux-arm64"
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data, metadata)) as opened:
                install.stage(Path(directory), "aarch64")
            self.assertIn("linux-arm64", opened.call_args_list[0].args[0])
            with patch.object(install.urllib.request, "urlopen") as opened:
                for arch in ("arm64", "i386", "", "x86_64; curl attacker"):
                    with self.subTest(arch=arch), self.assertRaises(ValueError):
                        install.stage(Path(directory), arch)
                opened.assert_not_called()

    def test_identity_untrusted_tarball_integrity_and_redirect_refusals(self):
        data = archive()
        bad = []
        for field, value in (("name", "attacker"), ("version", "0.159.0-linux-x64")):
            metadata = manifest(data)
            metadata[field] = value
            bad.append(metadata)
        for field, value in (("tarball", "https://attacker.invalid/codex.tgz"),
                             ("tarball", "https://registry.npmjs.org.evil/@openai/codex/-/x"),
                             ("tarball", URL + "#fragment"), ("integrity", "sha1-abcdef"),
                             ("integrity", "sha512-wrong")):
            metadata = manifest(data)
            metadata["dist"][field] = value
            bad.append(metadata)
        for metadata in bad:
            with self.subTest(metadata=metadata), tempfile.TemporaryDirectory() as directory:
                with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data, metadata)):
                    with self.assertRaises(ValueError):
                        install.stage(Path(directory), "x86_64")
                self.assertFalse((Path(directory) / "codex").exists())
        manifest_url = "https://registry.npmjs.org/@openai%2Fcodex/0.160.0-linux-x64"
        for requested in (URL, manifest_url):
            for target in ("https://evil.invalid/archive", "http://registry.npmjs.org/archive",
                           "https://registry.npmjs.org:444/archive", "https://registry.npmjs.org.evil/archive"):
                with self.subTest(requested=requested, target=target), tempfile.TemporaryDirectory() as directory:
                    with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data, redirects={requested: target})):
                        with self.assertRaises(ValueError):
                            install.stage(Path(directory), "x86_64")
                    self.assertFalse((Path(directory) / "codex").exists())

    def test_safe_extraction_missing_duplicates_links_and_size_limits(self):
        codex = ("package/vendor/triple/codex/codex", b"native", tarfile.REGTYPE)
        rg = ("package/vendor/triple/path/rg", b"rg", tarfile.REGTYPE)
        variants = [[rg], [codex], [codex, codex, rg],
                    [(codex[0], b"", tarfile.SYMTYPE), rg],
                    [(codex[0], b"", tarfile.LNKTYPE), rg]]
        for entries in variants:
            data = archive(entries)
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as directory:
                with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data)):
                    with self.assertRaises(ValueError):
                        install.stage(Path(directory), "x86_64")
                self.assertFalse((Path(directory).parent / "outside").exists())
        # Extra archive files and traversal names never get extracted to paths.
        data = archive([codex, rg, ("../../outside", b"unsafe", tarfile.REGTYPE)])
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data)):
                install.stage(Path(directory), "x86_64")
            self.assertEqual({p.name for p in Path(directory).iterdir()}, {"codex", "rg"})
        for variable, bound in (("MAX_ARCHIVE_BYTES", 1), ("MAX_BINARY_BYTES", 1)):
            with tempfile.TemporaryDirectory() as directory, patch.object(install, variable, bound):
                with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data)):
                    with self.assertRaises(ValueError):
                        install.stage(Path(directory), "x86_64")

    def test_network_error_and_corrupt_archive_propagate(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(install.urllib.request, "urlopen", side_effect=OSError("network unavailable")):
                with self.assertRaises(OSError):
                    install.stage(Path(directory), "x86_64")
            data = b"invalid archive with valid manifest hash"
            with patch.object(install.urllib.request, "urlopen", side_effect=fetcher(data)):
                with self.assertRaises(tarfile.ReadError):
                    install.stage(Path(directory), "x86_64")


@unittest.skipUnless(PIER, "Pier install required for the real environment class")
class PierPreparationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        environment = self.root / "environment"
        environment.mkdir()
        (environment / "Dockerfile").write_text("FROM alpine:3.20\n")
        self.environ = patch.dict(os.environ, {"SMITHERS_CLI": "/usr/bin/true", "PLUE_REPO": "acme/benchmark"})
        self.environ.start()
        self.addCleanup(self.environ.stop)
        cls = plue_env._pier_classes()
        self.spec = AgentInstallSpec(agent_name="codex", version="0.160.0", steps=[InstallStep(user="root", run="true")])
        self.env = cls(environment_dir=environment, environment_name="task", session_id="trial__env",
                       trial_paths=TrialPaths(trial_dir=self.root / "trial"),
                       task_env_config=EnvironmentConfig(allow_internet=False),
                       agent_install_spec=self.spec,
                       network_allowlist=NetworkAllowlist())
        self.commands = []
        self.uploads = []
        self.started = []
        async def start():
            self.started.append(True)
        async def exec(command, **kwargs):
            self.commands.append((command, kwargs))
            if command == "uname -m":
                return "x86_64\n", "", 0
            if "codex --version" in command:
                return "codex-cli 0.160.0\n", "", 0
            return "", "", 0
        async def upload(source, destination):
            self.uploads.append((Path(source).read_bytes(), destination))
        self.env._plue_start = start
        self.env._plue_exec = exec
        self.env._plue_upload = upload
        def stage(directory, arch):
            self.assertEqual(arch, "x86_64")
            codex, rg = directory / "codex", directory / "rg"
            codex.write_bytes(b"native-codex")
            rg.write_bytes(b"native-rg")
            return {"codex": str(codex), "rg": str(rg), "version": "0.160.0",
                    "integrity": "sha512-fixture", "package": URL}
        self.stage = stage

    def test_real_constructor_and_start_install_without_widening_task_egress(self):
        self.assertTrue(self.env.capabilities.preinstall_agents)
        self.assertIsNone(getattr(self.env, "_plue_deferred_error", None))
        before = self.env._plue_network()
        self.assertEqual(before, "proxy")
        self.assertFalse(self.env.capabilities.filtered_egress)
        with patch.object(install, "stage", side_effect=self.stage):
            asyncio.run(self.env.start(False))
        self.assertEqual(self.started, [True])
        self.assertEqual([target for _, target in self.uploads],
                         ["/opt/smithers-codex/bin/codex", "/opt/smithers-codex/bin/rg", "/usr/local/bin/codex"])
        self.assertIn(b'exec /opt/smithers-codex/bin/codex "$@"', self.uploads[-1][0])
        self.assertEqual(self.env._plue_network(), before)
        self.assertTrue(all(kwargs["user"] == "root" for _, kwargs in self.commands))
        self.assertFalse(any("npm" in command or "curl" in command or "apt" in command for command, _ in self.commands))
        self.assertEqual(self.env._plue_agent_install_receipt,
                         {"version": "0.160.0", "integrity": "sha512-fixture", "package": URL})

    def test_no_agent_and_unsupported_specs_never_stage(self):
        self.env.agent_install_spec = None
        with patch.object(install, "stage") as stage:
            asyncio.run(self.env.start(False))
            stage.assert_not_called()
        for name, version in (("claude-code", "0.160.0"), ("codex", "0.155.1"), ("codex", None)):
            self.env.agent_install_spec = AgentInstallSpec(agent_name=name, version=version, steps=[InstallStep(user="root", run="true")])
            with self.subTest(name=name, version=version), patch.object(install, "stage") as stage:
                with self.assertRaises(plue_env.PlueUnplaceable):
                    asyncio.run(self.env.start(False))
                stage.assert_not_called()

    def test_arch_mkdir_verify_and_upload_failures_are_contained(self):
        original = self.env._plue_exec
        for failing_command, stdout, code in (("uname -m", "", 1), ("mkdir", "", 1),
                                               ("codex --version", "codex-cli 0.159.0", 0),
                                               ("codex --version", "codex-cli 0.160.0", 1)):
            async def bad_exec(command, **kwargs):
                if failing_command in command:
                    return stdout, "failed", code
                return await original(command, **kwargs)
            self.env._plue_exec = bad_exec
            with self.subTest(command=failing_command, stdout=stdout, code=code), patch.object(install, "stage", side_effect=self.stage):
                with self.assertRaises(plue_env.PlueError):
                    asyncio.run(self.env.start(False))
            self.assertFalse(hasattr(self.env, "_plue_agent_install_receipt"))
        self.env._plue_exec = original
        async def upload_failure(*args):
            raise OSError("upload unavailable")
        self.env._plue_upload = upload_failure
        with patch.object(install, "stage", side_effect=self.stage), self.assertRaises(plue_env.PlueError):
            asyncio.run(self.env.start(False))
        with patch.object(install, "stage", side_effect=ValueError("unsupported architecture")), self.assertRaises(plue_env.PlueError):
            asyncio.run(self.env.start(False))

    def test_cancellation_propagates_and_does_not_claim_installation(self):
        async def canceled(*args, **kwargs):
            raise asyncio.CancelledError()
        self.env._plue_upload = canceled
        with patch.object(install, "stage", side_effect=self.stage), self.assertRaises(asyncio.CancelledError):
            asyncio.run(self.env.start(False))
        self.assertFalse(hasattr(self.env, "_plue_agent_install_receipt"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
