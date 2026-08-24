#!/usr/bin/env node

import { parseArgs } from "node:util";
import { getAccessToken } from "./auth.js";
import { BentleyClient, uploadFiles } from "./bentley.js";
import { discoverPhotos, inspectPhotoSet, summarize } from "./photos.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "auth") {
    await getAccessToken();
    console.log("Authenticated with Bentley.");
    return;
  }

  if (command === "inspect") {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { json: { type: "boolean", default: false } },
    });
    const photoPath = requirePositional(positionals, "photo path");
    const photos = await inspectPhotoSet(photoPath);
    const summary = summarize(photos);

    if (values.json) {
      console.log(JSON.stringify({ summary, photos }, null, 2));
      return;
    }

    console.log(`Photos: ${summary.count}`);
    console.log(`Size: ${formatBytes(summary.totalBytes)}`);
    console.log(`Measured size: ${summary.measuredGigapixels} gigapixels`);
    console.log(`GPS-tagged: ${summary.gpsCount} / ${summary.count}`);
    if (summary.cameras.length) console.log(`Cameras: ${summary.cameras.join(", ")}`);
    if (summary.focalLengthsMm.length) {
      console.log(`Focal lengths: ${summary.focalLengthsMm.join(", ")} mm`);
    }
    if (summary.needsConversionCount) {
      console.log(`Needs conversion: ${summary.needsConversionCount} HEIC/HEIF photo(s)`);
    }
    return;
  }

  if (command === "upload") {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        name: { type: "string" },
        "itwin-id": { type: "string" },
        prefix: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    });

    const photoPath = requirePositional(positionals, "photo path");
    const name = values.name?.trim();
    if (!name) throw new Error("upload requires --name <display-name>.");

    const itwinId = values["itwin-id"]?.trim() || process.env.ITWIN_ID?.trim();
    if (!itwinId) throw new Error("Set ITWIN_ID or pass --itwin-id <id>.");

    const photos = await inspectPhotoSet(photoPath);
    const summary = summarize(photos);
    if (summary.needsConversionCount) {
      throw new Error(
        "HEIC/HEIF input is detected. Convert those files to JPEG before upload for now.",
      );
    }

    const files = await discoverPhotos(photoPath);
    console.log(`Ready to upload ${files.length} photos (${formatBytes(summary.totalBytes)}).`);
    if (values["dry-run"]) {
      console.log("Dry run complete; no Bentley resources were created.");
      return;
    }

    const token = await getAccessToken();
    const client = new BentleyClient(token);
    let realityDataId: string | undefined;

    try {
      const realityData = await client.createImageCollection(itwinId, name);
      realityDataId = realityData.id;
      console.log(`Created CCImageCollection: ${realityDataId}`);

      const containerUrl = await client.getWriteContainerUrl(realityDataId, itwinId);
      const uploaded = await uploadFiles({
        containerUrl,
        files,
        root: photoPath,
        prefix: values.prefix,
      });

      await client.finalizeRealityData(realityDataId, itwinId);
      console.log(`Uploaded ${uploaded} photos.`);
      console.log(`Reality data id: ${realityDataId}`);
      console.log("No Reality Modeling processing job was submitted.");
    } catch (error) {
      if (realityDataId) {
        console.error(
          `Upload stopped after creating reality data ${realityDataId}; it may remain authoring=true.`,
        );
      }
      throw error;
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function requirePositional(positionals: string[], label: string): string {
  const value = positionals[0]?.trim();
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function printHelp(): void {
  console.log(`capture-pipeline

Usage:
  capture auth
  capture inspect <photos> [--json]
  capture upload <photos> --name <name> [--itwin-id <id>] [--prefix <path>] [--dry-run]

Environment:
  ITWIN_CLIENT_ID      Bentley Desktop/Mobile application client id
  ITWIN_ID             Default iTwin id for uploads
  ITWIN_REDIRECT_URI   Optional localhost OAuth callback override
  ITWIN_SCOPE          Optional scope override (default: itwin-platform)
  ITWIN_ACCESS_TOKEN   Optional explicit token; bypasses browser auth
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
