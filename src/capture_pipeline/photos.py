from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
CONVERT_FIRST_EXTENSIONS = {".heic", ".heif"}
DISCOVERABLE_EXTENSIONS = SUPPORTED_EXTENSIONS | CONVERT_FIRST_EXTENSIONS


@dataclass(frozen=True)
class PhotoInfo:
    path: Path
    width: int | None
    height: int | None
    camera_make: str | None
    camera_model: str | None
    focal_length_mm: float | None
    has_gps: bool
    needs_conversion: bool

    @property
    def megapixels(self) -> float | None:
        if self.width is None or self.height is None:
            return None
        return (self.width * self.height) / 1_000_000

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["path"] = str(self.path)
        payload["megapixels"] = self.megapixels
        return payload


def discover_photos(root: Path) -> list[Path]:
    root = root.expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Photo path does not exist: {root}")

    if root.is_file():
        candidates = [root]
    else:
        candidates = [path for path in root.rglob("*") if path.is_file()]

    photos = sorted(
        (path for path in candidates if path.suffix.lower() in DISCOVERABLE_EXTENSIONS),
        key=lambda path: str(path).lower(),
    )
    if not photos:
        raise ValueError(f"No supported photos found under {root}")
    return photos


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def inspect_photo(path: Path) -> PhotoInfo:
    suffix = path.suffix.lower()
    if suffix in CONVERT_FIRST_EXTENSIONS:
        return PhotoInfo(
            path=path,
            width=None,
            height=None,
            camera_make=None,
            camera_model=None,
            focal_length_mm=None,
            has_gps=False,
            needs_conversion=True,
        )

    with Image.open(path) as image:
        exif = image.getexif()
        make = exif.get(271)
        model = exif.get(272)
        focal_length = _as_float(exif.get(37386))
        gps = exif.get(34853)

        return PhotoInfo(
            path=path,
            width=image.width,
            height=image.height,
            camera_make=str(make).strip() if make else None,
            camera_model=str(model).strip() if model else None,
            focal_length_mm=focal_length,
            has_gps=bool(gps),
            needs_conversion=False,
        )


def inspect_photo_set(root: Path) -> list[PhotoInfo]:
    return [inspect_photo(path) for path in discover_photos(root)]


def summarize(photos: Iterable[PhotoInfo]) -> dict[str, object]:
    items = list(photos)
    measured = [photo for photo in items if photo.megapixels is not None]
    cameras = sorted(
        {
            " ".join(part for part in (photo.camera_make, photo.camera_model) if part).strip()
            for photo in items
            if photo.camera_make or photo.camera_model
        }
    )
    focal_lengths = sorted(
        {round(photo.focal_length_mm, 2) for photo in items if photo.focal_length_mm is not None}
    )

    return {
        "count": len(items),
        "total_gigapixels": round(sum(photo.megapixels or 0 for photo in measured) / 1000, 3),
        "gps_count": sum(1 for photo in items if photo.has_gps),
        "needs_conversion_count": sum(1 for photo in items if photo.needs_conversion),
        "cameras": cameras,
        "focal_lengths_mm": focal_lengths,
    }
