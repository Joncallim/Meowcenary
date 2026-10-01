#!/usr/bin/env python3
"""Deterministically import pinned candidate tier masters and retained emblems.

Config owns source rectangles/resources; the presentation catalog owns frame
IDs. This importer neither invents art nor approves it.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = "assets-src/equipment/tiers/masters.json"
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def relative_path(root: Path, value: str) -> Path:
    require(isinstance(value, str) and bool(value), "Equipment path must be nonempty")
    path = Path(value)
    require(not path.is_absolute() and ".." not in path.parts, f"Equipment path must be relative: {value}")
    boundary = root.resolve()
    candidate = (boundary / path).resolve()
    require(candidate.is_relative_to(boundary), f"Equipment path escapes root: {value}")
    return candidate


def read_json(root: Path, value: str):
    return json.loads(relative_path(root, value).read_text())


def indexed(rows: list[dict], key: str, label: str) -> dict:
    require(isinstance(rows, list) and bool(rows), f"{label} must be a nonempty array")
    result = {}
    for row in rows:
        identity = row[key]
        require(isinstance(identity, str) and bool(identity), f"{label} has an invalid identity")
        require(identity not in result, f"Duplicate {label} identity: {identity}")
        result[identity] = row
    return result


def pinned_board(root: Path, source: dict) -> Image.Image:
    path = relative_path(root, source["path"])
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    require(actual == source["sha256"], f"Equipment master digest mismatch: {source['path']}")
    with Image.open(path) as image:
        require(image.mode == "RGBA", f"Equipment master must be RGBA: {source['path']}")
        require(list(image.size) == source["size"], f"Equipment master dimensions changed: {source['path']}")
        return image.copy()


def meaningful_alpha(board: Image.Image, threshold: int) -> Image.Image:
    return board.getchannel("A").point(lambda value: 255 if value > threshold else 0)


def tier_cells(board: Image.Image, master: dict, config: dict) -> list[list[Image.Image]]:
    """Require a complete partition at transparent separators, then trim dust.

    Alpha at/below the threshold is ignored only for bounds/separators; pixels
    inside each resulting silhouette remain untouched. A transparent cut line
    proves no meaningful alpha component crosses a cut.
    """
    label = master["setId"]
    rows = master["rows"]
    require([row["slot"] for row in rows] == config["slots"], f"Wrong slot rows: {label}")
    alpha = meaningful_alpha(board, config["meaningfulAlphaThreshold"])
    width, height = board.size
    for edge in ((0, 0, width, 1), (0, height - 1, width, height),
                 (0, 0, 1, height), (width - 1, 0, width, height)):
        require(alpha.crop(edge).getbbox() is None, f"Equipment silhouette touches master edge: {label}")
    cells = []
    next_y = 0
    for row in rows:
        rects = row["cropRects"]
        require(len(rects) == len(config["tiers"]), f"Wrong tier cell coverage: {label}/{row['slot']}")
        row_cells = []
        next_x = 0
        row_height = None
        for tier, rect in zip(config["tiers"], rects):
            require(isinstance(rect, list) and len(rect) == 4 and all(type(v) is int for v in rect),
                    f"Invalid Equipment crop rectangle: {label}/{row['slot']}/{tier}")
            x, y, w, h = rect
            require(x == next_x and y == next_y and w > 0 and h > 0
                    and x + w <= width and y + h <= height,
                    f"Equipment crop gap, overlap or out-of-bounds cell: {label}/{row['slot']}/{tier}")
            require(row_height is None or h == row_height, f"Uneven Equipment crop row: {label}/{row['slot']}")
            row_height = h
            if x:
                require(alpha.crop((x, y, x + 1, y + h)).getbbox() is None,
                        f"Equipment alpha crosses tier separator: {label}/{row['slot']}/{tier}")
            if y:
                require(alpha.crop((x, y, x + w, y + 1)).getbbox() is None,
                        f"Equipment alpha crosses slot separator: {label}/{row['slot']}/{tier}")
            bounds = alpha.crop((x, y, x + w, y + h)).getbbox()
            require(bounds is not None, f"Empty Equipment tier cell: {label}/{row['slot']}/{tier}")
            row_cells.append(board.crop((x, y, x + w, y + h)).crop(bounds))
            next_x += w
        require(next_x == width, f"Equipment crop row does not cover master: {label}/{row['slot']}")
        next_y += row_height
        cells.append(row_cells)
    require(next_y == height, f"Equipment crop rows do not cover master: {label}")
    return cells


def fit_tier_row(cells: list[Image.Image], frame_size: int, gutter: int) -> list[Image.Image]:
    available = frame_size - 2 * gutter
    scale = min(available / max(cell.width for cell in cells), available / max(cell.height for cell in cells))
    frames = []
    for cell in cells:
        # One scale per slot across all tiers preserves authored size progression.
        resized = cell.resize((max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
                              Image.Resampling.NEAREST)
        frame = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
        frame.alpha_composite(resized, ((frame_size - resized.width) // 2, (frame_size - resized.height) // 2))
        frames.append(frame)
    return frames


def fit_emblem(board: Image.Image, binding: dict, source: dict, frame_size: int, gutter: int) -> Image.Image:
    """Preserve the historic emblem crop and LANCZOS bytes exactly."""
    column, row = binding["column"], binding["row"]
    columns, rows = source["columns"], source["rows"]
    require(type(column) is int and type(row) is int and 0 <= column < columns and 0 <= row < rows,
            "Equipment emblem cell is outside its pinned board")
    cell = board.crop((round(column * board.width / columns), round(row * board.height / rows),
                       round((column + 1) * board.width / columns), round((row + 1) * board.height / rows)))
    bounds = cell.getchannel("A").getbbox()
    require(bounds is not None, "Equipment emblem cell is empty")
    cell = cell.crop(bounds)
    cell.thumbnail((frame_size - 2 * gutter, frame_size - 2 * gutter), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    frame.alpha_composite(cell, ((frame_size - cell.width) // 2, (frame_size - cell.height) // 2))
    return frame


def load(root: Path) -> tuple[dict, dict, dict, dict, dict, dict]:
    config = read_json(root, CONFIG_PATH)
    require(config["schemaVersion"] == 1 and config["status"] == "candidate", "Unsupported Equipment master config")
    require(config["slots"] == ["helmet", "armour", "gloves", "boots"] and config["tiers"] == [1, 2, 3, 4],
            "Equipment config must cover all four slots and tiers")
    require(type(config["frameSize"]) is int and config["frameSize"] == 96
            and type(config["gutter"]) is int and 0 < config["gutter"] < config["frameSize"] / 2,
            "Equipment frame size/gutter is invalid")
    require(type(config["meaningfulAlphaThreshold"]) is int and 0 <= config["meaningfulAlphaThreshold"] < 255,
            "Equipment alpha threshold is invalid")
    require(config["columns"] == 1 + len(config["slots"]) * len(config["tiers"]), "Equipment atlas columns mismatch")
    equipment = indexed(read_json(root, config["catalogs"]["equipment"]), "id", "Equipment catalog")
    sets = indexed(read_json(root, config["catalogs"]["sets"]), "id", "Equipment Set catalog")
    visuals = indexed(read_json(root, config["catalogs"]["visuals"]), "equipmentId", "Equipment presentation")
    masters = indexed(config["masters"], "setId", "Equipment master")
    sources = indexed(config["emblemSources"], "id", "Equipment emblem source")
    resources = indexed(config["resources"], "id", "Equipment resource")
    require(set(masters) == set(sets), "Equipment masters must exactly cover the active Set catalog")
    require(set(visuals) == set(equipment), "Equipment presentation must exactly cover the active Equipment catalog")
    resource_sets = [set_id for resource in resources.values() for set_id in resource["setIds"]]
    require(len(resource_sets) == len(sets) and set(resource_sets) == set(sets),
            "Equipment resources must cover every active Set exactly once")
    require(len({resource["name"] for resource in resources.values()}) == len(resources), "Duplicate Equipment resource name")
    slots = {}
    art_ids = [definition["emblem"] for definition in sets.values()]
    for definition in equipment.values():
        set_id, slot = definition["setId"], definition["slot"]
        require(set_id in sets and slot in config["slots"], f"Unknown Equipment Set/slot: {definition['id']}")
        require((set_id, slot) not in slots, f"Duplicate Equipment Set/slot: {set_id}/{slot}")
        slots[set_id, slot] = definition
        tiers = visuals[definition["id"]]["tiers"]
        require([tier["tier"] for tier in tiers] == config["tiers"], f"Wrong presentation tiers: {definition['id']}")
        require(tiers[0]["iconArtId"] == definition["icon"], f"Equipment T1 icon ID changed: {definition['id']}")
        art_ids.extend(tier["iconArtId"] for tier in tiers)
    require(set(slots) == {(set_id, slot) for set_id in sets for slot in config["slots"]},
            "Equipment catalog must cover all active Set/slot pairs")
    require(all(isinstance(art_id, str) and art_id for art_id in art_ids) and len(art_ids) == len(set(art_ids)),
            "Equipment atlas frame IDs must be nonempty and globally unique")
    require({master["emblem"]["sourceId"] for master in masters.values()} == set(sources),
            "Equipment emblem sources must exactly cover used sources")
    boards = {identity: pinned_board(root, source) for identity, source in sources.items()}
    return config, sets, visuals, masters, slots, boards


def metadata(name: str, atlas: Image.Image, ids: list[str], frame_size: int, columns: int) -> bytes:
    frames = {art_id: {"frame": {"x": (index % columns) * frame_size, "y": (index // columns) * frame_size,
                               "w": frame_size, "h": frame_size}} for index, art_id in enumerate(ids)}
    return (json.dumps({"export_directory_path": "", "export_file_name": name,
                        "size_x": atlas.width, "size_y": atlas.height, "frames": frames}, indent=2) + "\n").encode()


def project(name: str, atlas: Image.Image) -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0, "export_file_name": name, "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                    "locked": False, "name": "candidate Equipment tier import", "new_cels_linked": False,
                    "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": atlas.width, "size_y": atlas.height, "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def add_member(archive: ZipFile, name: str, payload: bytes) -> None:
    info = ZipInfo(name, ZIP_DATE)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def output_paths(resource: dict) -> tuple[str, str, str]:
    name = resource["name"]
    require(isinstance(name, str) and name and Path(name).name == name, "Equipment export name must be a basename")
    return (f"{resource['runtimeDirectory']}/{name}.png", f"{resource['runtimeDirectory']}/{name}.json",
            f"{resource['sourceDirectory']}/{name}.pxo")


def write(root: Path, output: Path) -> None:
    config, sets, visuals, masters, slots, boards = load(root)
    size, gutter, columns = config["frameSize"], config["gutter"], config["columns"]
    sources = {source["id"]: source for source in config["emblemSources"]}
    # Validate/import every source before creating any output file.
    imported = {}
    for set_id, master in masters.items():
        cells = tier_cells(pinned_board(root, master), master, config)
        imported[set_id] = [fit_tier_row(row, size, gutter) for row in cells]
    outputs = [(resource, tuple(relative_path(output, path) for path in output_paths(resource)))
               for resource in config["resources"]]
    paths = [path for _, resource_paths in outputs for path in resource_paths]
    require(len(paths) == len(set(paths)), "Equipment output paths must be unique")
    for resource, (png, meta, pxo) in outputs:
        atlas = Image.new("RGBA", (size * columns, size * len(resource["setIds"])), (0, 0, 0, 0))
        ids = []
        for row, set_id in enumerate(resource["setIds"]):
            master = masters[set_id]
            emblem = master["emblem"]
            frames = [fit_emblem(boards[emblem["sourceId"]], emblem, sources[emblem["sourceId"]], size, gutter)]
            ids.append(sets[set_id]["emblem"])
            for slot_index, slot in enumerate(config["slots"]):
                definition = slots[set_id, slot]
                frames.extend(imported[set_id][slot_index])
                ids.extend(tier["iconArtId"] for tier in visuals[definition["id"]]["tiers"])
            for column, frame in enumerate(frames):
                atlas.alpha_composite(frame, (column * size, row * size))
        for path in (png, meta, pxo):
            path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(png, optimize=True)
        meta.write_bytes(metadata(resource["name"], atlas, ids, size, columns))
        with ZipFile(pxo, "w") as archive:
            add_member(archive, "mimetype", b"application/x-pixelorama")
            add_member(archive, "data.json", project(resource["name"], atlas))
            add_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-equipment-") as directory:
        generated = Path(directory)
        write(root, generated)
        config = read_json(root, CONFIG_PATH)
        for resource in config["resources"]:
            for relative in output_paths(resource):
                path = relative_path(root, relative)
                require(path.is_file() and path.read_bytes() == (generated / relative).read_bytes(),
                        f"Equipment output is out of date: {relative}")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--check"]:
            check(ROOT)
        elif sys.argv[1:]:
            raise SystemExit("Usage: build-equipment-concept-atlases.py [--check]")
        else:
            write(ROOT, ROOT)
    except (OSError, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f"Invalid Equipment import inputs: {error}") from error
