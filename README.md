# capture-pipeline

Mac-first command-line tooling for preparing building photo sets and sending them through Bentley iTwin Reality Management / Reality Modeling APIs.

## Current scope

The pipeline is intentionally split into stages:

1. Inspect a local photo set and surface obvious capture/metadata problems.
2. Upload photos to iTwin Reality Management as `CCImageCollection` reality data.
3. Create or obtain the `CCOrientations` input required by Reality Modeling.
4. Create a Reality Modeling workspace and processing job.
5. Track processing and retrieve generated reality-model outputs.

This bootstrap implements stages 1–2 only. Uploading does **not** submit a Reality Modeling processing job.

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

## Authentication

Set your Bentley application client id:

```bash
export ITWIN_CLIENT_ID="your-client-id"
```

Then sign in:

```bash
capture auth
```

The CLI uses `@itwin/node-cli-authorization`, which opens the system browser for Authorization Code + PKCE and reuses its refresh-token cache on subsequent runs.

For CI or debugging, `ITWIN_ACCESS_TOKEN` can be supplied explicitly; when present it bypasses browser authentication.

Optional authentication settings:

```bash
export ITWIN_REDIRECT_URI="http://localhost:3000/signin-callback"
export ITWIN_SCOPE="itwin-platform"
```

## Inspect JPEGs

```bash
capture inspect /path/to/building-photos
```

Machine-readable output:

```bash
capture inspect /path/to/building-photos --json
```

## Upload a photo collection

Set the iTwin id once:

```bash
export ITWIN_ID="your-itwin-id"
```

Validate first without creating anything in Bentley:

```bash
capture upload /path/to/building-photos --name "Building exterior" --dry-run
```

Then upload:

```bash
capture upload /path/to/building-photos --name "Building exterior"
```

The command creates a `CCImageCollection`, obtains Bentley's Azure write-access URL, uploads the source photos, and marks the Reality Data as no longer authoring.

JPEG/JPG is supported in this first pass. HEIC/HEIF is detected but blocked from upload until we add and verify a conversion path.

## Environment

- `ITWIN_CLIENT_ID` — Bentley Desktop/Mobile application client id
- `ITWIN_ID` — default iTwin id
- `ITWIN_REDIRECT_URI` — optional localhost OAuth callback override
- `ITWIN_SCOPE` — optional OAuth scope override; defaults to `itwin-platform`
- `ITWIN_ACCESS_TOKEN` — optional explicit access token; bypasses browser auth
