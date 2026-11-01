import { useEffect, useId, useRef, useState } from "react";
import { CORNER_NAMES, isConvex, moveCorner, WHOLE, type Quad } from "~/scan/quad";

interface Props {
  /** The photo, as the browser shows it (EXIF orientation applied). */
  photo: Blob;
  quad: Quad;
  /** What detection found, to go back to; null when it found nothing. */
  detected: Quad | null;
  onDone: (quad: Quad) => void;
  onCancel: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The photo with the page's four corners on it, to drag into place (pointer or touch) or move with the arrow keys
 * (shift for bigger steps). The page shape is shaded and outlined in the selection-frame blue.
 */
export function CornerEditor({ photo, quad: initial, detected, onDone, onCancel }: Props) {
  const [quad, setQuad] = useState(initial);
  const [url] = useState(() => URL.createObjectURL(photo));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const valid = isConvex(quad);

  function pointTo(index: number, event: React.PointerEvent) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setQuad((q) =>
      moveCorner(q, index, [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]),
    );
  }

  function nudge(index: number, event: React.KeyboardEvent) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setQuad((q) => moveCorner(q, index, [q[index]![0] + move[0], q[index]![1] + move[1]]));
  }

  const points = quad.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl focus:outline-none">
        Adjust the corners
      </h2>
      <p className="text-sm text-ink-muted">
        Drag each corner onto a corner of the page, or select one and use the arrow keys (hold shift for bigger steps).
      </p>
      <div className="grid min-w-0 place-items-center overflow-hidden rounded-lg bg-ink/90 p-2">
        <div
          ref={boxRef}
          className="relative max-h-[70vh] max-w-full touch-none select-none"
          style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
        >
          <img
            src={url}
            alt="What you photographed"
            className="block max-h-[70vh] w-auto max-w-full"
            onLoad={(event) =>
              setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            draggable={false}
          />
          {size && (
            <>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
                aria-hidden="true"
              >
                <path
                  d={`M0,0H100V100H0Z M${points.replaceAll(" ", " L")}Z`}
                  fillRule="evenodd"
                  className="fill-ink/45"
                />
                <polygon
                  points={points}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  className={valid ? "stroke-primary" : "stroke-sticky-coral"}
                />
              </svg>
              {quad.map(([x, y], index) => (
                <button
                  key={CORNER_NAMES[index]}
                  type="button"
                  aria-label={`${CORNER_NAMES[index]} corner, ${pct(x)} across, ${pct(y)} down`}
                  data-corner={index}
                  className="absolute size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full focus-visible:outline-3 focus-visible:outline-sticky-yellow active:cursor-grabbing"
                  style={{ left: pct(x), top: pct(y) }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragging.current = index;
                  }}
                  onPointerMove={(event) => dragging.current === index && pointTo(index, event)}
                  onPointerUp={() => (dragging.current = null)}
                  onPointerCancel={() => (dragging.current = null)}
                  onKeyDown={(event) => nudge(index, event)}
                >
                  <span className="absolute inset-3 rounded-full border-2 border-primary bg-surface shadow-sticky" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      {!valid && (
        <p className="text-sm font-semibold" role="alert">
          The corners cross over. Put each one on its own corner of the page.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-pill bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60"
          disabled={!valid}
          onClick={() => onDone(quad)}
        >
          Done
        </button>
        {detected && (
          <button
            type="button"
            className="btn-pill border-2 border-line bg-surface hover:border-primary"
            onClick={() => setQuad(detected)}
          >
            Back to detected
          </button>
        )}
        <button
          type="button"
          className="btn-pill border-2 border-line bg-surface hover:border-primary"
          onClick={() => setQuad(WHOLE)}
        >
          Whole photo
        </button>
        <button type="button" className="btn-pill text-ink-muted hover:text-ink hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
