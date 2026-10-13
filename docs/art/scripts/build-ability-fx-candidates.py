#!/usr/bin/env python3
"""Bounded source-only native pixel FX candidates. Never writes runtime assets."""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import PIL
from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
PREFIX = "assets-src/ability-effects/candidates/"
SOURCE = "assets-src/ability-effects/source.json"
SIZE = 128
ZIP_DATE = (2020, 1, 1, 0, 0, 0)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, names, label):
    require(isinstance(value, dict) and set(value) == set(names), f"{label}: missing/unknown fields")


def integer(value, low, high, label):
    require(type(value) is int and low <= value <= high, label)


def read_bounded(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit, "bounded regular input required")
        with os.fdopen(os.dup(fd), "rb") as stream:
            data = stream.read(limit + 1)
        require(len(data) <= limit, "input exceeded bound")
        return data
    finally:
        os.close(fd)


def validate(source, root):
    fields(source, ["schemaVersion", "candidateStatus", "nativeSize", "provenance", "palette", "effects"], "source")
    require(source["schemaVersion"] == 1 and source["candidateStatus"] == "unapproved" and source["nativeSize"] == SIZE, "unapproved native128 source required")
    fields(source["provenance"], ["method", "author", "created", "thirdPartySources"], "provenance")
    require(source["provenance"]["thirdPartySources"] == [], "no third-party source admission")
    for key in ("method", "author", "created"):
        require(isinstance(source["provenance"][key], str) and 0 < len(source["provenance"][key]) <= 300, "provenance text")
    palette = source["palette"]
    require(isinstance(palette, dict) and 3 <= len(palette) <= 32, "bounded palette")
    for key, value in palette.items():
        require(re.fullmatch(r"[A-Za-z][A-Za-z0-9-]{0,23}", key) and isinstance(value, str) and re.fullmatch(r"#[0-9a-f]{6}ff", value), "opaque native palette colour")
    abilities = {row["id"]: row for row in json.loads(read_bounded(root / "src/data/abilities.json", 65536))}
    require(isinstance(source["effects"], list) and 1 <= len(source["effects"]) <= 8, "one to eight existing effects")
    slugs, ids, count = set(), set(), 0
    for effect in source["effects"]:
        fields(effect, ["slug", "abilityId", "cue", "title", "layers", "sequences"], "effect")
        require(isinstance(effect["slug"], str) and len(effect["slug"]) <= 41 and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", effect["slug"]) and effect["slug"] not in slugs, "unique safe slug")
        require(effect["abilityId"] in abilities and effect["abilityId"] not in ids, "existing unique ability")
        slugs.add(effect["slug"]); ids.add(effect["abilityId"])
        ability = abilities[effect["abilityId"]]
        require(effect["cue"] == ability["presentation"]["cue"], "cue differs from current authority")
        require(isinstance(effect["title"], str) and 0 < len(effect["title"]) <= 100, "title")
        require(effect["layers"] == ["silhouette", "material", "light-edge", "flecks"], "editable layer contract")
        persistent = ability["effect"]["kind"] in ("stat-burst", "invulnerable")
        require(isinstance(effect["sequences"], list) and [row.get("name") for row in effect["sequences"]] == (["activation", "sustained"] if persistent else ["activation"]), "sequence/mechanic classification")
        for sequence in effect["sequences"]:
            fields(sequence, ["name", "frameMs", "reducedMotionFrame", "frames"], "sequence")
            require(isinstance(sequence["frames"], list) and 1 <= len(sequence["frames"]) <= 8, "one to eight sequence frames")
            integer(sequence["frameMs"], 1, 1000, "cosmetic frameMs")
            integer(sequence["reducedMotionFrame"], 0, len(sequence["frames"]) - 1, "reduced frame")
            duration = sequence["frameMs"] * len(sequence["frames"])
            require((300 if sequence["name"] == "activation" else 50) <= duration <= 1000, "cosmetic traversal duration")
            for frame in sequence["frames"]:
                fields(frame, effect["layers"], "frame layers")
                for commands in frame.values():
                    require(isinstance(commands, list) and len(commands) <= 128, "bounded native commands")
                    for command in commands:
                        fields(command, ["op", "color", "points", "width"], "pixel command")
                        require(command["op"] in ("rect", "line", "polygon") and command["color"] in palette, "pixel operation/palette")
                        integer(command["width"], 1, 8, "stroke width")
                        require(isinstance(command["points"], list) and 2 <= len(command["points"]) <= 32, "bounded points")
                        require(command["op"] != "polygon" or len(command["points"]) >= 3, "polygon points")
                        require(command["op"] != "rect" or len(command["points"]) == 2, "rectangle points")
                        for point in command["points"]:
                            require(isinstance(point, list) and len(point) == 2, "pixel coordinate")
                            for coord in point: integer(coord, 0, SIZE - 1, "native coordinate")
                count += 1
    require(count <= 128, "128 native frame ceiling")


def load_source(root):
    require(PIL.__version__ == "12.1.1", "source exporter requires repository Pillow12.1.1")
    source = json.loads(read_bounded(root / SOURCE, 2 * 1024 * 1024))
    validate(source, root)
    return source


def frames(effect):
    return [{"id": f"effect:{effect['slug']}:{sequence['name']}-{index}", "layers": frame,
             "frameMs": sequence["frameMs"], "sequence": sequence["name"]}
            for sequence in effect["sequences"] for index, frame in enumerate(sequence["frames"])]


def frame_file(identity):
    return identity.replace(":", "--") + ".png"


def render_frame(source, effect, frame):
    layers = []
    for name in effect["layers"]:
        image = Image.new("RGBA", (SIZE, SIZE)); draw = ImageDraw.Draw(image)
        for command in frame[name]:
            points = [tuple(point) for point in command["points"]]; color = source["palette"][command["color"]]
            if command["op"] == "polygon": draw.polygon(points, fill=color)
            elif command["op"] == "line": draw.line(points, fill=color, width=command["width"])
            else: draw.rectangle(points, fill=color)
        layers.append(image)
    return layers


def composite(layers):
    image = Image.new("RGBA", (SIZE, SIZE))
    for layer in layers: image.alpha_composite(layer)
    return image


def png(image):
    output = io.BytesIO(); image.save(output, format="PNG", optimize=False)
    return output.getvalue()


def native_project(effect, rendered):
    native_layers = [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {}, "locked": False,
                      "name": name, "new_cels_linked": False, "opacity": 1, "parent": -1, "type": 0, "visible": True} for name in effect["layers"]]
    native_layers.append({**native_layers[0], "name": "notes", "visible": False})
    tags, start = [], 1
    for sequence in effect["sequences"]:
        tags.append({"color": "62a0eaff", "from": start, "name": sequence["name"], "to": start + len(sequence["frames"]) - 1})
        start += len(sequence["frames"])
    project = {"color_mode": 5, "current_frame": 0, "current_layer": 0, "export_directory_path": "", "export_file_format": 0,
               "export_file_name": effect["slug"], "fps": 10, "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0} for _ in native_layers], "duration": frame["frameMs"] / 100} for frame in frames(effect)],
               "layers": native_layers, "pixelorama_version": "v1.2-stable", "pxo_version": 7, "size_x": SIZE, "size_y": SIZE, "tags": tags}
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        members = {"mimetype": b"application/x-pixelorama", "data.json": json.dumps(project, separators=(",", ":")).encode()}
        for index, layers in enumerate(rendered, 1):
            for layer, image in enumerate(layers, 1): members[f"image_data/frames/{index}/layer_{layer}"] = image.tobytes()
            members[f"image_data/frames/{index}/layer_{len(native_layers)}"] = bytes(SIZE * SIZE * 4)
        for name, raw in members.items():
            info = ZipInfo(name, ZIP_DATE); info.compress_type = ZIP_DEFLATED; info.external_attr = 0o100644 << 16
            archive.writestr(info, raw)
    return buffer.getvalue()


