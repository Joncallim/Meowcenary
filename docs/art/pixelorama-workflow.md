# Pixelorama Workflow

Pixelorama 1.2 is the source editor for Meowcenary production sprites. Native
projects live in `assets-src/` as `.pxo` files; Pixelorama exports the PNG sheets
and JSON project metadata consumed or verified by the runtime.

## Install on macOS

Install the official app from the Pixelorama release page, or use Homebrew:

```bash
brew install --cask pixelorama
```

Homebrew currently flags the cask because the app is not notarized. If macOS
quarantines this official download, open **System Settings → Privacy & Security**
and choose **Open Anyway** for Pixelorama. The expected executable is:

```text
/Applications/Pixelorama.app/Contents/MacOS/Pixelorama
```

## Rebuild and export Epic 13 assets

From the repository root:

```bash
docs/art/scripts/export-pixelorama.sh
```

The script first rebuilds all seven native `.pxo` projects from the deterministic
pixel builders, then asks Pixelorama to export one horizontal, untrimmed PNG
spritesheet and one JSON metadata file per project. Pixelorama names the JSON
after the project id and writes it beside the PNG. The wrapper removes only
Pixelorama's machine-specific absolute export-directory value from that JSON so
exports are reproducible across workstations. Set `PIXELORAMA_BIN` if the app
is installed elsewhere.

To validate builders without overwriting hand-polished projects:

```bash
lua docs/art/scripts/validate-builders.lua
```

Important: `export-pixelorama.sh` intentionally rebuilds `.pxo` sources. During
any later art pass, export the edited project from Pixelorama's UI first, then
mirror accepted edits back into the matching `build-<id>.lua` before running
the all-assets script again. That keeps the checked-in builder and native source
aligned without erasing in-progress visual work.

## Visual review session

1. Open a `.pxo` file under `assets-src/<kind>/<id>/source/`.
2. Set the canvas to 100% or a crisp integer zoom; keep smoothing disabled.
3. Use the timeline tags to review `idle`, `run`, `hurt`, and `defeat` (or the
   prop-specific `fly`/`idle` tag). Playback is set to 8 FPS by default.
4. Keep the existing canvas size, frame count, tag ranges, and layer names.
   `notes` remains hidden. Character `weapon` and `shadow` layers remain hidden
   and empty until their owning systems are implemented.
5. Polish silhouettes and motion against `epic-13-sprite-design.md` and the
   concept boards. Check at native size, not only while enlarged.
6. Save the `.pxo`, update its matching builder, then run the export script.
7. Review the PNG in the real 390×844 game viewport before accepting the pass.

The generated proving art passed the Epic 13 AI-led taste review at the real
390×844 viewport. Pixelorama remains authoritative for future pixel edits; the
builder is authoritative for repeatability. Human review is optional, not a
delivery dependency.
