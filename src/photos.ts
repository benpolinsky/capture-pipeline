import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".heic", ".heif"]);
const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg"]);

export interface PhotoInfo {
  path: string;
  bytes: number;
  width?: number;
  height?: number;
  make?: string;
  model?: string;
  focalLengthMm?: number;
  latitude?: number;
  longitude?: number;
  needsConversion: boolean;
}

export interface PhotoSummary {
  count: number;
  totalBytes: number;
  measuredGigapixels: number;
  gpsCount: number;
  needsConversionCount: number;
  cameras: string[];
  focalLengthsMm: number[];
}

export async function discoverPhotos(inputPath: string): Promise<string[]> {
  const resolved = path.resolve(inputPath);
  const info = await stat(resolved);

  if (info.isFile()) {
    if (!PHOTO_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      throw new Error(`Unsupported photo type: ${resolved}`);
    }
    return [resolved];
  }

  if (!info.isDirectory()) {
    throw new Error(`Not a file or directory: ${resolved}`);
  }

  const files: string[] = [];
  await walk(resolved, files);
  files.sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No JPEG/HEIC photos found in ${resolved}`);
  }

  return files;
}

async function walk(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile() && PHOTO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
}

export async function inspectPhotoSet(inputPath: string): Promise<PhotoInfo[]> {
  const files = await discoverPhotos(inputPath);
  const photos: PhotoInfo[] = [];

  for (const file of files) {
    const fileStat = await stat(file);
    const extension = path.extname(file).toLowerCase();
    const needsConversion = !JPEG_EXTENSIONS.has(extension);

    let metadata: Record<string, unknown> = {};
    let gps: { latitude?: number; longitude?: number } | undefined;
    try {
      metadata =
        (await exifr.parse(file, [
          "Make",
          "Model",
          "FocalLength",
          "ExifImageWidth",
          "ExifImageHeight",
          "ImageWidth",
          "ImageHeight",
        ])) ?? {};
      gps = await exifr.gps(file);
    } catch {
      // Metadata is advisory; an otherwise valid JPEG should still be inspectable/uploadable.
    }

    const jpegSize = JPEG_EXTENSIONS.has(extension) ? await readJpegDimensions(file) : undefined;
    const width =
      jpegSize?.width ?? numberValue(metadata.ExifImageWidth) ?? numberValue(metadata.ImageWidth);
    const height =
      jpegSize?.height ?? numberValue(metadata.ExifImageHeight) ?? numberValue(metadata.ImageHeight);

    photos.push({
      path: file,
      bytes: fileStat.size,
      width,
      height,
      make: stringValue(metadata.Make),
      model: stringValue(metadata.Model),
      focalLengthMm: numberValue(metadata.FocalLength),
      latitude: gps?.latitude,
      longitude: gps?.longitude,
      needsConversion,
    });
  }

  return photos;
}

export function summarize(photos: PhotoInfo[]): PhotoSummary {
  const cameras = new Set<string>();
  const focalLengths = new Set<number>();
  let pixels = 0;
  let gpsCount = 0;
  let needsConversionCount = 0;
  let totalBytes = 0;

  for (const photo of photos) {
    totalBytes += photo.bytes;
    if (photo.width && photo.height) pixels += photo.width * photo.height;
    if (photo.latitude !== undefined && photo.longitude !== undefined) gpsCount += 1;
    if (photo.needsConversion) needsConversionCount += 1;
    if (photo.focalLengthMm !== undefined) focalLengths.add(photo.focalLengthMm);

    const camera = [photo.make, photo.model].filter(Boolean).join(" ").trim();
    if (camera) cameras.add(camera);
  }

  return {
    count: photos.length,
    totalBytes,
    measuredGigapixels: Math.round((pixels / 1_000_000_000) * 1000) / 1000,
    gpsCount,
    needsConversionCount,
    cameras: [...cameras].sort(),
    focalLengthsMm: [...focalLengths].sort((a, b) => a - b),
  };
}

async function readJpegDimensions(file: string): Promise<{ width: number; height: number } | undefined> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(2 * 1024 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;

    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < data.length && data[offset] === 0xff) offset += 1;
      if (offset >= data.length) break;

      const marker = data[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (marker === 0xda) break;
      if (offset + 2 > data.length) break;

      const segmentLength = data.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > data.length) break;

      if (isStartOfFrame(marker) && segmentLength >= 7) {
        return {
          height: data.readUInt16BE(offset + 3),
          width: data.readUInt16BE(offset + 5),
        };
      }
      offset += segmentLength;
    }
  } finally {
    await handle.close();
  }

  return undefined;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