def preview(root, source, images, index, reduced=False):
    # Source-only compositor. Current authority supplies scale; art has no radius.
    abilities = {row["id"]: row for row in json.loads((root / "src/data/abilities.json").read_text())}
    characters = json.loads((root / "src/data/characters.json").read_text())
    bindings = {row["id"]: row for row in json.loads((root / "src/data/visual-art.json").read_text())["bindings"]}
    resources = {row["id"]: row for row in json.loads((root / "src/data/visual-resources.json").read_text())}
    zoom = float(re.search(r"export const GAMEPLAY_ZOOM = ([0-9.]+);", (root / "src/ui/layout.ts").read_text())[1])
    columns, cell_width, cell_height = 4, 440, 480
    rows = math.ceil(len(source["effects"]) / columns)
    board = Image.new("RGBA", (columns * cell_width, 30 + rows * cell_height * 2), "#101820")
    labels = ImageDraw.Draw(board)
    label = "REDUCED-MOTION STATIC SOURCE FRAMES" if reduced else "LOOPED SOURCE ANIMATION AUDITION" if index else "FIRST DRAW / PEAK SOURCE FRAMES"
    labels.text((12, 8), f"UNAPPROVED / {label} / CURRENT DATA SCALE / NOT GAMEPLAY OR OWNER ACCEPTANCE", fill="#fff5d4")
    for biome, floor_id in enumerate(("world:junkyard-floor:base", "world:forge-floor:base")):
        binding = bindings[floor_id]; resource = resources[binding["resourceId"]]["load"]
        floor = Image.open(root / "public" / resource["imageUrl"]).convert("RGBA")
        if "frameKey" in binding:
            rect = json.loads((root / "public" / resource["dataUrl"]).read_text())["frames"][binding["frameKey"]]["frame"]
            floor = floor.crop((rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"]))
        tile_size = round(binding["display"]["width"] * zoom)
        tile = floor.resize((tile_size, tile_size), Image.Resampling.NEAREST)
        for slot, effect in enumerate(source["effects"]):
            left = slot % columns * cell_width
            top = 30 + (biome * rows + slot // columns) * cell_height
            for y in range(top, top + cell_height - 10, tile_size):
                for x in range(left, left + cell_width, tile_size):
                    crop = tile.crop((0, 0, min(tile_size, left + cell_width - x), min(tile_size, top + cell_height - 10 - y)))
                    board.alpha_composite(crop, (x, y))
            center = (left + cell_width // 2, top + 245); ability = abilities[effect["abilityId"]]
            radius = ability["effect"].get("radius", ability["presentation"].get("visualRadius"))
            diameter = round(radius * 2 * zoom)
            require(diameter <= cell_width - 40, "preview cell cannot crop or shrink a current effect footprint")
            character = next(row for row in characters if row.get("abilityId") == effect["abilityId"])
            actor_binding = bindings[f"character:{character['id']}"]; actor_resource = resources[actor_binding["resourceId"]]["load"]
            actor = Image.open(root / "public" / actor_resource["imageUrl"]).convert("RGBA").crop((0, 0, actor_resource["frameWidth"], actor_resource["frameHeight"]))
            actor_size = round(actor_binding["display"]["width"] * zoom)
            actor = actor.resize((actor_size, actor_size), Image.Resampling.NEAREST)
            selected = index % len(images[effect["slug"]])
            if reduced:
                sequence = effect["sequences"][-1]
                offset = sum(len(s["frames"]) for s in effect["sequences"][:-1])
                selected = offset + sequence["reducedMotionFrame"]
            image = images[effect["slug"]][selected].resize((diameter, diameter), Image.Resampling.NEAREST)
            board.alpha_composite(image, (center[0] - diameter // 2, center[1] - diameter // 2))
            board.alpha_composite(actor, (center[0] - actor_size // 2, center[1] - actor_size // 2))
            labels.rectangle((left + 5, top + 5, left + cell_width - 6, top + 35), fill="#17202b")
            labels.text((left + 12, top + 10), f"{ability['name']} / {'JUNKYARD' if biome == 0 else 'FORGE'}", fill="#fff5d4")
            labels.text((left + 12, top + cell_height - 28), f"art {diameter}px; actor {actor_size}px; native frame {selected}; decorative art only", fill="#fff5d4", stroke_width=1, stroke_fill="#17202b")
    return board


def build(root):
    source = load_source(root); outputs = {}; all_frames = []; images = {}; recipes = []
    for effect in source["effects"]:
        rendered = [render_frame(source, effect, frame["layers"]) for frame in frames(effect)]
        images[effect["slug"]] = [composite(layers) for layers in rendered]
        outputs[PREFIX + effect["slug"] + ".pxo"] = native_project(effect, rendered)
        for frame, image in zip(frames(effect), images[effect["slug"]]):
            alpha = image.getchannel("A"); coverage = sum(value > 0 for value in alpha.get_flattened_data())
            require(60 < coverage < SIZE * SIZE * .3, "bounded open-interior pixel coverage")
            require(image.crop((46, 44, 82, 84)).getbbox() is None, "actor interior must remain transparent")
            outputs[PREFIX + "frames/" + frame_file(frame["id"])] = png(image); all_frames.append((frame["id"], image))
        row = {"abilityId": effect["abilityId"], "candidateStatus": "unapproved", "cue": effect["cue"], "fx": {}}
        for sequence in effect["sequences"]:
            row["fx"][sequence["name"]] = {"frameArtIds": [f"effect:{effect['slug']}:{sequence['name']}-{i}" for i in range(len(sequence["frames"]))], "frameMs": sequence["frameMs"], "reducedMotionFrame": sequence["reducedMotionFrame"]}
        recipes.append(row)
    atlas_frames = {}
    for page_index in range(math.ceil(len(all_frames) / 64)):
        page = Image.new("RGBA", (1024, 1024))
        for slot, (identity, image) in enumerate(all_frames[page_index * 64:(page_index + 1) * 64]):
            x, y = slot % 8 * SIZE, slot // 8 * SIZE; page.alpha_composite(image, (x, y))
            atlas_frames[identity] = {"page": page_index, "frame": {"x": x, "y": y, "w": SIZE, "h": SIZE}, "rotated": False, "trimmed": False, "pivot": {"x": 0.5, "y": 0.5}, "spriteSourceSize": {"x": 0, "y": 0, "w": SIZE, "h": SIZE}, "sourceSize": {"w": SIZE, "h": SIZE}}
        outputs[PREFIX + f"atlas-{page_index}.png"] = png(page)
        page_frames = {key: {k: v for k, v in frame.items() if k != "page"} for key, frame in atlas_frames.items() if frame["page"] == page_index}
        page_export = {"frames": page_frames, "meta": {"image": f"atlas-{page_index}.png", "size": {"w": 1024, "h": 1024}, "scale": "1", "format": "RGBA8888", "candidateStatus": "unapproved"}}
        outputs[PREFIX + f"atlas-{page_index}.json"] = (json.dumps(page_export, indent=2) + "\n").encode()
    outputs[PREFIX + "atlas.json"] = (json.dumps({"candidateStatus": "unapproved", "frames": atlas_frames}, indent=2) + "\n").encode()
    outputs[PREFIX + "recipes.json"] = (json.dumps(recipes, indent=2) + "\n").encode()
    outputs[PREFIX + "all-eight-biomes.png"] = png(preview(root, source, images, 0))
    outputs[PREFIX + "all-eight-reduced-static.png"] = png(preview(root, source, images, 0, reduced=True))
    animation = [preview(root, source, images, index).convert("RGB") for index in range(8)]
    gif = io.BytesIO(); animation[0].save(gif, format="GIF", save_all=True, append_images=animation[1:], duration=100, loop=0, optimize=False, disposal=2)
    outputs[PREFIX + "all-eight-biomes.gif"] = gif.getvalue()
    # Native contact sheet stays pixel-exact at integer 2x nearest scaling.
    contact = Image.new("RGBA", (4 * 256, sum(math.ceil(len(images[e["slug"]]) / 4) for e in source["effects"]) * 284), "#17202b")
    draw = ImageDraw.Draw(contact); row = 0
    for effect in source["effects"]:
        for index, image in enumerate(images[effect["slug"]]):
            x, y = index % 4 * 256, (row + index // 4) * 284
            contact.alpha_composite(image.resize((256, 256), Image.Resampling.NEAREST), (x, y + 24))
            draw.text((x + 6, y + 7), f"{effect['slug']} / {frames(effect)[index]['sequence']} {index % 4}", fill="#fff5d4")
        row += math.ceil(len(images[effect["slug"]]) / 4)
    outputs[PREFIX + "native-contact.png"] = png(contact)
    report = {"candidateStatus": "unapproved", "provenance": source["provenance"], "Pillow": PIL.__version__, "nativeFrames": len(all_frames), "atlasPages": math.ceil(len(all_frames) / 64), "nativeSize": SIZE,
              "sourceSha256": hashlib.sha256(read_bounded(root / SOURCE, 2 * 1024 * 1024)).hexdigest(), "builderSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "outputs": [{"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)} for path, raw in sorted(outputs.items())]}
    outputs[PREFIX + "provenance.json"] = (json.dumps(report, indent=2) + "\n").encode()
    return outputs


def output_paths(root, outputs):
    paths = []
    boundary = root / PREFIX
    require(boundary.resolve().is_relative_to(root.resolve()), "candidate output boundary escape")
    for relative in outputs:
        require(relative.startswith(PREFIX) and ".." not in Path(relative).parts and not Path(relative).is_absolute(), "output outside candidate boundary")
        path = root / relative
        for parent in [path, *path.parents]:
            if parent == root: break
            require(not parent.is_symlink(), "candidate output symlink")
        require(path.resolve().is_relative_to((root / PREFIX).resolve()), "candidate output escape")
        paths.append(path)
    return paths


def publish(root, outputs):
    paths = output_paths(root, outputs)
    # Fresh exclusive package only; a failed write leaves no successful return.
    # No cleanup of paths potentially owned by another writer and no overwrite.
    boundary = root / PREFIX
    boundary.parent.mkdir(parents=True, exist_ok=True)
    boundary.mkdir()
    for path, raw in zip(paths, outputs.values()):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream: stream.write(raw)


def check(root, outputs):
    output_paths(root, outputs)
    boundary = root / PREFIX
    require(not boundary.is_symlink(), "candidate directory cannot be a symlink")
    actual = {str(path.relative_to(root)) for path in boundary.rglob("*") if path.is_file() or path.is_symlink()}
    require(actual == set(outputs), "candidate output inventory drift")
    for path, raw in outputs.items():
        require(read_bounded(root / path, len(raw)) == raw, f"candidate drift: {path}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[3]
    try:
        require(sys.argv[1:] in (["--write"], ["--check"]), "Usage: build-ability-fx-candidates.py --write | --check")
        outputs = build(root)
        (publish if sys.argv[1] == "--write" else check)(root, outputs)
        print(f"Unapproved candidate outputs verified: {len(outputs)}; no runtime writes")
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
