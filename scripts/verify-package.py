"""Verify downloaded artifact checksums and safely extract its marketplace ZIP."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from release_policy import VERSION_PATTERN, version_key


def verify(download: Path, destination: Path):
    entries = {}
    for line in (download / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(rf"([a-f0-9]{{64}})  (md-design-{VERSION_PATTERN}(?:-marketplace)?\.zip)", line)
        if not match or match[2] in entries:
            raise ValueError("Invalid or duplicate checksum entry")
        digest, name = match.groups()
        if hashlib.sha256((download / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"Checksum mismatch: {name}")
        entries[name] = digest
    if len(entries) != 2 or set(entries) != {file.name for file in download.glob("*.zip")}:
        raise ValueError("Expected exactly one plugin ZIP and one marketplace ZIP")
    name = next((name for name in entries if name.endswith("-marketplace.zip")), None)
    if not name or name.replace("-marketplace.zip", ".zip") not in entries:
        raise ValueError("Missing matching plugin/marketplace pair")
    if destination.exists():
        raise ValueError("Extraction destination already exists")
    with ZipFile(download / name) as archive:
        seen = set()
        size = 0
        for info in archive.infolist():
            path = PurePosixPath(info.filename)
            size += info.file_size
            canonical = path.as_posix()
            if (path.is_absolute() or ".." in path.parts or "\\" in info.filename
                    or ":" in info.filename or not path.parts
                    or info.filename != canonical or canonical.casefold() in seen
                    or any(part.endswith((".", " ")) for part in path.parts)
                    or (info.external_attr >> 16) & 0o170000 == 0o120000
                    or size > 100_000_000):
                raise ValueError("Unsafe ZIP entry")
            if not (info.filename == ".agents/plugins/marketplace.json" or info.filename.startswith("plugins/md-design/")):
                raise ValueError("Unexpected marketplace content")
            seen.add(canonical.casefold())
        catalog = json.loads(archive.read(".agents/plugins/marketplace.json"))
        if (catalog["name"] != "shadobaai-md-design" or len(catalog["plugins"]) != 1
                or catalog["plugins"][0]["name"] != "md-design"
                or catalog["plugins"][0]["source"] != {"source": "local", "path": "./plugins/md-design"}
                or catalog["plugins"][0]["policy"] != {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}):
            raise ValueError("Unexpected marketplace source")
        manifest = json.loads(archive.read("plugins/md-design/.codex-plugin/plugin.json"))
        build = json.loads(archive.read("plugins/md-design/build-info.json"))
        if (manifest["name"] != "md-design" or manifest["version"] != build["version"]
                or manifest["skills"] != "./skills/" or build["profile"] != "release"):
            raise ValueError("Inconsistent plugin identity")
        version_key(manifest["version"])
        if name != f"md-design-{manifest['version']}-marketplace.zip":
            raise ValueError("Archive name does not match the manifest version")
        with ZipFile(download / name.replace("-marketplace.zip", ".zip")) as plugin_zip:
            expected = {"md-design/" + file.removeprefix("plugins/md-design/"): archive.read(file)
                        for file in archive.namelist() if file.startswith("plugins/md-design/")}
            if len(plugin_zip.infolist()) != len(expected) or set(plugin_zip.namelist()) != set(expected):
                raise ValueError("Plugin ZIP and marketplace ZIP differ")
            for file, content in expected.items():
                if plugin_zip.getinfo(file).file_size != len(content) or plugin_zip.read(file) != content:
                    raise ValueError("Plugin ZIP and marketplace ZIP differ")
        archive.extractall(destination)
    return build


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("download", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.download, args.destination)))
