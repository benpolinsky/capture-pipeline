# capture-pipeline

Mac-first command-line tooling for preparing building photo sets and sending them through Bentley iTwin Reality Management / Reality Modeling APIs.

## Direction

The pipeline is intentionally split into stages:

1. Inspect a local photo set and surface obvious capture/metadata problems.
2. Upload photos to iTwin Reality Management as `CCImageCollection` reality data.
3. Create or obtain the `CCOrientations` input required by Reality Modeling.
4. Create a Reality Modeling workspace and processing job.
5. Track processing and retrieve generated reality-model outputs.

The first implementation focuses on stages 1–2 so upload can be tested independently before submitting processing jobs.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

## Inspect photos

```bash
capture inspect ~/Pictures/building
```

The command reports photo count, measured gigapixels, available GPS metadata, camera/focal-length metadata, and HEIC/HEIF files that should be converted before upload.

For machine-readable output:

```bash
capture inspect ~/Pictures/building --json
```

## Upload to iTwin Reality Management

For the first development pass, the CLI accepts an existing Bentley user access token through `ITWIN_ACCESS_TOKEN`. Bentley API calls require the `itwin-platform` scope.

```bash
export ITWIN_ACCESS_TOKEN='...'
export ITWIN_ID='...'

capture upload ~/Pictures/building \
  --name 'Building exterior - August 2026'
```

Before touching Bentley, validate the command locally with:

```bash
capture upload ~/Pictures/building \
  --name 'Building exterior - August 2026' \
  --dry-run
```

`capture upload` creates `CCImageCollection` reality data, obtains a write SAS URL from Reality Management, uploads the photos to its Azure Blob container, and marks the reality data as no longer authoring when complete. It does **not** create or submit a Reality Modeling job.

HEIC/HEIF upload is intentionally blocked for now. Automatic conversion to JPEG is a good next addition for a Mac-first workflow.

## Reality Modeling caveat

Bentley's current Reality Modeling flow requires a `CCOrientations` input alongside the `CCImageCollection` for job creation. That orientation/calibration stage is the next pipeline milestone; the CLI does not pretend that raw image upload alone is enough to submit a valid modeling job.
