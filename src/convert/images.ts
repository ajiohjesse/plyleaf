// How Images to PDF lays images out on pages. Pure, so it's unit-tested without the engine.
import type { Fit, PageInfo } from "~/engine/types";

export type PageSize = "image" | "a4" | "letter";
export type Orientation = "auto" | "portrait" | "landscape";
export type Margin = "none" | "small" | "large";

export interface Layout {
  size: PageSize;
  orientation: Orientation;
  margin: Margin;
}

/** Portrait sizes in PDF points. */
const SIZES = { a4: { width: 595, height: 842 }, letter: { width: 612, height: 792 } } as const;
/** Margins in PDF points: none, a quarter inch, half an inch. */
const MARGINS: Record<Margin, number> = { none: 0, small: 18, large: 36 };

/**
 * The page an image's page goes on, or undefined to keep the image's own size. "auto" turns the page to match the
 * image (a landscape photo gets a landscape page).
 */
export function fitFor(page: Pick<PageInfo, "width" | "height">, layout: Layout): Fit | undefined {
  if (layout.size === "image") return undefined;
  const { width, height } = SIZES[layout.size];
  const landscape = layout.orientation === "auto" ? page.width > page.height : layout.orientation === "landscape";
  return landscape
    ? { width: height, height: width, margin: MARGINS[layout.margin] }
    : { width, height, margin: MARGINS[layout.margin] };
}
