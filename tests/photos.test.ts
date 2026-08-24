import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverPhotos, inspectPhotoSet, summarize } from "../src/photos.js";

test("discovers JPEGs recursively and ignores unrelated files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "capture-photos-"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "b.jpg"), minimalJpeg(4000, 3000));
  await writeFile(path.join(root, "nested", "a.jpeg"), minimalJpeg(2000, 1000));
  await writeFile(path.join(root, "notes.txt"), "ignore me");

  const files = await discoverPhotos(root);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((file) => path.basename(file)).sort(), ["a.jpeg", "b.jpg"]);
});

test("inspects JPEG dimensions and summarizes measured pixels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "capture-inspect-"));
  await writeFile(path.join(root, "one.jpg"), minimalJpeg(4000, 3000));
  await writeFile(path.join(root, "two.jpg"), minimalJpeg(4000, 3000));

  const photos = await inspectPhotoSet(root);
  assert.equal(photos.length, 2);
  assert.equal(photos[0]?.width, 4000);
  assert.equal(photos[0]?.height, 3000);

  const summary = summarize(photos);
  assert.equal(summary.count, 2);
  assert.equal(summary.measuredGigapixels, 0.024);
  assert.equal(summary.needsConversionCount, 0);
});

function minimalJpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}
