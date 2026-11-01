// Makes the image fixtures MuPDF can't write: a HEIC photo and WebP images. Each is a 320 × 240 picture, white with
// its top-left quadrant red (like tests/helpers/pdf.ts), so a render shows which way up it is. Needs ffmpeg with
// libx265 and libwebp on the PATH; the outputs are committed, so this only runs to change them:
//   node tests/fixtures/make-images.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = import.meta.dirname;
const width = 320;
const height = 240;
const picture = `color=c=white:s=${width}x${height},drawbox=x=0:y=0:w=${width / 2}:h=${height / 2}:color=red:t=fill`;

function ffmpeg(...args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", picture, ...args]);
}

const work = mkdtempSync(join(tmpdir(), "plyleaf-fixtures-"));
try {
  ffmpeg("-frames:v", "1", "-c:v", "libwebp", "-lossless", "0", "-quality", "80", join(here, "photo.webp"));
  ffmpeg("-frames:v", "1", "-c:v", "libwebp", "-lossless", "1", join(here, "drawing.webp"));

  // One HEVC frame in an MP4, from which we take the decoder configuration (hvcC) and the frame's NAL units.
  const mp4Path = join(work, "frame.mp4");
  ffmpeg(
    "-frames:v",
    "1",
    "-c:v",
    "libx265",
    "-pix_fmt",
    "yuv420p",
    "-tag:v",
    "hvc1",
    "-x265-params",
    "log-level=error",
    mp4Path,
  );
  const mp4 = readFileSync(mp4Path);
  const hvcC = findBox(mp4, ["moov", "trak", "mdia", "minf", "stbl", "stsd"], "hvcC");
  const frame = findBox(mp4, [], "mdat").subarray(8);
  writeFileSync(join(here, "photo.heic"), heif(hvcC, frame));
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** The first box of `type` (header included) under the nested `path`, searching sample entries too. */
function findBox(data: Buffer, path: string[], type: string): Buffer {
  let scope = data;
  for (const step of [...path, type]) {
    const found = boxes(scope).find((b) => b.type === step) ?? deepFind(scope, step);
    if (!found) throw new Error(`No ${step} box`);
    scope = step === type ? found.whole : found.body;
  }
  return scope;
}

function boxes(data: Buffer) {
  const found: { type: string; whole: Buffer; body: Buffer }[] = [];
  for (let at = 0; at + 8 <= data.length;) {
    const size = data.readUInt32BE(at);
    if (size < 8 || at + size > data.length) break;
    found.push({
      type: data.toString("latin1", at + 4, at + 8),
      whole: data.subarray(at, at + size),
      body: data.subarray(at + 8, at + size),
    });
    at += size;
  }
  return found;
}

/** Finds a box inside something that isn't a plain box list (stsd's entries, the hvc1 sample entry). */
function deepFind(data: Buffer, type: string) {
  const at = data.indexOf(type, 0, "latin1");
  if (at < 4) return undefined;
  const size = data.readUInt32BE(at - 4);
  return { type, whole: data.subarray(at - 4, at - 4 + size), body: data.subarray(at + 4, at - 4 + size) };
}

function box(type: string, ...parts: Buffer[]) {
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}

function fullBox(type: string, version: number, ...parts: Buffer[]) {
  return box(type, Buffer.from([version, 0, 0, 0]), ...parts);
}

function u16(n: number) {
  return Buffer.from([n >> 8, n & 255]);
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function text(s: string) {
  return Buffer.from(s, "latin1");
}

/** A minimal HEIF file: one HEVC-coded image item, its configuration and size, and the coded data. */
function heif(hvcCBox: Buffer, data: Buffer) {
  const ftyp = box("ftyp", text("heic"), u32(0), text("mif1"), text("heic"));
  const meta = (offset: number) =>
    fullBox(
      "meta",
      0,
      fullBox("hdlr", 0, u32(0), text("pict"), Buffer.alloc(12), Buffer.from([0])),
      fullBox("pitm", 0, u16(1)),
      // offset and length are 4 bytes each, no base offset; one item with one extent.
      fullBox("iloc", 0, Buffer.from([0x44, 0x00]), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(data.length)),
      fullBox("iinf", 0, u16(1), fullBox("infe", 2, u16(1), u16(0), text("hvc1"), Buffer.from([0]))),
      box(
        "iprp",
        box("ipco", hvcCBox, fullBox("ispe", 0, u32(width), u32(height))),
        // Item 1 has property 1 (hvcC, essential) and property 2 (ispe).
        fullBox("ipma", 0, u32(1), u16(1), Buffer.from([2, 0x81, 0x02])),
      ),
    );
  const metaLength = meta(0).length;
  const offset = ftyp.length + metaLength + 8;
  return Buffer.concat([ftyp, meta(offset), box("mdat", data)]);
}
