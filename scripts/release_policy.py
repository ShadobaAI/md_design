"""Resolve package versions from Git tags without versioned source manifests."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

VERSION_PATTERN = r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"


def version_key(version):
    if not isinstance(version, str) or not re.fullmatch(VERSION_PATTERN, version):
        raise ValueError("Expected a stable version such as 1.0.0, without prefix or prerelease")
    return tuple(map(int, version.split(".")))


def read_source_manifest(root):
    def read(file):
        return json.loads((root / file).read_text(encoding="utf-8"))
    manifest = read(".codex-plugin/plugin.json")
    if manifest["name"] != "md-design" or manifest["skills"] != "./skills/":
        raise ValueError("Unexpected plugin identity or skills path")
    lock = read("package-lock.json")
    if any("version" in item for item in [manifest, read("package.json"), lock, lock["packages"][""]]):
        raise ValueError("Source manifests must not contain a version; use a Git tag")
    return manifest


def resolve_version(root, version=None):
    # The triggering tag always wins in release CI; an override cannot relabel it.
    if os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_REF_TYPE") == "tag":
        tag = os.environ.get("GITHUB_REF_NAME", "")
        version_key(tag)
        if version is not None and version != tag:
            raise ValueError("Package version must match the triggering Git tag")
        return tag
    if version is None:
        # PRs exercise the same package format using the highest stable tag in
        # their history. Those builds are never eligible for publication.
        tags = subprocess.check_output(["git", "tag", "--merged", "HEAD"], cwd=root, text=True).splitlines()
        tags = [tag for tag in tags if re.fullmatch(VERSION_PATTERN, tag)]
        if not tags:
            raise ValueError("No stable Git tag in history; pass --version for local packaging")
        version = max(tags, key=version_key)
    version_key(version)
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Version for local packaging; release CI uses its triggering tag")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    read_source_manifest(root)
    print(resolve_version(root, args.version))
