// Watermark: words or a picture on every page (or from a page on), see-through and turned as asked.
import type { Edits, ImageMark, PageInfo, TextMark } from "~/engine/types";
import { CAP_HEIGHT, marksOnPages, placedText, type PageChoice, type Position, type TextStyle } from "./stamping";

export interface WatermarkOptions extends PageChoice {
  position: Position;
  margin: number;
  /** 0 to 1. */
  opacity: number;
  /** Degrees anticlockwise. */
  rotate: number;
  content:
    | { kind: "text"; text: string; style: TextStyle }
    /** `width`: the picture's width as a fraction of the page's; `aspect`: its height over its width. */
    | { kind: "image"; width: number; aspect: number };
}

export const DEFAULT_WATERMARK: Omit<WatermarkOptions, "content"> = {
  position: { vertical: "middle", horizontal: "center" },
  margin: 36,
  opacity: 0.3,
  rotate: 45,
  from: 1,
  startAt: 1,
};

/**
 * Words turned about their own middle, so turning doesn't move them off their place: the anchor (the baseline at the
 * aligned end) moves by the turned offset of the capitals' middle.
 */
function turnedText(mark: TextMark, rotate: number): TextMark {
  if (!rotate) return mark;
  const half = (mark.size * CAP_HEIGHT) / 2;
  const radians = (rotate * Math.PI) / 180;
  return {
    ...mark,
    x: mark.x + half * Math.sin(radians),
    y: mark.y - half + half * Math.cos(radians),
    rotate,
  };
}

/** A picture's box at a position on a page, `margin` in from the edges. */
function placedImage(
  page: Pick<PageInfo, "width" | "height">,
  options: WatermarkOptions,
  width: number,
  height: number,
): ImageMark {
  const { position, margin } = options;
  const x =
    position.horizontal === "left"
      ? margin
      : position.horizontal === "right"
        ? page.width - margin - width
        : (page.width - width) / 2;
  const y =
    position.vertical === "top"
      ? margin
      : position.vertical === "bottom"
        ? page.height - margin - height
        : (page.height - height) / 2;
  return { type: "image", image: 0, x, y, width, height, rotate: options.rotate, opacity: options.opacity };
}

/** The watermark as the engine's edits. A picture is Edits.images[0], which the caller adds. */
export function watermarkEdits(pages: readonly Pick<PageInfo, "width" | "height">[], options: WatermarkOptions): Edits {
  const { content } = options;
  return marksOnPages(pages, options, (page) => {
    if (content.kind === "image") {
      const width = page.width * content.width;
      return [placedImage(page, options, width, width * content.aspect)];
    }
    if (!content.text.trim()) return [];
    const mark = placedText(page, options.position, options.margin, content.style, content.text);
    return [{ ...turnedText(mark, options.rotate), opacity: options.opacity }];
  });
}
