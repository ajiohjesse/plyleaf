/* oxlint-disable jsx-a11y/prefer-tag-over-role -- throwaway prototype */
// The new signature maker (D-046/D-047): a dialog on wide screens, a bottom sheet on phones, with Draw, Type and Upload.
import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwiseIcon, ImageSquareIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { HANDWRITING, loadFont } from "./fonts";
import { Check, IconButton, Sheet, cx } from "./ui";

export interface SignatureImage {
  id: string;
  url: string;
  width: number;
  height: number;
  saved: boolean;
}

const INKS = [
  { name: "Black", css: "#111111" },
  { name: "Blue", css: "#1d3fbb" },
];
const PENS = { fine: 2, medium: 3.5, bold: 5.5 } as const;
type Point = { x: number; y: number };

export function SignatureDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (image: SignatureImage) => void;
}) {
  const [tab, setTab] = useState<string>("draw");
  const [ink, setInk] = useState(INKS[0]!.css);
  const [pen, setPen] = useState<keyof typeof PENS>("medium");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [name, setName] = useState("Alex Morgan");
  const [font, setFont] = useState(HANDWRITING[0]!);
  const [picture, setPicture] = useState<string | null>(null);
  const [save, setSave] = useState(true);

  useEffect(() => {
    if (tab === "type") HANDWRITING.forEach((family) => void loadFont(family));
  }, [tab]);

  const ready = tab === "draw" ? strokes.length > 0 : tab === "type" ? name.trim().length > 0 : picture !== null;

  async function add() {
    let image: Omit<SignatureImage, "id" | "saved">;
    if (tab === "draw") image = renderStrokes(strokes, ink, PENS[pen]);
    else if (tab === "type") image = await renderText(name.trim(), font, ink);
    else image = await measurePicture(picture!);
    onAdd({ ...image, id: `sig-${Date.now()}`, saved: save });
    onOpenChange(false);
    setStrokes([]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New signature" wide>
      <Tabs value={tab} onValueChange={(value) => value && setTab(value as string)}>
        <TabsList aria-label="How to make it" className="flex border-b border-line">
          <TabsTab value="draw">Draw</TabsTab>
          <TabsTab value="type">Type</TabsTab>
          <TabsTab value="upload">Upload</TabsTab>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Ink" className="flex gap-1.5">
            {INKS.map((option) => (
              <button
                key={option.css}
                type="button"
                aria-label={option.name}
                aria-pressed={ink === option.css}
                onClick={() => setInk(option.css)}
                className="press grid size-9 place-items-center rounded-full border-2 border-transparent aria-pressed:border-primary"
              >
                <span className="size-6 rounded-full" style={{ background: option.css }} />
              </button>
            ))}
          </div>
          {tab === "draw" && (
            <SegmentedControl
              aria-label="Pen"
              value={pen}
              onValueChange={(value) => value && setPen(value as keyof typeof PENS)}
            >
              <SegmentedControlIndicator />
              <SegmentedControlItem value="fine">Fine</SegmentedControlItem>
              <SegmentedControlItem value="medium">Medium</SegmentedControlItem>
              <SegmentedControlItem value="bold">Bold</SegmentedControlItem>
            </SegmentedControl>
          )}
        </div>

        <TabsPanel value="draw" className="mt-3">
          <Pad strokes={strokes} onStrokesChange={setStrokes} ink={ink} width={PENS[pen]} />
        </TabsPanel>

        <TabsPanel value="type" className="mt-3 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 rounded-xl border-2 border-line px-3 text-lg focus:border-primary focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Handwriting" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {HANDWRITING.map((family) => (
              <button
                key={family}
                type="button"
                role="radio"
                aria-checked={font === family}
                aria-label={family}
                onClick={() => setFont(family)}
                className="press grid h-20 place-items-center overflow-hidden rounded-2xl border-2 border-line px-2 hover:border-ink/25 aria-checked:border-primary aria-checked:bg-sticky-lavender/20"
              >
                <span
                  className="truncate text-[26px] leading-none"
                  style={{ fontFamily: `"${family}", cursive`, color: ink }}
                >
                  {name.trim() || "Your name"}
                </span>
              </button>
            ))}
          </div>
        </TabsPanel>

        <TabsPanel value="upload" className="mt-3">
          <label className="grid h-44 cursor-pointer place-items-center rounded-2xl border-[3px] border-dashed border-ink/20 bg-surface-band text-center hover:border-primary">
            {picture ? (
              <img
                src={picture}
                alt="Your signature"
                draggable={false}
                className="max-h-36 max-w-[90%] object-contain"
              />
            ) : (
              <span className="grid justify-items-center gap-2 text-ink-muted">
                <ImageSquareIcon weight="duotone" className="size-10" aria-hidden="true" />
                <span className="font-semibold text-ink">Choose a photo or scan of your signature</span>
                <span className="text-sm">The paper behind it is taken out.</span>
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setPicture(URL.createObjectURL(file));
              }}
            />
          </label>
        </TabsPanel>
      </Tabs>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Check label="Keep on this device" checked={save} onChange={setSave} />
        <button
          type="button"
          disabled={!ready}
          onClick={() => void add()}
          className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          Add signature
        </button>
      </div>
    </Sheet>
  );
}

function Pad({
  strokes,
  onStrokesChange,
  ink,
  width,
}: {
  strokes: Point[][];
  onStrokesChange: (strokes: Point[][]) => void;
  ink: string;
  width: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const [redo, setRedo] = useState<Point[][]>([]);

  useEffect(() => {
    const el = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    const ctx = el.getContext("2d")!;
    ctx.scale(ratio, ratio);
    paint(ctx, strokes, ink, width);
  }, [strokes, ink, width]);

  const point = (event: React.PointerEvent): Point => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  function undo() {
    if (!strokes.length) return;
    setRedo([...redo, strokes.at(-1)!]);
    onStrokesChange(strokes.slice(0, -1));
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label="Signature pad: draw with your finger, pen or mouse"
          tabIndex={0}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
              event.preventDefault();
              if (event.shiftKey && redo.length) {
                onStrokesChange([...strokes, redo.at(-1)!]);
                setRedo(redo.slice(0, -1));
              } else undo();
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = [point(event)];
            setRedo([]);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            drawing.current.push(point(event));
            const ctx = canvas.current!.getContext("2d")!;
            paint(ctx, [...strokes, drawing.current], ink, width, true);
          }}
          onPointerUp={() => {
            if (drawing.current && drawing.current.length > 1) onStrokesChange([...strokes, drawing.current]);
            drawing.current = null;
          }}
          className="h-48 w-full touch-none rounded-2xl border-2 border-line bg-white sm:h-56"
        />
        <span
          className="pointer-events-none absolute inset-x-8 bottom-12 border-b-2 border-dashed border-ink/15"
          aria-hidden="true"
        />
        {strokes.length === 0 && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-ink-muted">Sign here</span>
        )}
      </div>
      <div className="flex justify-end gap-1">
        <IconButton label="Undo stroke" shortcut="mod+z" disabled={!strokes.length} onClick={undo} side="top">
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Clear"
          disabled={!strokes.length}
          onClick={() => {
            setRedo([]);
            onStrokesChange([]);
          }}
          side="top"
        >
          <TrashIcon weight="bold" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

function paint(ctx: CanvasRenderingContext2D, strokes: Point[][], ink: string, width: number, clear = true) {
  if (clear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.beginPath();
    stroke.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = stroke[i - 1]!;
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
      }
    });
    ctx.stroke();
  }
}

