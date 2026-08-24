from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable

import httpx
from azure.storage.blob import ContainerClient

API_BASE = "https://api.bentley.com"
ACCEPT = "application/vnd.bentley.itwin-platform.v1+json"


class BentleyApiError(RuntimeError):
    pass


class BentleyClient:
    def __init__(self, access_token: str, *, timeout: float = 60.0) -> None:
        if not access_token.strip():
            raise ValueError("Bentley access token is empty")
        self._client = httpx.Client(
            base_url=API_BASE,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {access_token.strip()}",
                "Accept": ACCEPT,
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "BentleyClient":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def _json(self, response: httpx.Response) -> dict[str, object]:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text.strip()
            raise BentleyApiError(
                f"Bentley API returned {response.status_code}: {detail or response.reason_phrase}"
            ) from exc
        payload = response.json()
        if not isinstance(payload, dict):
            raise BentleyApiError("Bentley API returned an unexpected response")
        return payload

    def create_image_collection(self, *, itwin_id: str, display_name: str) -> dict[str, object]:
        payload = self._json(
            self._client.post(
                "/reality-management/reality-data/",
                json={
                    "iTwinId": itwin_id,
                    "displayName": display_name,
                    "classification": "Undefined",
                    "type": "CCImageCollection",
                    "authoring": True,
                },
            )
        )
        reality_data = payload.get("realityData", payload)
        if not isinstance(reality_data, dict) or not reality_data.get("id"):
            raise BentleyApiError("Create reality data response did not include an id")
        return reality_data

    def get_write_container_url(self, *, reality_data_id: str, itwin_id: str) -> str:
        payload = self._json(
            self._client.get(
                f"/reality-management/reality-data/{reality_data_id}/writeaccess",
                params={"iTwinId": itwin_id},
            )
        )
        container = payload.get("container", payload)
        try:
            return str(container["_links"]["containerUrl"]["href"])  # type: ignore[index]
        except (KeyError, TypeError) as exc:
            raise BentleyApiError("Write-access response did not include a container URL") from exc

    def finalize_reality_data(self, *, reality_data_id: str, itwin_id: str) -> dict[str, object]:
        payload = self._json(
            self._client.patch(
                f"/reality-management/reality-data/{reality_data_id}",
                json={"iTwinId": itwin_id, "authoring": False},
            )
        )
        reality_data = payload.get("realityData", payload)
        if not isinstance(reality_data, dict):
            raise BentleyApiError("Finalize response was not a reality data object")
        return reality_data


def upload_files(
    *,
    container_url: str,
    files: Iterable[Path],
    root: Path,
    prefix: str = "",
    on_uploaded: Callable[[Path, str], None] | None = None,
) -> int:
    resolved_root = root.expanduser().resolve()
    prefix = prefix.strip("/")
    container = ContainerClient.from_container_url(container_url)
    uploaded = 0

    for path in files:
        resolved = path.expanduser().resolve()
        if resolved_root.is_dir():
            relative = resolved.relative_to(resolved_root).as_posix()
        else:
            relative = resolved.name
        blob_name = f"{prefix}/{relative}" if prefix else relative

        with resolved.open("rb") as stream:
            container.upload_blob(name=blob_name, data=stream, overwrite=False)
        uploaded += 1
        if on_uploaded is not None:
            on_uploaded(resolved, blob_name)

    return uploaded
