#!/usr/bin/env python3
"""Derive the reviewed 64px Forge Warden raster from its selected source sheet.

The selected image-generation source is retained untouched for provenance. This
export is an authored import pass: it preserves the 4x4 pose order, applies one
fixed scale/anchor to every pose, removes generation fringe, and maps the art to
a controlled native-grid palette. The resulting Lua is the deterministic input
to ``build-boss-forge.lua`` and remains editable in the generated Pixelorama
project.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


FRAME_SIZE = 64
FRAME_COUNT = 16
GRID_SIZE = 4
CONTENT_WIDTH = 56
CONTENT_HEIGHT = 57
ALPHA_THRESHOLD = 160
EXPECTED_SOURCE_SIZE = (1239, 1269)
ANCHOR_X = 33
GROUND_Y = 58

# Charcoal/gunmetal, copper/heat, white-hot core, then cyan control-node marks.
PALETTE = (
    "#000000", "#0f1012", "#1c1d21", "#2b2d32", "#3d4046", "#555454",
    "#5c3a2c", "#7e4023", "#a9471c", "#d45118", "#f47116",
    "#ff9f22", "#ffcd52", "#ffeb9e", "#fff8d3",
    "#58dcde", "#acffef", "#2a9aa9",
)


def quantization_palette() -> Image.Image:
    image = Image.new("P", (1, 1))
    rgb = [component for color in PALETTE[:15] for component in bytes.fromhex(color[1:])]
    image.putpalette(rgb + [0] * (768 - len(rgb)))
    return image


def render_frames(source: Image.Image) -> list[Image.Image]:
    if source.size != EXPECTED_SOURCE_SIZE:
        raise SystemExit(f"unexpected Forge Warden source size: {source.size}")
    palette = quantization_palette()
    frames: list[Image.Image] = []
    for frame in range(FRAME_COUNT):
        column, row = frame % GRID_SIZE, frame // GRID_SIZE
        left = round(column * source.width / GRID_SIZE)
        right = round((column + 1) * source.width / GRID_SIZE)
        top = round(row * source.height / GRID_SIZE)
        bottom = round((row + 1) * source.height / GRID_SIZE)
        cell = source.crop((left, top, right, bottom)).resize(
            (CONTENT_WIDTH, CONTENT_HEIGHT), Image.Resampling.LANCZOS,
        )
        alpha = cell.getchannel("A").point(
            lambda value: 255 if value >= ALPHA_THRESHOLD else 0,
        )
        rgb = Image.new("RGB", cell.size, tuple(bytes.fromhex(PALETTE[0][1:])))
        rgb.paste(cell.convert("RGB"), mask=alpha)
        quantized = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
        cell = Image.merge("RGBA", (*quantized.split(), alpha))

        # The production brief calls for small cyan control nodes. They are a
        # deliberate native-grid addition, kept subordinate to the hot core.
        if frame < 12:
            pixels = cell.load()
            node_y = 26 + frame % 2
            pixels[31, node_y] = (*bytes.fromhex(PALETTE[15][1:]), 255)
            pixels[32, node_y] = (*bytes.fromhex(PALETTE[16][1:]), 255)
            pixels[31, node_y + 1] = (*bytes.fromhex(PALETTE[17][1:]), 255)

        opaque = [
            (x, y)
            for y in range(CONTENT_HEIGHT)
            for x in range(CONTENT_WIDTH)
            if cell.getpixel((x, y))[3] != 0
        ]
        if not opaque:
            raise SystemExit(f"Forge Warden frame {frame + 1} is empty")
        content_x = round(ANCHOR_X - sum(x for x, _ in opaque) / len(opaque))
        content_y = GROUND_Y - max(y for _, y in opaque)
        native = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        native.alpha_composite(cell, (content_x, content_y))
        if native.getchannel("A").getbbox() in (None, (0, 0, FRAME_SIZE, FRAME_SIZE)):
            raise SystemExit(f"Forge Warden frame {frame + 1} violated native-canvas margins")
        frames.append(native)
    return frames


def encode_lua(frames: list[Image.Image]) -> str:
    palette_index = {
        (*bytes.fromhex(color[1:]), 255): index
        for index, color in enumerate(PALETTE, start=1)
    }
    output = [
        "-- Native-grid Forge Warden restored from the selected provenance sheet.",
        "-- Generated deterministically by export-boss-forge-native-raster.py.",
        "return {",
        f"  size = {FRAME_SIZE},",
        "  palette = { " + ", ".join(f'\"{color}\"' for color in PALETTE) + " },",
        "  frames = {",
    ]
    for frame in frames:
        pixels = frame.load()
        output.append("    {")
        for y in range(FRAME_SIZE):
            runs: list[str] = []
            x = 0
            while x < FRAME_SIZE:
                color = pixels[x, y]
                if color[3] == 0:
                    x += 1
                    continue
                start = x
                while x + 1 < FRAME_SIZE and pixels[x + 1, y] == color:
                    x += 1
                try:
                    index = palette_index[color]
                except KeyError as error:
                    raise SystemExit(f"unmapped Forge Warden pixel {color}") from error
                runs.append(f"{start}:{x}:{index}")
                x += 1
            if runs:
                output.append(f'      [{y}] = "' + ";".join(runs) + '",')
        output.append("    },")
    output.extend(("  },", "}", ""))
    return "\n".join(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    source_path = root / "assets-src/enemies/boss-forge/source/boss-forge-imagegen.png"
    output_path = root / "assets-src/enemies/boss-forge/source/boss-forge-native-raster.lua"
    with Image.open(source_path) as source:
        encoded = encode_lua(render_frames(source.convert("RGBA")))
    if options.check:
        if output_path.read_text() != encoded:
            raise SystemExit("Forge Warden native raster is out of date with its selected source")
    else:
        output_path.write_text(encoded)


if __name__ == "__main__":
    main()
