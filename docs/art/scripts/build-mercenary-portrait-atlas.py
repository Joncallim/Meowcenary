#!/usr/bin/env python3
"""Build the shipped Mercenary portraits from approved character concepts.

The untouched selected board remains the provenance master.  This deterministic
crop turns the selected character masters into eight consistently framed, runtime-sized
cards and mirrors the result into an editable Pixelorama source plus Phaser
atlas export.  It intentionally does not regenerate or reinterpret the art.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


MERCENARIES = (
    "scrap-tabby",
    "bolt-hound",
    "volt-lynx",
    "brass-boar",
    "ember-cougar",
    "scrap-weasel",
    "rattle-raptor",
    "piston-ram",
)
FRAME_WIDTH = 150
FRAME_HEIGHT = 240
ZIP_DATE = (2020, 1, 1, 0, 0, 0)
APPROVED_MASTER_SHA256 = {
    "docs/art/concepts/epic-13/scrap-tabby-concept.png": "45fd3dbc077917e8afa41ee555f843d090f0fc37c4014d5cffdb13fccff750de",
    "docs/art/concepts/epic-13/bolt-hound-concept.png": "010836b007027a4e885ae63635dc7df0044cc5853eb11304bf637109cafffb64",
    "assets-src/characters/volt-lynx/concepts/volt-lynx-direction-a-selected.png": "ab84b83f729bdce701a50d50751bc04a1081dd3dd6b263127dfba50973aa5701",
    "assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png": "25cdc618848f853e8053d430e3ef0a8e1c26a699245f98e82d6d25e91bbbe729",
}


def approved_master(root: Path, relative: str) -> Path:
    path = root / relative
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = APPROVED_MASTER_SHA256[relative]
    if actual != expected:
        raise SystemExit(f"approved Mercenary portrait master digest mismatch for {relative}: expected {expected}, got {actual}")
    return path


def remove_light_backdrop(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    """Extract the opaque Epic 13 concept subject without touching its master."""
    pixels = []
    for red, green, blue, alpha in image.get_flattened_data():
        distance = ((red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2) ** 0.5
        matte = max(0, min(255, round((distance - 18) * 255 / 48)))
        pixels.append((red, green, blue, min(alpha, matte)))
    extracted = Image.new("RGBA", image.size)
    extracted.putdata(pixels)
    return extracted


def trim(image: Image.Image) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit("approved Mercenary crop contains no visible pixels")
    return image.crop(bounds)


def keep_dominant_subject(image: Image.Image) -> Image.Image:
    """Discard disconnected board callouts while preserving the actor."""
    width, height = image.size
    alpha = image.getchannel("A").tobytes()
    visited = bytearray(width * height)
    dominant: list[int] = []
    for start, value in enumerate(alpha):
        if value <= 8 or visited[start]:
            continue
        visited[start] = 1
        component = [start]
        pending = [start]
        while pending:
            index = pending.pop()
            x, y = index % width, index // width
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbor = ny * width + nx
                    if alpha[neighbor] > 8 and not visited[neighbor]:
                        visited[neighbor] = 1
                        component.append(neighbor)
                        pending.append(neighbor)
        if len(component) > len(dominant):
            dominant = component
    if not dominant:
        raise SystemExit("approved Mercenary crop contains no actor component")
    # Include the antialiased fringe around the selected opaque component.
    keep = bytearray(width * height)
    for index in dominant:
        keep[index] = 1
    pending = list(dominant)
    while pending:
        index = pending.pop()
        x, y = index % width, index // width
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            neighbor = ny * width + nx
            if keep[neighbor]:
                continue
            if alpha[neighbor] > 0:
                keep[neighbor] = 1
                pending.append(neighbor)
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source = image.tobytes()
    pixels = bytearray(len(source))
    for index, selected in enumerate(keep):
        if selected:
            offset = index * 4
            pixels[offset:offset + 4] = source[offset:offset + 4]
    output.frombytes(bytes(pixels))
    return output


def approved_portraits(root: Path) -> tuple[Image.Image, ...]:
    tabby = Image.open(approved_master(root, "docs/art/concepts/epic-13/scrap-tabby-concept.png")).convert("RGBA")
    hound = Image.open(approved_master(root, "docs/art/concepts/epic-13/bolt-hound-concept.png")).convert("RGBA")
    lynx = Image.open(approved_master(root, "assets-src/characters/volt-lynx/concepts/volt-lynx-direction-a-selected.png")).convert("RGBA")
    roster = Image.open(approved_master(root, "assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png")).convert("RGBA")
    if tabby.size != (1536, 1024) or hound.size != (1536, 1024) or lynx.size != (1774, 887) or roster.size != (1774, 887):
        raise SystemExit("an approved Mercenary concept master changed dimensions")

    # The first two approved concept sheets predate transparent provenance.
    # Crop only the large hero pose and derive its matte from the known paper
    # colour. Later selected masters already carry authoritative alpha.
    tabby_hero = remove_light_backdrop(tabby.crop((18, 18, 825, 1005)), (249, 245, 229))
    hound_hero = remove_light_backdrop(hound.crop((35, 642, 335, 990)), (247, 245, 241))
    # These bounds isolate the authored actors themselves.  The selected
    # boards contain neighbouring silhouettes and callout marks outside these
    # rectangles; column-sized crops allowed those marks to survive the alpha
    # trim and show up as stray shapes on the live cards.
    lynx_hero = lynx.crop((130, 40, 475, 860))

    # Selected Alpha 3 roster board, in authored order: Brass Boar, Ember
    # Cougar, Scrap Weasel, Rattle Raptor and Piston Ram.
    roster_bounds = (
        (0, 170, 410, 715),
        (385, 125, 715, 715),
        (675, 245, 1060, 715),
        (950, 210, 1420, 720),
        (1385, 130, 1774, 715),
    )
    roster_heroes = tuple(roster.crop(bounds) for bounds in roster_bounds)
    isolated = (tabby_hero, hound_hero, *(keep_dominant_subject(image) for image in (lynx_hero, *roster_heroes)))
    return tuple(trim(image) for image in isolated)


def render(root: Path) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_WIDTH * len(MERCENARIES), FRAME_HEIGHT), (0, 0, 0, 0))
    for index, portrait in enumerate(approved_portraits(root)):
        portrait.thumbnail((140, 228), Image.Resampling.LANCZOS)
        atlas.alpha_composite(
            portrait,
            (index * FRAME_WIDTH + (FRAME_WIDTH - portrait.width) // 2, (FRAME_HEIGHT - portrait.height) // 2),
        )
    return atlas


def atlas_json() -> bytes:
    frames = {
        f"character-portrait:{character_id}": {
            "frame": {"x": index * FRAME_WIDTH, "y": 0, "w": FRAME_WIDTH, "h": FRAME_HEIGHT}
        }
        for index, character_id in enumerate(MERCENARIES)
    }
    return (json.dumps({
        "export_directory_path": "",
        "export_file_name": "mercenary-portraits-atlas",
        "size_x": FRAME_WIDTH * len(MERCENARIES),
        "size_y": FRAME_HEIGHT,
        "frames": frames,
    }, indent=2) + "\n").encode()


def pixelorama_json() -> bytes:
    project = {
        "color_mode": 5,
        "current_frame": 0,
        "current_layer": 0,
        "export_directory_path": "",
        "export_file_format": 0,
        "export_file_name": "mercenary-portraits-atlas",
        "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{
            "animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
            "locked": False, "name": "selected portrait art", "new_cels_linked": False,
            "opacity": 1, "parent": -1, "type": 0, "visible": True,
        }],
        "pixelorama_version": "v1.2-stable",
        "pxo_version": 7,
        "size_x": FRAME_WIDTH * len(MERCENARIES),
        "size_y": FRAME_HEIGHT,
        "tags": {},
    }
    return (json.dumps(project, separators=(",", ":")) + "\n").encode()


def write_zip_member(archive: ZipFile, name: str, data: bytes) -> None:
    member = ZipInfo(name, ZIP_DATE)
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o100644 << 16
    archive.writestr(member, data)


def write_outputs(root: Path, output_root: Path) -> None:
    atlas = render(root)
    runtime = output_root / "public/assets/characters/identity"
    source = output_root / "assets-src/characters/identity/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "mercenary-portraits-atlas.png", optimize=True)
    (runtime / "mercenary-portraits-atlas.json").write_bytes(atlas_json())
    with ZipFile(source / "mercenary-portraits-atlas.pxo", "w") as archive:
        write_zip_member(archive, "mimetype", b"application/x-pixelorama")
        write_zip_member(archive, "data.json", pixelorama_json())
        write_zip_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-mercenary-portraits-") as directory:
        generated = Path(directory)
        write_outputs(root, generated)
        for relative in (
            "public/assets/characters/identity/mercenary-portraits-atlas.png",
            "public/assets/characters/identity/mercenary-portraits-atlas.json",
            "assets-src/characters/identity/source/mercenary-portraits-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Mercenary portrait output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-mercenary-portrait-atlas.py [--check]")
    else:
        write_outputs(repository, repository)
