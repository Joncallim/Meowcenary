#!/usr/bin/env python3
"""Import pinned 48x48 upgrade candidates through the native Pixelorama builder chain."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

import PIL
from PIL import Image

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = "assets-src/upgrade-icons/candidate-manifest.json"
SIZE = (48, 48)
IDS = (
    "quick-paws", "extra-scrap", "hot-barrel", "scrap-magnet", "reinforced-coat",
    "fast-learner", "heavy-rounds", "long-barrel", "split-shot", "punch-through",
    "glass-cannon", "run-and-gun", "pistol-deadeye", "pistol-needle-rounds",
    "smg-overclock", "smg-spray", "shotgun-buckshot", "shotgun-breacher",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def safe_path(root: Path, relative: str, boundary: str) -> Path:
    path = Path(relative)
    require(not path.is_absolute() and ".." not in path.parts, "candidate path must be relative without traversal")
    resolved_root = root.resolve()
    limit = (root / boundary).resolve()
    result = root / path
    require(limit.is_relative_to(resolved_root) and result.resolve().is_relative_to(limit),
            "candidate path escapes assets-src/upgrade-icons")
    return result


def load_manifest(root: Path) -> dict:
    path = safe_path(root, MANIFEST, "assets-src/upgrade-icons")
    doc = json.loads(path.read_text())
    require(doc.get("schemaVersion") == 1, "unsupported upgrade candidate manifest")
    require(doc.get("Pillow") == PIL.__version__ == "12.1.1", "upgrade candidate importer requires pinned Pillow 12.1.1")
    rows = doc.get("candidates")
    require(isinstance(rows, list) and [row.get("id") for row in rows] == list(IDS),
            "upgrade candidate IDs/order must match the active 18-card set")
    return doc


def binding_ids(root: Path) -> list[str]:
    doc = json.loads((root / "src/data/visual-art.json").read_text())
    return [row["id"] for row in doc["bindings"] if row.get("kind") == "upgrade-icon"]


def input_path(root: Path, upgrade_id: str) -> Path:
    return safe_path(root, f"assets-src/upgrade-icons/upgrade-icon-{upgrade_id}/source/candidate-48.png",
                     "assets-src/upgrade-icons")


def expected_input_rel(upgrade_id: str) -> str:
    return f"assets-src/upgrade-icons/upgrade-icon-{upgrade_id}/source/candidate-48.png"


def load_pixels(root: Path, row: dict) -> tuple[bytes, str]:
    require(row.get("path") == expected_input_rel(row["id"]),
            f"{row['id']}: candidate input path differs from the pinned source contract")
    path = input_path(root, row["id"])
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    require(digest == row.get("sha256"), f"{row['id']}: candidate PNG digest mismatch")
    with Image.open(path) as original:
        require(original.format == "PNG" and original.mode == "RGBA" and original.size == SIZE,
                f"{row['id']}: candidate must be a 48x48 RGBA PNG")
        image = original.copy()
    pixels = image.tobytes()
    require(len(pixels) == SIZE[0] * SIZE[1] * 4, f"{row['id']}: candidate RGBA byte length mismatch")
    # Pixelorama's transparent pixels retain RGB, so this exact byte stream can
    # round-trip through the builder harness without matte or palette changes.
    return pixels, digest


def lua_builder(upgrade_id: str, pixels: bytes) -> str:
    encoded = pixels.hex()
    chunks = [encoded[offset:offset + 120] for offset in range(0, len(encoded), 120)]
    values = ",\n    ".join(json.dumps(chunk) for chunk in chunks)
    return (
        f'EPIC18_UPGRADE_ICON_ART = {{\n'
        f'  savedAs = "assets-src/upgrade-icons/upgrade-icon-{upgrade_id}/source/upgrade-icon-{upgrade_id}.pxo",\n'
        f'  rgbaHex = table.concat({{\n    {values}\n  }}),\n'
        f'}}\n'
        f'dofile("docs/art/scripts/lib/epic18-upgrade-icon-art.lua")\n'
    )


def verify_builder(root: Path, upgrade_id: str, pixels: bytes) -> None:
    path = safe_path(root, f"docs/art/scripts/build-upgrade-icon-{upgrade_id}.lua", "docs/art/scripts")
    require(path.read_text() == lua_builder(upgrade_id, pixels),
            f"{upgrade_id}: Lua builder does not reproduce the pinned candidate RGBA bytes")


def read_native_body(path: Path, upgrade_id: str) -> tuple[bytes, bytes, dict]:
    try:
        with ZipFile(path) as archive:
            project = json.loads(archive.read("data.json"))
            body = archive.read("image_data/frames/1/layer_1")
            notes = archive.read("image_data/frames/1/layer_2")
    except (OSError, KeyError, json.JSONDecodeError) as error:
        raise ValueError(f"{upgrade_id}: invalid native Pixelorama project: {error}") from error
    require(project.get("pixelorama_version") == "v1.2-stable" and project.get("pxo_version") == 7,
            f"{upgrade_id}: native project is not a Pixelorama 1.2 project")
    require(project.get("size_x") == 48 and project.get("size_y") == 48,
            f"{upgrade_id}: native project canvas must remain 48x48")
    require(project.get("color_mode") == 5,
            f"{upgrade_id}: native project must use RGBA color mode")
    layers = project.get("layers", [])
    require([layer.get("name") for layer in layers] == ["body", "notes"],
            f"{upgrade_id}: native project must retain body and hidden notes layers")
    body_layer, notes_layer = layers
    require(body_layer.get("visible") is True and body_layer.get("opacity") == 1
            and body_layer.get("blend_mode") == 0 and body_layer.get("clipping_mask") is False
            and not body_layer.get("effects") and body_layer.get("type") == 0
            and body_layer.get("parent") == -1,
            f"{upgrade_id}: native body layer must be visible, opaque, normal-blend, and unmasked")
    require(notes_layer.get("visible") is False and notes_layer.get("opacity") == 1,
            f"{upgrade_id}: native notes layer must remain hidden and fully opaque")
    frames = project.get("frames", [])
    require(len(frames) == 1 and not project.get("tags"),
            f"{upgrade_id}: native project must remain a one-frame untagged icon")
    cels = frames[0].get("cels", [])
    require(frames[0].get("duration") == 1 and len(cels) == 2 and cels[0].get("opacity") == 1,
            f"{upgrade_id}: native project must have two ordered full-opacity cels on its only frame")
    return body, notes, project


def verify_native_project(path: Path, pixels: bytes, upgrade_id: str) -> bytes:
    body, notes, _ = read_native_body(path, upgrade_id)
    require(body == pixels and notes == bytes(48 * 48 * 4),
            f"{upgrade_id}: native project cels do not match pinned RGBA source and empty notes layer")
    return body


def verify_runtime_png(path: Path, pixels: bytes, upgrade_id: str) -> None:
    try:
        with Image.open(path) as image:
            require(image.format == "PNG" and image.mode == "RGBA" and image.size == SIZE,
                    f"{upgrade_id}: runtime export must be a 48x48 RGBA PNG")
            runtime_pixels = image.tobytes()
    except OSError as error:
        raise ValueError(f"{upgrade_id}: runtime PNG cannot be decoded: {error}") from error
    require(runtime_pixels == pixels, f"{upgrade_id}: runtime PNG pixels differ from the pinned source")


def export_native_png(project: Path, output: Path, upgrade_id: str) -> None:
    body, _, _ = read_native_body(project, upgrade_id)
    require(len(body) == SIZE[0] * SIZE[1] * 4, f"{upgrade_id}: native body cel is not RGBA8 48x48")
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.frombytes("RGBA", SIZE, body).save(output, format="PNG", optimize=False)


def expected_metadata(export_name: str) -> dict:
    # Pixelorama 1.2 static 48x48 image export metadata. Existing sidecars are
    # Pixelorama-authored and serve as the canonical schema template; its raw
    # digest is pinned so metadata tampering cannot silently redefine expected.
    template_path = ROOT / "public/assets/upgrade-icons/upgrade-icon-quick-paws/upgrade-icon-quick-paws.json"
    template_bytes = template_path.read_bytes()
    source_manifest = json.loads((ROOT / MANIFEST).read_text())
    template_pin = source_manifest["pixeloramaMetadataTemplate"]
    require(template_pin.get("path") == "public/assets/upgrade-icons/upgrade-icon-quick-paws/upgrade-icon-quick-paws.json"
            and hashlib.sha256(template_bytes).hexdigest() == template_pin.get("sha256"),
            "Pixelorama metadata template digest mismatch")
    doc = json.loads(template_bytes)
    doc["export_directory_path"] = ""
    doc["export_file_name"] = export_name
    return doc


def verify_manifest_and_bindings(root: Path, doc: dict) -> None:
    require(binding_ids(root) == [f"upgrade-icon:{upgrade_id}" for upgrade_id in IDS],
            "upgrade icon bindings must be exactly the active IDs in stable order")
    resources = json.loads((root / "src/data/visual-resources.json").read_text())
    active = {f"resource:upgrade-icon-{upgrade_id}" for upgrade_id in IDS}
    actual_resources = {row.get("id") for row in resources
                        if row.get("id", "").startswith("resource:upgrade-icon-")}
    require(actual_resources == active, "upgrade icon resources must exactly match the active ID set")
    upgrades = json.loads((root / "src/data/upgrades.json").read_text())
    require([row.get("id") for row in upgrades] == list(IDS),
            "upgrade definitions differ from the pinned 18-card art set")


def verify_one(root: Path, row: dict, check_pxo: bool) -> None:
    upgrade_id = row["id"]
    pixels, _ = load_pixels(root, row)
    verify_builder(root, upgrade_id, pixels)

    runtime_png = safe_path(root,
        f"public/assets/upgrade-icons/upgrade-icon-{upgrade_id}/upgrade-icon-{upgrade_id}.png", "public/assets")
    verify_runtime_png(runtime_png, pixels, upgrade_id)
    metadata_path = runtime_png.with_suffix(".json")
    actual_metadata = json.loads(metadata_path.read_text())
    require(actual_metadata == expected_metadata(f"upgrade-icon-{upgrade_id}"),
            f"{upgrade_id}: Pixelorama export metadata is not canonical for the native project")

    if check_pxo:
        project = safe_path(root,
            f"assets-src/upgrade-icons/upgrade-icon-{upgrade_id}/source/upgrade-icon-{upgrade_id}.pxo",
            "assets-src/upgrade-icons")
        require(project.is_file(), f"{upgrade_id}: missing native Pixelorama project")
        verify_native_project(project, pixels, upgrade_id)
        subprocess.run([
            "lua", "docs/art/scripts/validate-builders.lua", "--check-source", "--only",
            f"docs/art/scripts/build-upgrade-icon-{upgrade_id}.lua",
        ], cwd=root, check=True, stdout=subprocess.DEVNULL)


def write(root: Path, doc: dict) -> None:
    verify_manifest_and_bindings(root, doc)
    for row in doc["candidates"]:
        upgrade_id = row["id"]
        pixels, _ = load_pixels(root, row)
        builder_rel = f"docs/art/scripts/build-upgrade-icon-{upgrade_id}.lua"
        builder_path = root / builder_rel
        builder_path.write_text(lua_builder(upgrade_id, pixels))
        # This is the committed Pixelorama project writer. Do not hand-author or
        # rename a file to mimic the .pxo format.
        subprocess.run(["lua", "docs/art/scripts/validate-builders.lua", "--only", builder_rel, "--write"],
                       cwd=root, check=True)
        project = root / f"assets-src/upgrade-icons/upgrade-icon-{upgrade_id}/source/upgrade-icon-{upgrade_id}.pxo"
        runtime_png = root / f"public/assets/upgrade-icons/upgrade-icon-{upgrade_id}/upgrade-icon-{upgrade_id}.png"
        exported_pixels = verify_native_project(project, pixels, upgrade_id)
        export_native_png(project, runtime_png, upgrade_id)
        verify_runtime_png(runtime_png, exported_pixels, upgrade_id)
        metadata_path = runtime_png.with_suffix(".json")
        canonical = expected_metadata(f"upgrade-icon-{upgrade_id}")
        metadata_path.write_text(json.dumps(canonical, separators=(",", ":")) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="build Lua sources, native .pxo projects, and exports")
    mode.add_argument("--check", action="store_true", help="verify source, PXO, runtime pixels, metadata, and uniqueness")
    args = parser.parse_args()
    root = ROOT
    doc = load_manifest(root)
    verify_manifest_and_bindings(root, doc)
    if args.write:
        write(root, doc)
    for row in doc["candidates"]:
        verify_one(root, row, check_pxo=args.check or args.write)
    if args.check:
        hashes = [hashlib.sha256(load_pixels(root, row)[0]).hexdigest() for row in doc["candidates"]]
        require(len(set(hashes)) == len(IDS), "upgrade icon raster pixels must have unique hashes")
    print(f"Upgrade production art {'written' if args.write else 'verified'}: {len(IDS)} pinned native icons")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"Upgrade art import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
