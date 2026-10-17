"""Build production plugin and marketplace ZIPs (stdlib only)."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from release_policy import read_source_manifest, resolve_version

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "LICENSE",
    ".codex-plugin/plugin.json",
    "skills/md-design/SKILL.md",
    "skills/md-design/references/syntax.md",
    "skills/md-design/references/showcase.md",
    "skills/md-design/references/reconstruction.md",
    "skills/md-design/references/examples.md",
    "scripts/preview.mjs", "scripts/server.mjs",
    "prototypes/showcase.md", "prototypes/order.md", "prototypes/counterparty.md",
    "prototypes/save-report.md", "prototypes/pricing-zones.md",
    "prototypes/artifacts.md",
    "vendor/UPSTREAM.json", "vendor/md_design/LICENSE.md",
    "dist/index.html", "dist/playground.js", "dist/parser.mjs",
    "dist/preview.css", "dist/THIRD_PARTY.md", "dist/build-info.json",
]
OPTIONAL_FILES = ["dist/playground.js.LEGAL.txt", "dist/parser.mjs.LEGAL.txt"]


def json_read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def json_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def archive(directory, destination, prefix=""):
    # Stable entry order, timestamps and permissions, independent of runner OS.
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as output:
        for file in sorted(directory.rglob("*")):
            if file.is_file():
                info = ZipInfo(prefix + file.relative_to(directory).as_posix(), (2020, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = ZIP_DEFLATED
                output.writestr(info, file.read_bytes())


def package(output, version=None):
    manifest = read_source_manifest(ROOT)
    version = resolve_version(ROOT, version)
    build = json_read(ROOT / "dist/build-info.json")
    profile = build["profile"]
    if profile != "release":
        raise ValueError("Only production release bundles can be packaged")
    paths = list(FILES)
    paths += [file for file in OPTIONAL_FILES if (ROOT / file).exists()]
    # Validate every input before touching the previous output.
    for relative in paths:
        file = ROOT / relative
        if not file.is_file() or file.resolve() != file.absolute():
            raise ValueError(f"Missing input or symlink in package path: {relative}")
    output = output.resolve()
    if output != ROOT / ".build":
        raise ValueError("Output must be the repository .build directory")
    if output.is_symlink():
        raise ValueError("Output must not be a symlink")
    if output.exists():
        shutil.rmtree(output)
    plugin = output / "marketplace/plugins/md-design"
    plugin.mkdir(parents=True)
    for relative in paths:
        target = plugin / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    # Version belongs to the deliverable, never to the checked-in template.
    json_write(plugin / ".codex-plugin/plugin.json", {**manifest, "version": version})
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, text=True).strip())
    source_notice = (
        f"# Source code\n\nNakidka {version}\n\n"
        f"https://github.com/ShadobaAI/md_design/tree/{revision}\n\n"
        "## Original contributions\n\nCopyright (c) 2026 ShadobaAI and contributors.\n\n"
        "This Source Code Form is subject to the terms of the Mozilla Public "
        "License, v. 2.0. If a copy of the MPL was not distributed with this "
        "file, You can obtain one at https://mozilla.org/MPL/2.0/.\n\n"
        "See LICENSE for the full terms. This notice applies only to original "
        "contributions to the Nakidka plugin (code, skills and documentation), "
        "including their compiled form. Generating a form with the plugin does "
        "not by itself subject the form or user data to MPL. Material copied "
        "from the plugin retains its applicable license. Third-party "
        "material retains its own licenses: see dist/THIRD_PARTY.md, "
        "vendor/md_design/LICENSE.md and vendor/UPSTREAM.json.\n"
    )
    if dirty:
        source_notice += (
            "\nThis local build includes uncommitted changes. The link above identifies "
            "only the base commit; publish the modified source before redistribution.\n"
        )
    (plugin / "SOURCE.md").write_text(source_notice, encoding="utf-8")
    json_write(plugin / "build-info.json", {
        "plugin": "md-design", "version": version, "profile": profile,
        "revision": revision, "dirty": dirty, "runId": os.environ.get("GITHUB_RUN_ID"),
    })
    marketplace = output / "marketplace"
    catalog = json_read(ROOT / ".agents/plugins/marketplace.json")
    # A catalog becomes available only together with its built runtime.
    catalog["plugins"][0]["policy"]["installation"] = "AVAILABLE"
    json_write(marketplace / ".agents/plugins/marketplace.json", catalog)
    archive(plugin, output / f"md-design-{version}.zip", "md-design/")
    archive(marketplace, output / f"md-design-{version}-marketplace.zip")
    zips = sorted(output.glob("*.zip"))
    (output / "SHA256SUMS").write_text("".join(
        f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n" for file in zips
    ), encoding="utf-8")
    print(json.dumps({"plugin": str(plugin), "archives": [str(file) for file in zips]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Version for local packaging; release CI uses its triggering tag")
    args = parser.parse_args()
    package(ROOT / ".build", args.version)
