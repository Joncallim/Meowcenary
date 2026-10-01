#!/usr/bin/env python3
"""Import exact pinned Figma SVGs at intrinsic size; never redraw their paths."""
from __future__ import annotations

import base64
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET
from xml.sax.saxutils import quoteattr
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import cairosvg
from cairosvg.surface import PNGSurface
import PIL
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
CONFIG = "assets-src/ui/figma/sources.json"
OUTPUTS = ("public/assets/ui/figma/figma-menu-chrome.png", "public/assets/ui/figma/figma-menu-chrome.json",
           "assets-src/ui/figma/source/figma-menu-chrome.pxo")
SVG_NS = "http://www.w3.org/2000/svg"
ZIP_DATE = (2026, 1, 1, 0, 0, 0)
IDS = ("ui-chrome:figma-card", "ui-chrome:figma-selected", "ui-chrome:figma-primary",
       "ui-chrome:figma-rivet", "ui-chrome:figma-arrow", "brand:figma-home-lockup")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def local_path(root: Path, relative: str, within: str) -> Path:
    require(isinstance(relative, str) and relative and not Path(relative).is_absolute()
            and ".." not in Path(relative).parts, "Figma source path must be relative without traversal")
    path = root / relative
    boundary = (root / within).resolve()
    require(boundary.is_relative_to(root.resolve()) and path.resolve().is_relative_to(boundary),
            "Figma source path escapes its source directory")
    return path


def number(value: str) -> float:
    require(isinstance(value, str) and re.fullmatch(r"\d+(?:\.\d+)?", value) is not None,
            "Figma SVG dimensions must be intrinsic numeric pixels")
    result = float(value)
    require(math.isfinite(result) and 0 < result <= 4096, "Figma SVG dimensions are invalid")
    return result


def safe_svg(payload: bytes, source: dict) -> tuple[float, float]:
    require(source["mime"] == "image/svg+xml", "Figma source MIME must be image/svg+xml")
    require(source["path"].endswith(".svg"), "Figma source must have an SVG extension")
    require(0 < len(payload) <= 2_000_000, "Figma SVG source is empty or oversized")
    require(re.search(br"<!\s*(?:DOCTYPE|ENTITY)", payload, re.I) is None, "Figma SVG entities/DOCTYPE are forbidden")
    root = ET.fromstring(payload)
    require(root.tag == f"{{{SVG_NS}}}svg", "Figma source is not an SVG root")
    require({key: root.attrib.get(key) for key in ("width", "height", "viewBox")} == source["root"],
            "Figma SVG root dimensions changed")
    # Inspect resource references and metadata only, never interpret path geometry.
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        require(tag not in {"script", "foreignObject", "image", "feImage", "animate", "set"},
                "Figma SVG contains an executable or external-resource element")
        for key, value in element.attrib.items():
            name = key.rsplit("}", 1)[-1].lower()
            require(not name.startswith("on"), "Figma SVG event attributes are forbidden")
            if name in {"href", "base", "src"}:
                require(name == "href" and re.fullmatch(r"#[a-zA-Z_][\w:.-]*", value) is not None,
                        "Figma SVG external resources are forbidden")
            for reference in re.findall(r"url\s*\((.*?)\)", value, re.I):
                require(re.fullmatch(r"#[a-zA-Z_][\w:.-]*", reference.strip().strip("\"'")) is not None,
                        "Figma SVG external CSS resources are forbidden")
        if tag == "style":
            css = "".join(element.itertext())
            require("@import" not in css.lower(), "Figma SVG CSS imports are forbidden")
            for reference in re.findall(r"url\s*\((.*?)\)", css, re.I):
                require(re.fullmatch(r"#[a-zA-Z_][\w:.-]*", reference.strip().strip("\"'")) is not None,
                        "Figma SVG external CSS resources are forbidden")
    return number(root.attrib["width"]), number(root.attrib["height"])


def load_sources(root: Path) -> tuple[dict, dict]:
    config = json.loads(local_path(root, CONFIG, "assets-src/ui/figma").read_text())
    require(config["schemaVersion"] == 1 and config["status"] == "candidate", "Unsupported Figma source config")
    require(config["rasterizer"] == {"CairoSVG": cairosvg.__version__, "Pillow": PIL.__version__},
            "Figma rasterizer versions differ from pinned requirements")
    require(config["rasterizer"] == {"CairoSVG": "2.9.1", "Pillow": "12.1.1"}, "Unsupported Figma rasterizer pins")
    require([frame["id"] for frame in config["frames"]] == list(IDS), "Figma chrome must cover its exact six logical IDs")
    sources = {}
    source_paths = set()
    for source in config["sources"]:
        identity = source["id"]
        require(identity not in sources, "Duplicate Figma source identity")
        path = local_path(root, source["path"], "assets-src/ui/figma/originals")
        require(path.resolve() not in source_paths, "Duplicate Figma source path")
        source_paths.add(path.resolve())
        payload = path.read_bytes()
        # Validate security/MIME before digest comparison, including repinned fixtures.
        width, height = safe_svg(payload, source)
        require(hashlib.sha256(payload).hexdigest() == source["sha256"], f"Figma SVG source digest mismatch: {identity}")
        uri = "data:image/svg+xml;base64," + base64.b64encode(payload).decode("ascii")
        sources[identity] = {"payload": payload, "width": width, "height": height, "uri": uri}
    used = {layer["sourceId"] for frame in config["frames"] for layer in frame["layers"]}
    require(used == set(sources), "Figma source/layer coverage must be exact")
    return config, sources


