import importlib.util
import hashlib
import json
import tempfile
import subprocess
import shutil
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
        for file in [".codex-plugin/plugin.json", "package.json", "package-lock.json", packager.CATALOG_TEMPLATE]:
            (self.root / file).parent.mkdir(parents=True, exist_ok=True)
            (self.root / file).write_bytes((ROOT / file).read_bytes())
        catalog_file = self.root / packager.CATALOG_TEMPLATE
        catalog = json.loads(catalog_file.read_text(encoding="utf-8"))
        catalog["plugins"][0]["policy"]["installation"] = "NOT_AVAILABLE"
        catalog_file.write_text(json.dumps(catalog), encoding="utf-8")
        self.info("release")
        for name in ["playground.js.map", "parser.mjs.map"]:
            (self.root / "dist" / name).write_text("{}", encoding="utf-8")

    def info(self, profile):
        (self.root / "dist/build-info.json").write_text(json.dumps({"profile": profile}), encoding="utf-8")

    def package(self, version="0.1.0", environment=None, revision="a" * 40):
        with patch.dict(packager.os.environ, environment or {"GITHUB_ACTIONS": ""}), \
                patch.object(packager, "ROOT", self.root), \
                patch.object(packager.subprocess, "check_output", side_effect=[revision, ""]), \
                redirect_stdout(io.StringIO()):
            packager.package(self.root / ".build", version)
        return self.root / ".build"

    def test_production_roundtrip_excludes_checkout_dependencies_and_local_notes(self):
        (self.root / "local-secret.txt").write_text("must not ship")
        output = self.package()
        build = verifier.verify(output, self.root / "unpacked")
        self.assertEqual(build["profile"], "release")
        self.assertFalse(build["dirty"])
        self.assertFalse((self.root / "unpacked/plugins/md-design/dist/playground.js.map").exists())
        self.assertFalse((self.root / "unpacked/plugins/md-design/local-secret.txt").exists())
        source = json.loads((self.root / packager.CATALOG_TEMPLATE).read_text(encoding="utf-8"))
        catalog = json.loads((self.root / "unpacked/.agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        self.assertFalse((self.root / ".agents/plugins/marketplace.json").exists())
        self.assertFalse((self.root / "unpacked/plugins/md-design/packaging").exists())
        self.assertEqual(source["plugins"][0]["policy"]["installation"], "NOT_AVAILABLE")
        self.assertEqual(catalog["name"], "shadobaai")
        self.assertEqual(catalog["interface"]["displayName"], "ShadobaAI")
        self.assertEqual(catalog["plugins"][0]["policy"]["installation"], "AVAILABLE")

    def test_packages_for_another_marketplace_are_rejected(self):
        path = self.root / packager.CATALOG_TEMPLATE
        original = path.read_text(encoding="utf-8")
        for key, value in [("name", "other-marketplace"), ("interface", {"displayName": "Other store"})]:
            catalog = json.loads(original)
            catalog[key] = value
            path.write_text(json.dumps(catalog), encoding="utf-8")
            output = self.package()
            destination = self.root / f"unpacked-{key}"
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "Unexpected marketplace source"):
                verifier.verify(output, destination)
            self.assertFalse(destination.exists())

    def test_source_checkout_does_not_register_a_marketplace(self):
        for relative in [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]:
            with self.subTest(path=relative):
                self.assertFalse((ROOT / relative).exists())

    def test_missing_catalog_template_preserves_previous_package(self):
        output = self.package()
        original = (output / "SHA256SUMS").read_bytes()
        (self.root / packager.CATALOG_TEMPLATE).unlink()
        with self.assertRaisesRegex(ValueError, "Missing input"):
            self.package()
        self.assertEqual((output / "SHA256SUMS").read_bytes(), original)

    def test_release_excludes_stale_source_maps(self):
        output = self.package()
        verifier.verify(output, self.root / "unpacked")
        self.assertFalse((self.root / "unpacked/plugins/md-design/dist/playground.js.map").exists())

    def test_invalid_version_fails_before_output_deletion(self):
        output = self.root / ".build"
        output.mkdir()
        sentinel = output / "previous.txt"
        sentinel.write_text("previous package")
        for version in ["v0.1.0", "0.1.0-rc.1", "../escape", "01.0.0", ""]:
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.package(version)
            self.assertEqual(sentinel.read_text(), "previous package")

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

    def test_source_manifests_must_remain_versionless(self):
        policy.read_source_manifest(self.root)
        for file, nested in [(".codex-plugin/plugin.json", False), ("package.json", False),
                             ("package-lock.json", False), ("package-lock.json", True)]:
            path = self.root / file
            original = path.read_bytes()
            data = json.loads(original)
            target = data["packages"][""] if nested else data
            target["version"] = "0.1.0"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.subTest(file=file, nested=nested), self.assertRaisesRegex(ValueError, "must not contain a version"):
                self.package()
            path.write_bytes(original)

    def test_tag_sets_deliverable_version_without_modifying_source(self):
        source = self.root / ".codex-plugin/plugin.json"
        original = source.read_bytes()
        environment = {"GITHUB_ACTIONS": "true", "GITHUB_REF_TYPE": "tag", "GITHUB_REF_NAME": "0.2.3"}
        output = self.package(version=None, environment=environment)
        build = verifier.verify(output, self.root / "unpacked")
        self.assertEqual(build["version"], "0.2.3")
        self.assertEqual(source.read_bytes(), original)
        self.assertNotIn("version", json.loads(original))
        self.assertEqual({file.name for file in output.glob("*.zip")},
                         {"md-design-0.2.3.zip", "md-design-0.2.3-marketplace.zip"})

    def test_release_tag_cannot_be_overridden_and_invalid_tags_are_rejected(self):
        environment = {"GITHUB_ACTIONS": "true", "GITHUB_REF_TYPE": "tag", "GITHUB_REF_NAME": "0.2.3"}
        with self.assertRaisesRegex(ValueError, "triggering Git tag"):
            self.package(version="9.0.0", environment=environment)
        for tag in ["v0.2.3", "0.2.3-rc.1", "main", "0.2"]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                self.package(version=None, environment={**environment, "GITHUB_REF_NAME": tag})

    def test_pr_and_local_default_use_only_stable_tags_in_history(self):
        with patch.dict(packager.os.environ, {"GITHUB_ACTIONS": "true", "GITHUB_REF_TYPE": "branch"}), \
                patch.object(policy.subprocess, "check_output", return_value="0.2.0\n0.10.0\nv9.0.0\n1.0.0-rc.1\n") as calls:
            self.assertEqual(policy.resolve_version(self.root), "0.10.0")
            calls.assert_called_once_with(["git", "tag", "--merged", "HEAD"], cwd=self.root, text=True)
        with patch.dict(packager.os.environ, {"GITHUB_ACTIONS": ""}), \
                patch.object(policy.subprocess, "check_output", return_value=""):
            with self.assertRaisesRegex(ValueError, "No stable Git tag"):
                policy.resolve_version(self.root)
            self.assertEqual(policy.resolve_version(self.root, "0.1.0"), "0.1.0")

    def test_publication_writes_only_to_separate_marketplace_including_first_commit(self):
        source = self.root / "source-origin"
        marketplace = self.root / "marketplace-origin.git"
        real_run = publisher.run
        real_run("git", "init", "--quiet", "--initial-branch=main", str(source))
        real_run("git", "init", "--quiet", "--bare", str(marketplace))
        identity = ["git", "-c", "user.name=CI", "-c", "user.email=ci@example.test"]
        record = {"repository": {"full_name": publisher.REPOSITORY},
                  "head_repository": {"full_name": publisher.REPOSITORY},
                  "path": ".github/workflows/build-plugin.yml", "event": "push", "conclusion": "success"}
        pushes = []

        def github_run(*args, cwd=None, env=None):
            if args[:2] == ("gh", "api"):
                return json.dumps(record)
            if args[:3] == ("gh", "auth", "setup-git"):
                return ""
            if args[:3] == ("gh", "run", "download"):
                destination = Path(args[args.index("--dir") + 1])
                destination.mkdir(parents=True)
                for file in output.iterdir():
                    if file.is_file():
                        shutil.copyfile(file, destination / file.name)
                return ""
            if args[:2] == ("git", "clone"):
                url = args[-2]
                if url == f"https://github.com/{publisher.REPOSITORY}.git":
                    self.assertIsNone(env)  # Built-in source token only.
                    args = (*args[:-2], str(source), args[-1])
                else:
                    self.assertEqual(url, f"https://github.com/{publisher.MARKETPLACE_REPOSITORY}.git")
                    self.assertEqual(env["GH_TOKEN"], "marketplace-write-token")
                    args = (*args[:-2], str(marketplace), args[-1])
            if args[:2] == ("git", "push"):
                self.assertEqual(Path(cwd).name, "catalog")
                self.assertEqual(env["GH_TOKEN"], "marketplace-write-token")
                pushes.append(args)
            return real_run(*args, cwd=cwd, env=env)

        for number, version in enumerate(["0.1.0", "0.2.0"], 1):
            (source / "file.txt").write_text(version)
            real_run("git", "add", "file.txt", cwd=source)
            real_run(*identity, "commit", "-qm", version, cwd=source)
            revision = real_run("git", "rev-parse", "HEAD", cwd=source)
            real_run("git", "tag", version, cwd=source)
            record.update(head_branch=version, head_sha=revision, id=number)
            output = self.package(version=version, revision=revision,
                                  environment={"GITHUB_ACTIONS": "", "GITHUB_RUN_ID": str(number)})
            with patch.dict(publisher.os.environ, {"GITHUB_REPOSITORY": publisher.REPOSITORY,
                            "GH_TOKEN": "source-read-token", "MARKETPLACE_TOKEN": "marketplace-write-token"}), \
                    patch.object(publisher, "run", side_effect=github_run):
                publisher.publish(number, self.root / f"publication-{number}")
            manifest = json.loads(real_run("git", "show", "main:plugins/md-design/.codex-plugin/plugin.json", cwd=marketplace))
            self.assertEqual(manifest["version"], version)
            self.assertEqual(real_run("git", "rev-parse", "HEAD", cwd=source), revision)
        self.assertEqual(len(pushes), 2)
        published = real_run("git", "rev-parse", "main", cwd=marketplace)
        with patch.dict(publisher.os.environ, {"GITHUB_REPOSITORY": publisher.REPOSITORY,
                        "MARKETPLACE_TOKEN": "marketplace-write-token"}), \
                patch.object(publisher, "run", side_effect=github_run):
            publisher.publish(2, self.root / "publication-repeat")
        self.assertEqual(real_run("git", "rev-parse", "main", cwd=marketplace), published)
        self.assertEqual(len(pushes), 2)

        record.update(head_branch="0.1.0", head_sha=real_run("git", "rev-parse", "0.1.0", cwd=source), id=1)
        output = self.package(version="0.1.0", revision=record["head_sha"],
                              environment={"GITHUB_ACTIONS": "", "GITHUB_RUN_ID": "1"})
        with patch.dict(publisher.os.environ, {"GITHUB_REPOSITORY": publisher.REPOSITORY,
                        "MARKETPLACE_TOKEN": "marketplace-write-token"}), \
                patch.object(publisher, "run", side_effect=github_run), \
                self.assertRaisesRegex(ValueError, "roll back"):
            publisher.publish(1, self.root / "publication-rollback")
        self.assertEqual(real_run("git", "rev-parse", "main", cwd=marketplace), published)
        self.assertEqual(len(pushes), 2)

    def test_catalog_merge_preserves_other_plugins_order_and_metadata(self):
        payload = self.root / "payload"
        verifier.verify(self.package(), payload)
        incoming = json.loads((payload / ".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        checkout = self.root / "store"
        catalog_file = checkout / ".agents/plugins/marketplace.json"
        catalog_file.parent.mkdir(parents=True)
        other = {"name": "notes", "source": {"source": "local", "path": "./plugins/notes"},
                 "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}, "category": "Productivity"}
        for plugins in [[other], [{"name": "md-design", "category": "Outdated"}, other]]:
            with self.subTest(replace=plugins[0]["name"] == "md-design"):
                current = {"name": "shadobaai", "owner": {"name": "ShadobaAI"},
                           "interface": {"displayName": "ShadobaAI", "shortDescription": "Shared plugins"},
                           "plugins": plugins}
                catalog_file.write_text(json.dumps(current), encoding="utf-8")
                publisher.update_catalog(checkout, payload)
                actual = json.loads(catalog_file.read_text(encoding="utf-8"))
                expected_names = [entry["name"] for entry in plugins]
                if "md-design" not in expected_names:
                    expected_names.append("md-design")
                self.assertEqual([entry["name"] for entry in actual["plugins"]], expected_names)
                self.assertEqual(next(entry for entry in actual["plugins"] if entry["name"] == "notes"), other)
                self.assertEqual(next(entry for entry in actual["plugins"] if entry["name"] == "md-design"), incoming["plugins"][0])
                self.assertEqual(actual["name"], incoming["name"])
                self.assertEqual(actual["owner"], current["owner"])
                self.assertEqual(actual["interface"]["shortDescription"], "Shared plugins")

        duplicate = {**current, "plugins": [other, other]}
        catalog_file.write_text(json.dumps(duplicate), encoding="utf-8")
        original = catalog_file.read_bytes()
        with self.assertRaisesRegex(ValueError, "Duplicate plugin names"):
            publisher.update_catalog(checkout, payload)
        self.assertEqual(catalog_file.read_bytes(), original)

    def test_shared_store_push_conflicts_are_bounded_and_preserve_other_plugins(self):
        real_run = publisher.run
        identity = ["git", "-c", "user.name=CI", "-c", "user.email=ci@example.test"]
        relative_catalog = ".agents/plugins/marketplace.json"
        for scenario, expected_attempts in [("concurrent", 2), ("denied", 1), ("busy", 3)]:
            with self.subTest(scenario=scenario):
                root = self.root / scenario
                root.mkdir()
                origin, seed, checkout, payload = [root / name for name in ["origin.git", "seed", "checkout", "payload"]]
                build = verifier.verify(self.package(), payload)
                real_run("git", "init", "--quiet", "--bare", str(origin))
                real_run("git", "init", "--quiet", "--initial-branch=main", str(seed))
                other = {"name": "notes", "source": {"source": "local", "path": "./plugins/notes"},
                         "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}, "category": "Productivity"}
                catalog = {"name": "shadobaai", "interface": {"displayName": "ShadobaAI"}, "plugins": [other]}
                catalog_file = seed / relative_catalog
                catalog_file.parent.mkdir(parents=True)
                catalog_file.write_text(json.dumps(catalog), encoding="utf-8")
                notes_file = seed / "plugins/notes/notes.txt"
                notes_file.parent.mkdir(parents=True)
                notes_file.write_text("initial")
                (seed / "README.md").write_text("Shared plugin store")
                real_run("git", "add", ".", cwd=seed)
                real_run(*identity, "commit", "-qm", "Initial store", cwd=seed)
                real_run("git", "remote", "add", "origin", str(origin), cwd=seed)
                real_run("git", "push", "--quiet", "origin", "main", cwd=seed)
                real_run("git", "clone", "--quiet", "--branch", "main", str(origin), str(checkout))
                attempts = []

                def competing_run(*args, cwd=None, env=None):
                    if args[:2] == ("git", "push") and Path(cwd) == checkout:
                        attempts.append(args)
                        if scenario == "denied":
                            raise subprocess.CalledProcessError(128, args)
                        if scenario == "busy" or len(attempts) == 1:
                            other["description"] = f"Concurrent update {len(attempts)}"
                            catalog_file.write_text(json.dumps(catalog), encoding="utf-8")
                            notes_file.write_text(other["description"])
                            real_run("git", "add", ".", cwd=seed)
                            real_run(*identity, "commit", "-qm", other["description"], cwd=seed)
                            real_run("git", "push", "--quiet", "origin", "main", cwd=seed)
                    return real_run(*args, cwd=cwd, env=env)

                with patch.object(publisher, "run", side_effect=competing_run):
                    if scenario == "concurrent":
                        publisher.push_release(checkout, payload, self.root, build, dict(publisher.os.environ))
                    else:
                        with self.assertRaises(subprocess.CalledProcessError):
                            publisher.push_release(checkout, payload, self.root, build, dict(publisher.os.environ))
                self.assertEqual(len(attempts), expected_attempts)
                published = json.loads(real_run("git", "show", f"main:{relative_catalog}", cwd=origin))
                self.assertEqual(next(entry for entry in published["plugins"] if entry["name"] == "notes"), other)
                self.assertEqual(real_run("git", "show", "main:plugins/notes/notes.txt", cwd=origin),
                                 other.get("description", "initial"))
                self.assertEqual(real_run("git", "show", "main:README.md", cwd=origin), "Shared plugin store")
                self.assertEqual(sum(entry["name"] == "md-design" for entry in published["plugins"]),
                                 int(scenario == "concurrent"))


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

    def test_missing_marketplace_token_fails_before_download_or_write(self):
        with patch.dict(publisher.os.environ, {"GITHUB_REPOSITORY": publisher.REPOSITORY, "MARKETPLACE_TOKEN": ""}), \
                patch.object(publisher, "run", return_value=json.dumps(self.record())) as calls:
            with self.assertRaisesRegex(ValueError, "MARKETPLACE_TOKEN"):
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