function renderStrokes(strokes: Point[][], ink: string, width: number) {
  const all = strokes.flat();
  const pad = width * 2;
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const w = Math.max(...all.map((p) => p.x)) - minX + pad;
  const h = Math.max(...all.map((p) => p.y)) - minY + pad;
  const canvas = document.createElement("canvas");
  canvas.width = w * 3;
  canvas.height = h * 3;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(3, 3);
  ctx.translate(-minX, -minY);
  paint(ctx, strokes, ink, width, false);
  return { url: canvas.toDataURL("image/png"), width: w, height: h };
}

async function renderText(text: string, family: string, ink: string) {
  await loadFont(family);
  const size = 64;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${size}px "${family}"`;
  const w = Math.ceil(ctx.measureText(text).width + size * 0.6);
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${size}px "${family}"`;
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  ctx.fillText(text, size * 0.3, h / 2);
  return { url: canvas.toDataURL("image/png"), width: w / 2, height: h / 2 };
}

function measurePicture(url: string) {
  return new Promise<{ url: string; width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 160 / img.naturalWidth;
      resolve({ url, width: 160, height: img.naturalHeight * scale });
    };
    img.src = url;
  });
}

export function SavedSignature({
  image,
  onUse,
  onDelete,
}: {
  image: SignatureImage;
  onUse: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="settle group relative [--settle-from:0deg]">
      <button
        type="button"
        onClick={onUse}
        aria-label="Place this signature"
        className={cx(
          "press grid h-20 w-full place-items-center rounded-2xl border-2 border-line bg-white p-2 hover:border-primary hover:shadow-sticky",
        )}
      >
        <img src={image.url} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
      </button>
      <IconButton
        label="Delete signature"
        onClick={onDelete}
        side="top"
        className="absolute -top-2 -right-2 size-8 rounded-full border border-line bg-surface shadow-sm hover:bg-sticky-pink hover:text-ink [&_svg]:size-4"
      >
        <TrashIcon weight="bold" aria-hidden="true" />
      </IconButton>
      {!image.saved && (
        <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-ink-muted">This time only</span>
      )}
    </li>
  );
}
