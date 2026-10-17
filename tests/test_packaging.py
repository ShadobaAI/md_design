import importlib.util
import hashlib
import json
import tempfile
import subprocess
import io
from contextlib import redirect_stdout
import unittest
import sys
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


packager = load("package-plugin")
verifier = load("verify-package")
publisher = load("publish-marketplace")
policy = load("release_policy")


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for file in packager.FILES:
            target = self.root / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("fixture", encoding="utf-8")
        for file in [".codex-plugin/plugin.json", "package.json", "package-lock.json", ".agents/plugins/marketplace.json"]:
            (self.root / file).parent.mkdir(parents=True, exist_ok=True)
            (self.root / file).write_bytes((ROOT / file).read_bytes())
        catalog_file = self.root / ".agents/plugins/marketplace.json"
        catalog = json.loads(catalog_file.read_text(encoding="utf-8"))
        catalog["plugins"][0]["policy"]["installation"] = "NOT_AVAILABLE"
        catalog_file.write_text(json.dumps(catalog), encoding="utf-8")
        self.info("release")
        for name in ["playground.js.map", "parser.mjs.map"]:
            (self.root / "dist" / name).write_text("{}", encoding="utf-8")

    def info(self, profile):
        (self.root / "dist/build-info.json").write_text(json.dumps({"profile": profile}), encoding="utf-8")

    def package(self):
        with patch.object(packager, "ROOT", self.root), patch.object(packager.subprocess, "check_output", side_effect=["a" * 40, ""]), redirect_stdout(io.StringIO()):
            packager.package(self.root / ".build")
        return self.root / ".build"

    def test_production_roundtrip_excludes_checkout_dependencies_and_local_notes(self):
        (self.root / "local-secret.txt").write_text("must not ship")
        output = self.package()
        build = verifier.verify(output, self.root / "unpacked")
        self.assertEqual(build["profile"], "release")
        self.assertFalse(build["dirty"])
        self.assertFalse((self.root / "unpacked/plugins/md-design/dist/playground.js.map").exists())
        self.assertFalse((self.root / "unpacked/plugins/md-design/local-secret.txt").exists())
        source = json.loads((self.root / ".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        catalog = json.loads((self.root / "unpacked/.agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        self.assertEqual(source["plugins"][0]["policy"]["installation"], "NOT_AVAILABLE")
        self.assertEqual(catalog["plugins"][0]["policy"]["installation"], "AVAILABLE")

    def test_release_excludes_stale_source_maps(self):
        output = self.package()
        verifier.verify(output, self.root / "unpacked")
        self.assertFalse((self.root / "unpacked/plugins/md-design/dist/playground.js.map").exists())

    def test_version_mismatch_fails_before_output_deletion(self):
        manifest = json.loads((self.root / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
        manifest["version"] = "0.0.1"
        (self.root / ".codex-plugin/plugin.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "versions differ"):
            self.package()

    def test_missing_runtime_fails(self):
        (self.root / "dist/parser.mjs").unlink()
        with self.assertRaisesRegex(ValueError, "Missing input"):
            self.package()

    def test_nonproduction_bundle_cannot_be_packaged(self):
        self.info("development")
        with self.assertRaisesRegex(ValueError, "Only production"):
            self.package()

    def test_modified_archive_fails_checksum(self):
        output = self.package()
        archive = next(output.glob("*-marketplace.zip"))
        archive.write_bytes(archive.read_bytes() + b"corrupt")
        with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
            verifier.verify(output, self.root / "unpacked")

    def test_zip_path_traversal_fails_before_extraction(self):
        output = self.package()
        archive = next(output.glob("*-marketplace.zip"))
        with ZipFile(archive, "a") as file:
            file.writestr("../escape.txt", "bad")
        (output / "SHA256SUMS").write_text("".join(
            f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n"
            for file in sorted(output.glob("*.zip"))
        ))
        with self.assertRaisesRegex(ValueError, "Unsafe ZIP"):
            verifier.verify(output, self.root / "unpacked")
        self.assertFalse((self.root / "escape.txt").exists())

    def test_published_runtime_is_tracked_under_source_ignore_rules(self):
        output = self.package()
        checkout = self.root / "unpacked"
        verifier.verify(output, checkout)
        (checkout / ".gitignore").write_bytes((ROOT / ".gitignore").read_bytes())
        subprocess.run(["git", "init", "--quiet", str(checkout)], check=True)
        publisher.stage_catalog(checkout)
        tracked = publisher.run("git", "ls-files", cwd=checkout)
        self.assertIn("plugins/md-design/dist/parser.mjs", tracked)
        self.assertIn("plugins/md-design/.codex-plugin/plugin.json", tracked)

    def test_normalized_zip_aliases_are_rejected_before_extraction(self):
        aliases = ["plugins/md-design/./.codex-plugin/plugin.json",
                   "plugins/md-design//.codex-plugin/plugin.json",
                   "plugins/md-design/.codex-plugin/PLUGIN.JSON",
                   "plugins/md-design/.codex-plugin./plugin.json"]
        for alias in aliases:
            with self.subTest(alias=alias):
                output = self.package()
                archive = next(output.glob("*-marketplace.zip"))
                with ZipFile(archive, "a") as file:
                    file.writestr(alias, '{"version":"overwritten"}')
                (output / "SHA256SUMS").write_text("".join(
                    f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n"
                    for file in sorted(output.glob("*.zip"))
                ))
                destination = self.root / "unpacked"
                with self.assertRaisesRegex(ValueError, "Unsafe ZIP"):
                    verifier.verify(output, destination)
                self.assertFalse(destination.exists())

    def test_version_contract_checks_all_manifests_and_tag(self):
        self.assertEqual(policy.validate_tag(self.root, "1.0.0"), "1.0.0")
        for tag in ["v1.0.0", "1.0.1", "1.0.0-rc.1"]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                policy.validate_tag(self.root, tag)
        lock = json.loads((self.root / "package-lock.json").read_text(encoding="utf-8"))
        lock["packages"][""]["version"] = "2.0.0"
        (self.root / "package-lock.json").write_text(json.dumps(lock))
        with self.assertRaisesRegex(ValueError, "versions differ"):
            self.package()


class PublicationTests(unittest.TestCase):
    def record(self):
        return {"repository": {"full_name": publisher.REPOSITORY}, "head_repository": {"full_name": publisher.REPOSITORY},
                "path": ".github/workflows/build-plugin.yml", "event": "push", "conclusion": "success",
                "head_branch": "1.0.0", "head_sha": "a" * 40, "id": 123}

    def test_only_successful_tag_run_from_this_repository_is_accepted(self):
        for version in ["1.0.0", "10.20.30"]:
            publisher.validate_run({**self.record(), "head_branch": version})
        for key, value in [("event", "pull_request"), ("conclusion", "failure"), ("head_branch", "main"),
                           ("head_branch", "v1.0.0"), ("head_branch", "release-1.0.0"),
                           ("head_branch", "1.0.0-rc.1"), ("head_branch", "01.0.0"),
                           ("head_repository", {"full_name": "other/repo"}), ("path", "other.yml")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                publisher.validate_run({**self.record(), key: value})

    def test_automatic_publication_rejects_ineligible_runs_before_download_or_write(self):
        for key, value in [("event", "pull_request"), ("conclusion", "failure"),
                           ("conclusion", "cancelled"), ("head_branch", "main"),
                           ("head_branch", "feature/test"), ("head_branch", "v1.0.0"),
                           ("head_branch", "1.0"), ("head_branch", "invalid"),
                           ("head_repository", {"full_name": "other/repo"})]:
            record = {**self.record(), key: value}
            with self.subTest(key=key, value=value), \
                    patch.dict(publisher.os.environ, {"GITHUB_REPOSITORY": publisher.REPOSITORY}), \
                    patch.object(publisher, "run", return_value=json.dumps(record)) as calls:
                with self.assertRaises(ValueError):
                    publisher.publish(123, ROOT / ".test-tmp/not-used-publication")
                calls.assert_called_once_with("gh", "api", f"repos/{publisher.REPOSITORY}/actions/runs/123")

    def test_nonproduction_dirty_or_unrelated_artifacts_are_rejected(self):
        build = {"profile": "release", "dirty": False, "revision": "a" * 40, "version": "1.0.0", "runId": "123"}
        publisher.validate_build(build, self.record())
        for key, value in [("profile", "development"), ("dirty", True), ("revision", "b" * 40), ("version", "0.9.0"), ("runId", "999")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                publisher.validate_build({**build, key: value}, self.record())

    def test_stable_version_order_and_rejection(self):
        versions = ["0.9.0", "1.0.0", "1.0.1", "2.0.0", "10.0.0"]
        self.assertEqual(sorted(reversed(versions), key=publisher.version_key), versions)
        for version in ["v1.0.0", "1.0.0-rc.1", "1.0", "01.0.0", "١.0.0"]:
            with self.subTest(version=version), self.assertRaises(ValueError):
                publisher.version_key(version)

    def test_source_tag_peels_annotated_tags_and_rejects_moved_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            origin = root / "origin"
            checkout = root / "checkout"
            publisher.run("git", "init", "--quiet", "--initial-branch=main", str(origin))
            (origin / "file.txt").write_text("first")
            publisher.run("git", "add", "file.txt", cwd=origin)
            identity = ["git", "-c", "user.name=CI", "-c", "user.email=ci@example.test"]
            publisher.run(*identity, "commit", "-qm", "first", cwd=origin)
            revision = publisher.run("git", "rev-parse", "HEAD", cwd=origin)
            publisher.run(*identity, "tag", "-a", "1.0.0", "-m", "release", cwd=origin)
            publisher.run("git", "clone", "--quiet", str(origin), str(checkout))
            build = {"version": "1.0.0", "revision": revision}
            publisher.validate_source_tag(checkout, build)
            (origin / "file.txt").write_text("second")
            publisher.run("git", "add", "file.txt", cwd=origin)
            publisher.run(*identity, "commit", "-qm", "second", cwd=origin)
            publisher.run("git", "tag", "--force", "1.0.0", cwd=origin)
            with self.assertRaisesRegex(ValueError, "no longer points"):
                publisher.validate_source_tag(checkout, build)


if __name__ == "__main__":
    unittest.main()
