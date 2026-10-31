import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { renderWidth, thumbnails } from "~/thumbnails/thumbnails";

interface PageCanvasProps {
  docId: string;
  index: number;
  /** CSS pixels. The canvas fills its (positioned) parent, which should have the page's shape. */
  width: number;
  /** On screen now, so its render goes ahead of ones that are only near. */
  onScreen: boolean;
}

/** A page's image from the shared thumbnail cache, with a message if it can't be rendered. */
export function PageCanvas({ docId, index, width, onScreen }: PageCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pixels = renderWidth(width, window.devicePixelRatio);
  // Which render the outcome is for, so a new size reads as "rendering" again without resetting state in the effect.
  const key = `${docId}:${index}:${pixels}`;
  const [outcome, setOutcome] = useState<{ key: string; state: "ready" | "error" } | null>(null);
  const state = outcome?.key === key ? outcome.state : "rendering";

  // A layout effect, so an image that's already cached is painted before the browser shows the empty canvas.
  useLayoutEffect(() => {
    return thumbnails.request(
      docId,
      index,
      pixels,
      (image) => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        setOutcome({ key, state: "ready" });
      },
      () => setOutcome({ key, state: "error" }),
    );
  }, [docId, index, pixels, key]);

  // After the request above (layout effects run first), so there's a queued render to move up.
  useEffect(() => {
    if (onScreen) thumbnails.prioritise(docId, index, pixels);
  }, [docId, index, pixels, onScreen]);

  return (
    <>
      <canvas
        ref={ref}
        data-state={state}
        data-render-width={pixels}
        aria-hidden="true"
        className="absolute inset-0 size-full"
      />
      {state === "error" && (
        <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-ink-muted">
          Can't show this page
        </span>
      )}
    </>
  );
}