def render_frame(frame: dict, sources: dict) -> Image.Image:
    width, height = frame["size"]
    require(type(width) is int and type(height) is int and 0 < width <= 4096 and 0 < height <= 4096,
            "Invalid Figma frame canvas")
    allowed = {source["uri"]: source["payload"] for source in sources.values()}
    def fetch(url: str, _resource_type: str) -> bytes:
        require(url in allowed, "Figma rasterization attempted an external resource")
        return allowed[url]
    layers = []
    for layer in frame["layers"]:
        source = sources[layer["sourceId"]]
        x, y = layer["offset"]
        require(all(type(value) in (int, float) and math.isfinite(value) for value in (x, y)),
                "Invalid Figma layer offset")
        require(x >= 0 and y >= 0 and x + source["width"] <= width and y + source["height"] <= height,
                "Figma layer is clipped by its frame canvas")
        layers.append(f'<image x="{x}" y="{y}" width="{source["width"]}" height="{source["height"]}" href={quoteattr(source["uri"])} />')
    # Compose whole original SVG images. Root SVG dimensions and paths are unchanged.
    wrapper = f'<svg xmlns="{SVG_NS}" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{"".join(layers)}</svg>'
    png = PNGSurface.convert(bytestring=wrapper.encode(), url_fetcher=fetch)
    with Image.open(BytesIO(png)) as image:
        result = image.convert("RGBA")
    require(result.size == (width, height) and result.getchannel("A").getbbox() is not None, "Figma frame raster is empty/wrong-sized")
    return result


def render(root: Path) -> tuple[Image.Image, bytes, bytes]:
    config, sources = load_sources(root)
    frames = [(frame, render_frame(frame, sources)) for frame in config["frames"]]
    gutter = 2
    width = sum(image.width + gutter * 2 for _, image in frames)
    height = max(image.height for _, image in frames) + gutter * 2
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    rects = {}
    x = gutter
    for frame, image in frames:
        atlas.alpha_composite(image, (x, gutter))
        rects[frame["id"]] = {"frame": {"x": x, "y": gutter, "w": image.width, "h": image.height}}
        x += image.width + gutter * 2
    meta = (json.dumps({"export_directory_path": "", "export_file_name": "figma-menu-chrome",
                       "size_x": width, "size_y": height, "frames": rects}, indent=2) + "\n").encode()
    project = (json.dumps({"color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0, "export_file_name": "figma-menu-chrome", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
            "locked": False, "name": "candidate Figma menu chrome import", "new_cels_linked": False,
            "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7, "size_x": width, "size_y": height, "tags": {}},
        separators=(",", ":")) + "\n").encode()
    return atlas, meta, project


def write(root: Path, output: Path) -> None:
    atlas, metadata, project = render(root)
    png, meta, pxo = [output / path for path in OUTPUTS]
    for path in (png, meta, pxo):
        require(path.resolve().is_relative_to(output.resolve()), "Figma output path escapes output root")
        path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(png, optimize=True)
    meta.write_bytes(metadata)
    with ZipFile(pxo, "w") as archive:
        for name, payload in (("mimetype", b"application/x-pixelorama"), ("data.json", project),
                              ("image_data/frames/1/layer_1", atlas.tobytes())):
            entry = ZipInfo(name, ZIP_DATE)
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, payload)


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-figma-chrome-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in OUTPUTS:
            path = root / relative
            require(path.resolve().is_relative_to(root.resolve()), "Figma output path escapes output root")
            require(path.is_file() and path.read_bytes() == (generated / relative).read_bytes(),
                    f"Figma chrome output is out of date: {relative}")
        with Image.open(root / OUTPUTS[0]) as image, ZipFile(root / OUTPUTS[2]) as archive:
            require(archive.read("image_data/frames/1/layer_1") == image.convert("RGBA").tobytes(),
                    "Figma Pixelorama/source pixels disagree with PNG")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--check"]: check(ROOT)
        elif sys.argv[1:]: raise ValueError("Usage: build-figma-menu-chrome.py [--check]")
        else: write(ROOT, ROOT)
    except (OSError, ValueError, KeyError, TypeError, ET.ParseError) as error:
        raise SystemExit(f"Figma menu chrome import rejected: {error}") from None
