// The Sign and Initials tools' panel: signatures saved on this device to choose from, and the maker for a new one
// (draw it, type it in a handwriting font, or use a photo or scan of it).
import "@fontsource/caveat/400.css";
import "@fontsource/dancing-script/400.css";
import "@fontsource/sacramento/400.css";
import { useEffect, useId, useRef, useState } from "react";
import type { SignatureKind } from "~/sign/ink";
import { fieldClass, ToggleButton } from "~/components/editor/options";
import { TrashIcon } from "~/components/editor/icons";
import { primaryButton } from "~/components/workspace/parts";
import { drawStrokes, fromPicture, fromStrokes, fromText, type Point, type SignatureImage } from "./render";
import type { Signature, Storage } from "./useSignatures";

/** Handwriting fonts for typed signatures (OFL, self-hosted; loaded only when shown). */
export const SIGNATURE_FONTS = ["Dancing Script", "Caveat", "Sacramento"] as const;

/** Ink colours: black, and the blue many people sign in. */
const INKS = [
  { name: "Black", css: "#111111" },
  { name: "Blue", css: "#1d3fbb" },
] as const;

const WORDS: Record<SignatureKind, { one: string; the: string; use: string; draw: string; type: string }> = {
  signature: {
    one: "signature",
    the: "your signature",
    use: "Use this signature",
    draw: "Draw your signature",
    type: "Your name",
  },
  initials: {
    one: "initials",
    the: "your initials",
    use: "Use these initials",
    draw: "Draw your initials",
    type: "Your initials",
  },
};

interface Props {
  kind: SignatureKind;
  /** Saved and for-now ones of this kind. */
  signatures: Signature[];
  chosen: string | null;
  storage: Storage;
  onChoose: (signature: Signature) => void;
  onForget: (signature: Signature) => void;
  onMake: (image: SignatureImage, remember: boolean) => Promise<void>;
}

export function SignPanel({ kind, signatures, chosen, storage, onChoose, onForget, onMake }: Props) {
  const words = WORDS[kind];
  // The maker opens by itself when there's nothing to choose yet.
  const [making, setMaking] = useState(false);
  const showMaker = making || (storage !== "loading" && signatures.length === 0);
  return (
    <fieldset className="absolute inset-x-0 top-full mt-2 max-h-[min(34rem,70vh)] min-w-0 overflow-y-auto rounded-card border border-line bg-surface p-3 shadow-sticky">
      <legend className="sr-only">{kind === "signature" ? "Signature" : "Initials"}</legend>
      {signatures.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{kind === "signature" ? "Your signatures:" : "Your initials:"}</span>
          {signatures.map((signature, i) => (
            <span key={signature.id} className="flex items-center">
              <button
                type="button"
                aria-pressed={signature.id === chosen}
                aria-label={`${kind === "signature" ? "Signature" : "Initials"} ${i + 1}${signature.kept ? ", saved on this device" : ""}`}
                onClick={() => onChoose(signature)}
                className="grid h-12 w-32 place-items-center rounded-lg border-2 border-line bg-surface p-1 hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
              >
                <img src={signature.url} alt="" className="max-h-full max-w-full object-contain" />
              </button>
              <button
                type="button"
                aria-label={`Forget ${kind === "signature" ? "signature" : "initials"} ${i + 1}`}
                title={signature.kept ? "Forget it: it's deleted from this device" : "Forget it"}
                onClick={() => onForget(signature)}
                className="grid size-9 place-items-center rounded-lg hover:bg-ink/10"
              >
                <TrashIcon />
              </button>
            </span>
          ))}
          {!showMaker && (
            <button
              type="button"
              onClick={() => setMaking(true)}
              className="min-h-10 rounded-pill border-2 border-line px-3 text-sm font-semibold hover:border-primary"
            >
              New {words.one}
            </button>
          )}
        </div>
      )}
      {showMaker && (
        <Maker
          kind={kind}
          storage={storage}
          onCancel={signatures.length > 0 ? () => setMaking(false) : undefined}
          onMake={async (image, remember) => {
            await onMake(image, remember);
            setMaking(false);
          }}
        />
      )}
      {!showMaker && signatures.length > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          {chosen ? `Click the page where ${words.the} should go.` : `Choose ${words.the}, then click the page.`}
        </p>
      )}
    </fieldset>
  );
}

