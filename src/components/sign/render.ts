// Signatures as pictures: drawn strokes, typed names in a handwriting font, or a photo or scan of one, each made into
// a PNG with a transparent background, cut down to the ink. All on this page; nothing is sent anywhere.
import { clearPaper, inkBounds } from "~/sign/ink";

export interface SignatureImage {
  png: Uint8Array;
  /** In pixels. */
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Drawn signatures are kept at this many pixels per CSS pixel of the pad, so they print sharply. */
const DRAWN_SCALE = 3;
/** Typed signatures are drawn this many pixels tall. */
const TYPED_SIZE = 120;
/** A picture's longer side is brought down to this. */
const MAX_PICTURE = 1600;

/** Strokes drawn on a pad `size` CSS pixels big, as a picture. Null when nothing was drawn. */
export function fromStrokes(
  strokes: readonly (readonly Point[])[],
  size: { width: number; height: number },
  color: string,
  lineWidth = 2.5,
): Promise<SignatureImage | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size.width * DRAWN_SCALE);
  canvas.height = Math.ceil(size.height * DRAWN_SCALE);
  const context = canvas.getContext("2d")!;
  context.scale(DRAWN_SCALE, DRAWN_SCALE);
  drawStrokes(context, strokes, color, lineWidth);
  return finish(canvas, Math.ceil(lineWidth * DRAWN_SCALE));
}

/** Draws strokes smoothly: through the middles of their segments, with round ends; a single point is a dot. */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: readonly (readonly Point[])[],
  color: string,
  lineWidth: number,
) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const [first] = stroke;
    if (!first) continue;
    context.beginPath();
    if (stroke.length === 1) {
      context.arc(first.x, first.y, lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.length - 1; i++) {
      const [point, next] = [stroke[i]!, stroke[i + 1]!];
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = stroke.at(-1)!;
    context.lineTo(last.x, last.y);
    context.stroke();
  }
}

/** `text` written in `family` (a font the page has loaded or can load), as a picture. Null for no text. */
export async function fromText(text: string, family: string, color: string): Promise<SignatureImage | null> {
  if (!text.trim()) return null;
  const font = `${TYPED_SIZE}px "${family}"`;
  await document.fonts.load(font, text);
  const canvas = document.createElement("canvas");
  let context = canvas.getContext("2d")!;
  context.font = font;
  const width = context.measureText(text).width;
  // Room for flourishes that reach past the advance width and below the baseline.
  canvas.width = Math.ceil(width + TYPED_SIZE);
  canvas.height = Math.ceil(TYPED_SIZE * 2);
  context = canvas.getContext("2d")!;
  context.font = font;
  context.fillStyle = color;
  context.textBaseline = "alphabetic";
  context.fillText(text, TYPED_SIZE / 2, TYPED_SIZE * 1.3);
  return finish(canvas, 8);
}

/** A photo or scan of a signature as a picture; with `clear`, its paper taken out. Null if nothing's left. */
export async function fromPicture(file: Blob, clear: boolean): Promise<SignatureImage | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_PICTURE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (clear) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      clearPaper(data.data);
      context.putImageData(data, 0, 0);
    }
    return await finish(canvas, 4);
  } finally {
    bitmap.close();
  }
}

/** The canvas cut down to its ink (plus `margin` pixels), as a PNG. */
async function finish(canvas: HTMLCanvasElement, margin: number): Promise<SignatureImage | null> {
  const context = canvas.getContext("2d")!;
  const box = inkBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, {
    margin,
  });
  if (!box) return null;
  const cut = document.createElement("canvas");
  cut.width = box.width;
  cut.height = box.height;
  cut.getContext("2d")!.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  const blob = await new Promise<Blob | null>((resolve) => cut.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser couldn't make a PNG");
  return { png: new Uint8Array(await blob.arrayBuffer()), width: box.width, height: box.height };
}
