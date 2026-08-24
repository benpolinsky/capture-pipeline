from __future__ import annotations

import json
import os
from pathlib import Path

import typer

from capture_pipeline.bentley import BentleyApiError, BentleyClient, upload_files
from capture_pipeline.photos import discover_photos, inspect_photo_set, summarize

app = typer.Typer(
    no_args_is_help=True,
    help="Prepare and upload building photo sets for Bentley iTwin reality capture.",
)


def _fail(message: str) -> None:
    typer.echo(f"Error: {message}", err=True)
    raise typer.Exit(code=1)


@app.command("inspect")
def inspect_command(
    photo_path: Path = typer.Argument(..., exists=True, readable=True),
    as_json: bool = typer.Option(False, "--json", help="Print machine-readable JSON."),
) -> None:
    """Inspect a local photo set before uploading it."""
    try:
        photos = inspect_photo_set(photo_path)
    except (FileNotFoundError, ValueError, OSError) as exc:
        _fail(str(exc))

    summary = summarize(photos)
    if as_json:
        typer.echo(
            json.dumps(
                {
                    "summary": summary,
                    "photos": [photo.to_dict() for photo in photos],
                },
                indent=2,
            )
        )
        return

    typer.echo(f"Photos: {summary['count']}")
    typer.echo(f"Measured size: {summary['total_gigapixels']} gigapixels")
    typer.echo(f"GPS-tagged: {summary['gps_count']} / {summary['count']}")

    cameras = summary["cameras"]
    if cameras:
        typer.echo(f"Cameras: {', '.join(cameras)}")

    focal_lengths = summary["focal_lengths_mm"]
    if focal_lengths:
        typer.echo(f"Focal lengths: {', '.join(str(value) for value in focal_lengths)} mm")

    if summary["needs_conversion_count"]:
        typer.echo(
            f"Needs conversion before upload: {summary['needs_conversion_count']} HEIC/HEIF photo(s)"
        )


@app.command("upload")
def upload_command(
    photo_path: Path = typer.Argument(..., exists=True, readable=True),
    itwin_id: str = typer.Option(..., "--itwin-id", envvar="ITWIN_ID"),
    name: str = typer.Option(..., "--name", help="Display name for the CCImageCollection."),
    prefix: str = typer.Option("images", "--prefix", help="Blob path prefix for uploaded photos."),
    access_token: str | None = typer.Option(
        None,
        "--access-token",
        envvar="ITWIN_ACCESS_TOKEN",
        hidden=True,
    ),
    dry_run: bool = typer.Option(False, "--dry-run", help="Validate without creating cloud data."),
) -> None:
    """Upload a photo set as CCImageCollection reality data."""
    try:
        photos = inspect_photo_set(photo_path)
    except (FileNotFoundError, ValueError, OSError) as exc:
        _fail(str(exc))

    summary = summarize(photos)
    if summary["needs_conversion_count"]:
        _fail(
            "HEIC/HEIF input is detected but automatic conversion is not implemented yet. "
            "Convert those files to JPEG first so we do not upload an unverified Bentley input format."
        )

    files = discover_photos(photo_path)
    typer.echo(
        f"Ready to upload {len(files)} photos ({summary['total_gigapixels']} measured gigapixels)."
    )
    if dry_run:
        typer.echo("Dry run complete; no Bentley resources were created.")
        return

    token = access_token or os.environ.get("ITWIN_ACCESS_TOKEN")
    if not token:
        _fail("Set ITWIN_ACCESS_TOKEN to a Bentley user access token with itwin-platform scope.")

    reality_data_id: str | None = None
    try:
        with BentleyClient(token) as client:
            reality_data = client.create_image_collection(itwin_id=itwin_id, display_name=name)
            reality_data_id = str(reality_data["id"])
            typer.echo(f"Created CCImageCollection: {reality_data_id}")

            container_url = client.get_write_container_url(
                reality_data_id=reality_data_id,
                itwin_id=itwin_id,
            )

            uploaded = upload_files(
                container_url=container_url,
                files=files,
                root=photo_path,
                prefix=prefix,
            )
            client.finalize_reality_data(
                reality_data_id=reality_data_id,
                itwin_id=itwin_id,
            )
    except (BentleyApiError, OSError, ValueError) as exc:
        if reality_data_id:
            typer.echo(
                f"Upload stopped after creating reality data {reality_data_id}; it may remain authoring=true.",
                err=True,
            )
        _fail(str(exc))

    typer.echo(f"Uploaded {uploaded} photos.")
    typer.echo(f"Reality data id: {reality_data_id}")
    typer.echo("No Reality Modeling processing job was submitted.")


if __name__ == "__main__":
    app()
