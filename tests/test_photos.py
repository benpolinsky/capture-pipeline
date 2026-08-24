from pathlib import Path

from PIL import Image

from capture_pipeline.photos import discover_photos, inspect_photo_set, summarize


def _write_jpeg(path: Path, size: tuple[int, int] = (100, 50)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size).save(path, format="JPEG")


def test_discover_photos_recurses_and_ignores_other_files(tmp_path: Path) -> None:
    _write_jpeg(tmp_path / "b.jpg")
    _write_jpeg(tmp_path / "nested" / "a.JPG")
    (tmp_path / "notes.txt").write_text("ignore me")

    photos = discover_photos(tmp_path)

    assert [photo.name for photo in photos] == ["b.jpg", "a.JPG"]


def test_inspect_and_summarize_megapixels(tmp_path: Path) -> None:
    _write_jpeg(tmp_path / "one.jpg", (1000, 500))
    _write_jpeg(tmp_path / "two.jpg", (2000, 1000))

    photos = inspect_photo_set(tmp_path)
    summary = summarize(photos)

    assert summary["count"] == 2
    assert summary["total_gigapixels"] == 0.003
    assert summary["gps_count"] == 0
    assert summary["needs_conversion_count"] == 0


def test_heic_is_discovered_but_flagged_for_conversion(tmp_path: Path) -> None:
    heic = tmp_path / "phone.heic"
    heic.write_bytes(b"not decoded during inspection")

    photos = inspect_photo_set(tmp_path)

    assert len(photos) == 1
    assert photos[0].needs_conversion is True
    assert photos[0].width is None
