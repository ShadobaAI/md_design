"""Promote one verified source release to the separate marketplace repository.

The calling workflow runs after a successful tag build, or manually for retries.
Only clean stable releases from this repository may be published.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
from pathlib import Path
from release_policy import version_key

REPOSITORY = "ShadobaAI/md_design"
MARKETPLACE_REPOSITORY = "ShadobaAI/md_design-mkt"


def run(*args, cwd=None, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, encoding="utf-8").strip()


def clone_marketplace(checkout, environment):
    # A newly created marketplace may have no commits yet. Only that case may
    # bootstrap main; an existing repository must already have an origin/main.
    run("git", "clone", f"https://github.com/{MARKETPLACE_REPOSITORY}.git", str(checkout), env=environment)
    refs = run("git", "for-each-ref", "--format=%(refname)", "refs/remotes/origin", cwd=checkout).splitlines()
    if "refs/remotes/origin/main" in refs:
        run("git", "checkout", "-B", "main", "refs/remotes/origin/main", cwd=checkout)
    elif refs:
        raise ValueError("Marketplace must have a main branch or be empty")
    else:
        run("git", "symbolic-ref", "HEAD", "refs/heads/main", cwd=checkout)


def validate_run(record):
    if (record["repository"]["full_name"] != REPOSITORY
            or record["head_repository"]["full_name"] != REPOSITORY
            or record["path"] != ".github/workflows/build-plugin.yml"
            or record["event"] != "push" or record["conclusion"] != "success"):
        raise ValueError("Only a successful tagged release build of this repository can be published")
    version_key(record["head_branch"])


def validate_build(build, record):
    if (build["profile"] != "release" or build["dirty"]
            or build["revision"] != record["head_sha"]
            or build["version"] != record["head_branch"]
            or str(build["runId"]) != str(record["id"])):
        raise ValueError("Artifact does not match the successful release run")


def validate_source_tag(checkout, build):
    # Resolve annotated and lightweight tags alike. A moved/deleted tag must not
    # publish an older run under a name that now points at different sources.
    run("git", "fetch", "--no-tags", "origin", f"refs/tags/{build['version']}", cwd=checkout)
    actual = run("git", "rev-parse", "FETCH_HEAD^{commit}", cwd=checkout)
    if actual != build["revision"]:
        raise ValueError("Release tag no longer points to the built revision")
    run("git", "merge-base", "--is-ancestor", actual, "HEAD", cwd=checkout)


def stage_catalog(checkout):
    run("git", "add", "--", "plugins/md-design", ".agents/plugins/marketplace.json", cwd=checkout)
    tracked = set(run("git", "ls-files", "--", "plugins/md-design/dist", cwd=checkout).splitlines())
    for file in ["index.html", "playground.js", "parser.mjs", "preview.css", "THIRD_PARTY.md", "build-info.json"]:
        if f"plugins/md-design/dist/{file}" not in tracked:
            raise ValueError(f"Runtime file was not staged: {file}")


def publish(run_id, work):
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise ValueError("Publication is restricted to ShadobaAI/md_design")
    record = json.loads(run("gh", "api", f"repos/{REPOSITORY}/actions/runs/{run_id}"))
    validate_run(record)
    token = os.environ.get("MARKETPLACE_TOKEN")
    if not token:
        raise ValueError("MARKETPLACE_TOKEN with Contents write access to ShadobaAI/md_design-mkt is required")
    marketplace_environment = {**os.environ, "GH_TOKEN": token}
    work.mkdir(parents=True, exist_ok=False)
    download = work / "download"
    run("gh", "run", "download", str(run_id), "--repo", REPOSITORY,
        "--name", "md-design-plugin", "--dir", str(download))
    spec = importlib.util.spec_from_file_location("verify_package", Path(__file__).with_name("verify-package.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    payload = work / "payload"
    build = module.verify(download, payload)
    validate_build(build, record)
    # Git uses gh's credential helper with the token in each command's env.
    # The built-in token reads source/artifacts; only target clone/push receives
    # the separately scoped marketplace credential. No artifact code is run.
    run("gh", "auth", "setup-git")
    source = work / "source"
    run("git", "clone", "--single-branch", "--branch", "main",
        f"https://github.com/{REPOSITORY}.git", str(source))
    validate_source_tag(source, build)
    checkout = work / "catalog"
    clone_marketplace(checkout, marketplace_environment)
    previous_file = checkout / "plugins/md-design/build-info.json"
    if previous_file.exists():
        previous = json.loads(previous_file.read_text(encoding="utf-8"))
        if previous["revision"] == build["revision"] and previous["version"] == build["version"]:
            print("Release is already published")
            return
        if version_key(build["version"]) <= version_key(previous["version"]):
            raise ValueError("Publication cannot replace or roll back an existing version")
        # Refuse an older/divergent release. No forced pushes or rollback.
        run("git", "merge-base", "--is-ancestor", previous["revision"], build["revision"], cwd=source)
    # Update only the delivered plugin and catalog in the marketplace checkout.
    target = checkout / "plugins/md-design"
    if target.is_symlink() or not target.resolve().is_relative_to(checkout.resolve()):
        raise ValueError("Unsafe plugin destination")
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(payload / "plugins/md-design", target)
    catalog = checkout / ".agents/plugins/marketplace.json"
    if not catalog.resolve().is_relative_to(checkout.resolve()):
        raise ValueError("Unsafe catalog destination")
    catalog.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(payload / ".agents/plugins/marketplace.json", catalog)
    run("git", "config", "user.name", "github-actions[bot]", cwd=checkout)
    run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=checkout)
    stage_catalog(checkout)
    run("git", "commit", "-m", f"Publish md-design {build['version']}", cwd=checkout)
    run("git", "push", "origin", "HEAD:refs/heads/main", cwd=checkout, env=marketplace_environment)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--work", type=Path, required=True)
    args = parser.parse_args()
    publish(args.run_id, args.work.resolve())
