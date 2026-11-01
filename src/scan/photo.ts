// Turning a photo (a picked file or a camera frame) into pixels on the page, with the browser's decoder: it applies
// EXIF orientation, and reads HEIC in Safari, where iPhone photos come from.
import type { Bitmap } from "~/engine/types";

/** Photos are scaled down to this on their longer side: plenty for a page at 250 dpi, and 36 MB of pixels at most. */
export const MAX_PHOTO_SIDE = 3000;

export async function decodePhoto(photo: Blob, maxSide = MAX_PHOTO_SIDE): Promise<Bitmap> {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    return { width, height, pixels: context.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

/** A frame of a playing video as a JPEG, as a camera app would save it. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: video.videoWidth,
    height: video.videoHeight,
  });
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("The camera frame couldn't be saved");
  return blob;
}