type Way = "draw" | "type" | "upload";

function Maker({
  kind,
  storage,
  onCancel,
  onMake,
}: {
  kind: SignatureKind;
  storage: Storage;
  onCancel: (() => void) | undefined;
  onMake: (image: SignatureImage, remember: boolean) => Promise<void>;
}) {
  const words = WORDS[kind];
  const [way, setWay] = useState<Way>("draw");
  const [ink, setInk] = useState<(typeof INKS)[number]>(INKS[0]);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [padSize, setPadSize] = useState({ width: 480, height: 160 });
  const [typed, setTyped] = useState("");
  const [font, setFont] = useState<(typeof SIGNATURE_FONTS)[number]>(SIGNATURE_FONTS[0]);
  const [picture, setPicture] = useState<File | null>(null);
  const [clear, setClear] = useState(true);
  const [remember, setRemember] = useState(true);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const typedId = useId();
  const pictureId = useId();

  const ready = way === "draw" ? strokes.length > 0 : way === "type" ? typed.trim() !== "" : picture !== null;

  async function make() {
    setWorking(true);
    setProblem(null);
    try {
      const image =
        way === "draw"
          ? await fromStrokes(strokes, padSize, ink.css)
          : way === "type"
            ? await fromText(typed.trim(), font, ink.css)
            : await fromPicture(picture!, clear);
      if (!image) {
        setProblem(
          way === "upload"
            ? "Nothing was left once the paper was taken out. Try a darker photo, or untick the box."
            : `There's nothing there yet: ${way === "draw" ? "draw" : "type"} ${words.the} first.`,
        );
        return;
      }
      await onMake(image, remember && storage === "ready");
    } catch {
      setProblem(
        way === "upload"
          ? `${picture?.name ?? "That file"} couldn't be read as a picture here. Try a JPG or PNG.`
          : `${words.the[0]!.toUpperCase()}${words.the.slice(1)} couldn't be made here. Please try again.`,
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 first:mt-0">
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex gap-1">
          <legend className="sr-only">How to make {words.the}</legend>
          {(["draw", "type", "upload"] as const).map((option) => (
            <ToggleButton
              key={option}
              label={option === "draw" ? "Draw" : option === "type" ? "Type" : "Upload a picture"}
              pressed={way === option}
              onClick={() => {
                setWay(option);
                setProblem(null);
              }}
            >
              <span className="px-1 text-sm font-semibold">
                {option === "draw" ? "Draw" : option === "type" ? "Type" : "Upload"}
              </span>
            </ToggleButton>
          ))}
        </fieldset>
        {way !== "upload" && (
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Ink</legend>
            {INKS.map((option) => (
              <ToggleButton
                key={option.name}
                label={`${option.name} ink`}
                pressed={ink.name === option.name}
                onClick={() => setInk(option)}
              >
                <span className="block size-5 rounded-full" style={{ background: option.css }} />
              </ToggleButton>
            ))}
          </fieldset>
        )}
      </div>

      {way === "draw" && (
        <Pad
          label={words.draw}
          strokes={strokes}
          color={ink.css}
          tall={kind === "signature"}
          onStrokes={setStrokes}
          onSize={setPadSize}
        />
      )}
      {way === "type" && (
        <div className="space-y-2">
          <span className="flex items-center gap-2">
            <label htmlFor={typedId} className="text-sm">
              {words.type}
            </label>
            <input
              id={typedId}
              type="text"
              value={typed}
              maxLength={kind === "signature" ? 60 : 6}
              autoComplete={kind === "signature" ? "name" : "off"}
              onChange={(event) => setTyped(event.target.value)}
              className={`${fieldClass} w-60 max-w-full`}
            />
          </span>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Style</legend>
            {SIGNATURE_FONTS.map((family) => (
              <button
                key={family}
                type="button"
                aria-pressed={font === family}
                aria-label={`Style: ${family}`}
                onClick={() => setFont(family)}
                className="min-h-14 min-w-32 rounded-lg border-2 border-line px-3 text-3xl hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
                style={{ fontFamily: `"${family}", cursive`, color: ink.css }}
              >
                {typed.trim() || (kind === "signature" ? "Signature" : "AB")}
              </button>
            ))}
          </fieldset>
        </div>
      )}
      {way === "upload" && (
        <div className="space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor={pictureId} className="text-sm">
              Photo or scan of {words.the}
            </label>
            <input
              id={pictureId}
              type="file"
              accept="image/*"
              onChange={(event) => setPicture(event.target.files?.[0] ?? null)}
              className="max-w-full text-sm"
            />
          </span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={clear} onChange={(event) => setClear(event.target.checked)} />
            Take out the paper behind it (makes it see-through)
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" disabled={!ready || working} className={primaryButton} onClick={() => void make()}>
          {working ? "Making…" : words.use}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm font-semibold underline">
            Cancel
          </button>
        )}
        {storage === "unavailable" ? (
          <span className="text-sm text-ink-muted">This browser won&apos;t keep it, so it&apos;s only for now.</span>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              disabled={storage !== "ready"}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Save it on this device for next time (never uploaded)
          </label>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-ink">
          {problem}
        </p>
      )}
    </div>
  );
}

/** A pad to draw on with a mouse, pen or finger; strokes are kept in CSS pixels from its top-left. */
function Pad({
  label,
  strokes,
  color,
  tall,
  onStrokes,
  onSize,
}: {
  label: string;
  strokes: Point[][];
  color: string;
  tall: boolean;
  onStrokes: (strokes: Point[][]) => void;
  onSize: (size: { width: number; height: number }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ pointer: number; points: Point[] } | null>(null);
  const [size, setSize] = useState({ width: 480, height: tall ? 160 : 120 });

  useEffect(() => {
    const element = canvas.current!;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize(next);
      onSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);

  // Redrawn whenever the strokes, colour or size change (and live, while drawing).
  function paint(extra?: Point[]) {
    const element = canvas.current;
    if (!element) return;
    const ratio = devicePixelRatio;
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    const context = element.getContext("2d")!;
    context.scale(ratio, ratio);
    drawStrokes(context, extra ? [...strokes, extra] : strokes, color, 2.5);
  }
  useEffect(paint);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-hidden="true"
          data-signature-pad
          className="block w-full max-w-xl cursor-crosshair rounded-lg border-2 border-dashed border-line bg-surface"
          style={{ height: tall ? 160 : 120, touchAction: "none" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = { pointer: event.pointerId, points: [point(event)] };
            paint(drawing.current.points);
          }}
          onPointerMove={(event) => {
            const active = drawing.current;
            if (active?.pointer !== event.pointerId) return;
            const events = "getCoalescedEvents" in event.nativeEvent ? event.nativeEvent.getCoalescedEvents() : [];
            for (const each of events.length > 0 ? events : [event.nativeEvent]) {
              const box = event.currentTarget.getBoundingClientRect();
              active.points.push({ x: each.clientX - box.left, y: each.clientY - box.top });
            }
            paint(active.points);
          }}
          onPointerUp={(event) => {
            const active = drawing.current;
            if (active?.pointer !== event.pointerId) return;
            drawing.current = null;
            onStrokes([...strokes, active.points]);
          }}
          onPointerCancel={() => {
            drawing.current = null;
            paint();
          }}
        />
        {strokes.length === 0 && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto block w-3/4 border-t border-ink-muted/60 pt-1 text-center text-xs text-ink-muted">
            {label}
          </span>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button
          type="button"
          disabled={strokes.length === 0}
          onClick={() => onStrokes(strokes.slice(0, -1))}
          className="font-semibold underline disabled:opacity-40"
        >
          Undo stroke
        </button>
        <button
          type="button"
          disabled={strokes.length === 0}
          onClick={() => onStrokes([])}
          className="font-semibold underline disabled:opacity-40"
        >
          Clear
        </button>
        <span className="text-ink-muted">No mouse? Type it or upload a picture instead.</span>
      </div>
    </div>
  );
}
