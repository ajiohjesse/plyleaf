import { LINE_HEIGHT } from "~/engine/types";

const baselines = new Map<string, number>();

/**
 * How far below the top of a line box (line-height 1.2) the first baseline sits, as a fraction of the font size, for
 * the font this browser actually uses. Text is stored by its baseline, so the editor can place what it shows exactly
 * where the PDF will have it, whichever metric-compatible font stands in for Helvetica here.
 */
export function baselineRatio(font: { fontFamily: string; fontWeight: number; fontStyle: string }): number {
  const key = `${font.fontFamily}|${font.fontWeight}|${font.fontStyle}`;
  const known = baselines.get(key);
  if (known !== undefined) return known;
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "absolute",
    visibility: "hidden",
    left: "-9999px",
    top: "0",
    fontFamily: font.fontFamily,
    fontWeight: String(font.fontWeight),
    fontStyle: font.fontStyle,
    fontSize: "100px",
    lineHeight: String(LINE_HEIGHT),
    whiteSpace: "nowrap",
  });
  // An empty inline block sits with its bottom edge on the baseline.
  const marker = document.createElement("span");
  Object.assign(marker.style, { display: "inline-block", width: "1px", height: "0" });
  probe.append("Hg", marker);
  document.body.append(probe);
  const ratio = (marker.getBoundingClientRect().bottom - probe.getBoundingClientRect().top) / 100;
  probe.remove();
  baselines.set(key, ratio);
  return ratio;
}
