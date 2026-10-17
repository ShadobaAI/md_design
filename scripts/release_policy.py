"""Shared production version and tag contract (stdlib only)."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

VERSION_PATTERN = r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"


def version_key(version):
    if not isinstance(version, str) or not re.fullmatch(VERSION_PATTERN, version):
        raise ValueError("Expected a stable version such as 1.0.0, without prefix or prerelease")
    return tuple(map(int, version.split(".")))


def read_version(root):
    def read(file):
        return json.loads((root / file).read_text(encoding="utf-8"))
    manifest = read(".codex-plugin/plugin.json")
    version = manifest["version"]
    version_key(version)
    if manifest["name"] != "md-design" or manifest["skills"] != "./skills/":
        raise ValueError("Unexpected plugin identity or skills path")
    lock = read("package-lock.json")
    if any(item != version for item in [read("package.json")["version"], lock["version"], lock["packages"][""]["version"]]):
        raise ValueError("Plugin, package.json and package-lock.json versions differ")
    return version


def validate_tag(root, tag):
    version = read_version(root)
    if tag != version:
        raise ValueError("Release tag must exactly match the stable plugin version")
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    print(validate_tag(root, args.tag) if args.tag is not None else read_version(root))
