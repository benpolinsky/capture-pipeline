# capture-pipeline

Mac-first command-line tooling for preparing building photo sets and sending them through Bentley iTwin Reality Management / Reality Modeling APIs.

## Direction

The pipeline is intentionally split into stages:

1. Inspect a local photo set and surface obvious capture/metadata problems.
2. Upload photos to iTwin Reality Management as `CCImageCollection` reality data.
3. Create or obtain the `CCOrientations` input required by Reality Modeling.
4. Create a Reality Modeling workspace and processing job.
5. Track processing and retrieve generated reality-model outputs.

The first implementation focuses on stages 1–2 so upload can be tested independently before submitting billable processing jobs.

## Authentication

For the first development pass, the CLI accepts an existing Bentley user access token through `ITWIN_ACCESS_TOKEN`. Native OAuth login will replace this once the basic API flow is proven.

Bentley API calls require the `itwin-platform` scope.
