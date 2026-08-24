# capture-pipeline

Mac-first command-line tooling for preparing building photo sets and sending them through Bentley iTwin Reality Management / Reality Modeling APIs.

## Current pipeline

1. Inspect a local photo set and surface obvious capture/metadata problems.
2. Upload photos to iTwin Reality Management as `CCImageCollection` reality data.
3. Run Reality Modeling v2 `FillImageProperties` to create a `ContextScene`.
4. Run `Calibration` to solve camera positions/orientations.
5. Run `Reconstruction` to produce a reality mesh/export (3D Tiles by default).

## Requirements

- macOS (the CLI should also work on Linux/Windows)
- Node.js 22+
- A Bentley iTwin Platform application registered as **Desktop/Mobile**
- The application's redirect URI configured for the local callback used by Bentley's CLI authorization client (default: `http://localhost:3000/signin-callback`)

## Install

```bash
npm install
npm run build
npm link
```

During development you can skip the build/link step and use `npm run capture -- ...`.

## Configuration with `.env`

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Typical production configuration:

```dotenv
ITWIN_CLIENT_ID=native-your-client-id
ITWIN_ID=your-itwin-id
ITWIN_ENV=prod
```

For Bentley QA:

```dotenv
ITWIN_CLIENT_ID=native-your-qa-client-id
ITWIN_ID=your-qa-itwin-id
ITWIN_ENV=qa
```

`ITWIN_ENV=qa` selects `https://qa-api.bentley.com` and `https://qa-ims.bentley.com`. Production is the default and uses the non-prefixed hosts.

`ITWIN_API_BASE_URL` and `ITWIN_ISSUER_URL` are available as escape hatches for nonstandard Bentley environments.

## Authentication

```bash
capture auth
```

The CLI uses `@itwin/node-cli-authorization`, which opens the system browser for Authorization Code + PKCE and reuses its refresh-token cache on subsequent runs. The OAuth scope is fixed to `itwin-platform`.

For CI or debugging, `ITWIN_ACCESS_TOKEN` can be supplied explicitly; when present it bypasses browser authentication.

## Inspect JPEGs

```bash
capture inspect /path/to/building-photos
```

Machine-readable output:

```bash
capture inspect /path/to/building-photos --json
```

## Upload a photo collection

Validate first without creating anything in Bentley:

```bash
capture upload /path/to/building-photos --name "Building exterior" --dry-run
```

Then upload:

```bash
capture upload /path/to/building-photos --name "Building exterior"
```

The command creates a `CCImageCollection`, obtains Bentley's Azure write-access URL, uploads the source photos, and marks the Reality Data as no longer authoring. Save the printed Reality Data id; that is the input to `capture process`.

JPEG/JPG is supported in this first pass. HEIC/HEIF is detected but blocked from upload until we add and verify a conversion path.

## Process an uploaded collection

This submits real Bentley Reality Modeling work and may consume processing units.

```bash
capture process <CCIMAGECOLLECTION_ID> --name "Building exterior"
```

The command runs `FillImageProperties`, waits for it to succeed, then runs `Calibration`, then `Reconstruction`. It requests a calibration report and textured tie points, and creates a 3D Tiles export plus a modeling reference.

Other supported output formats can be selected with `--format`, for example:

```bash
capture process <CCIMAGECOLLECTION_ID> --name "Building exterior" --format OBJ
```

Supported formats are `3DTiles`, `3MX`, `OBJ`, `LAS`, `PLY`, `OPC`, `OrthophotoDSM`, `I3S`, and `OSGB`.

## Check a job

```bash
capture status <JOB_ID>
```

For the raw Bentley response:

```bash
capture status <JOB_ID> --json
```

## Environment

- `ITWIN_CLIENT_ID` — Bentley Desktop/Mobile application client id
- `ITWIN_ID` — default iTwin id
- `ITWIN_ENV` — `prod` (default) or `qa`
- `ITWIN_REDIRECT_URI` — optional localhost OAuth callback override
- `ITWIN_ACCESS_TOKEN` — optional explicit access token; bypasses browser auth
- `ITWIN_API_BASE_URL` — optional Bentley API base URL override
- `ITWIN_ISSUER_URL` — optional Bentley OAuth issuer override
