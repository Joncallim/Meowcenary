"""Package the unbound one-frame idle, not a production animation source."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json

folder = Path(__file__).resolve().parent
repository = folder.parents[5]
source = repository / "assets-src/characters/brass-boar/source/brass-boar.pxo"
raw = (folder / "brass-boar-idle-native.rgba").read_bytes()
assert len(raw) == 48 * 48 * 4
with ZipFile(source) as archive:
    project = json.loads(archive.read("data.json"))
project["name"] = "brass-boar-native-idle-candidate"
project["frames"] = project["frames"][:1]
project["tags"] = [{"name": "idle", "from": 1, "to": 1, "color": "d9ad5fff"}]
project["export_file_name"] = "brass-boar-idle-native"
project["export_directory_path"] = ""
with ZipFile(folder / "brass-boar-idle-native.pxo", "w") as archive:
    members = {"data.json": json.dumps(project).encode()}
    for layer in range(1, 7):
        members[f"image_data/frames/1/layer_{layer}"] = raw if layer == 1 else bytes(len(raw))
    for name, data in members.items():
        entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, data)
