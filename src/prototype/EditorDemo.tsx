/* oxlint-disable jsx-a11y/prefer-tag-over-role -- throwaway prototype */
// The editor in the new layout: a tool rail, the page canvas (hand tool, gesture zoom, Shift rules), an options panel,
// Expand mode, and on phones a bottom toolbar with options in a sheet.
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ArrowsOutIcon,
  CircleIcon,
  CornersInIcon,
  CornersOutIcon,
  CursorIcon,
  DownloadSimpleIcon,
  EraserIcon,
  HandIcon,
  HighlighterIcon,
  LineSegmentIcon,
  MinusIcon,
  NoteIcon,
  PencilSimpleIcon,
  PlusIcon,
  RectangleIcon,
  SignatureIcon,
  SlidersHorizontalIcon,
  StampIcon,
  TextTIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle";
import { Toolbar, ToolbarSeparator } from "@ui-sdk/react/toolbar";
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { MockPage } from "./MockPage";
import { SavedSignature, SignatureDialog, type SignatureImage } from "./SignatureDialog";
import { TEXT_FONTS, loadFont } from "./fonts";
import { useWorkingDoc } from "./store";
import { Check, IconButton, Select, Sheet, cx, deletedToast, toast, useMediaQuery } from "./ui";

type ToolId =
  | "select"
  | "hand"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "draw"
  | "highlight"
  | "note"
  | "stamp"
  | "sign"
  | "whiteout"
  | "redact";

const TOOLS: { id: ToolId; label: string; icon: Icon; key?: string; group: number }[] = [
  { id: "select", label: "Select", icon: CursorIcon, key: "v", group: 0 },
  { id: "hand", label: "Hand", icon: HandIcon, key: "h", group: 0 },
  { id: "text", label: "Text", icon: TextTIcon, key: "t", group: 1 },
  { id: "sign", label: "Sign", icon: SignatureIcon, key: "s", group: 1 },
  { id: "rect", label: "Rectangle", icon: RectangleIcon, key: "r", group: 2 },
  { id: "ellipse", label: "Ellipse", icon: CircleIcon, key: "o", group: 2 },
  { id: "line", label: "Line", icon: LineSegmentIcon, key: "l", group: 2 },
  { id: "arrow", label: "Arrow", icon: ArrowUpRightIcon, key: "a", group: 2 },
  { id: "draw", label: "Draw", icon: PencilSimpleIcon, key: "d", group: 3 },
  { id: "highlight", label: "Highlight", icon: HighlighterIcon, group: 3 },
  { id: "note", label: "Comment", icon: NoteIcon, group: 3 },
  { id: "stamp", label: "Stamp", icon: StampIcon, group: 3 },
  { id: "whiteout", label: "Whiteout", icon: EraserIcon, group: 4 },
];

/** Page units: the page is 1000 wide and 1414 tall, so a unit is the same on both axes. */
const PAGE_W = 1000;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Item {
  id: string;
  kind: "rect" | "ellipse" | "line" | "arrow" | "text" | "image";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  font?: string;
  size?: number;
  url?: string;
}

interface History {
  past: Item[][];
  present: Item[];
  future: Item[][];
}

const COLORS = ["#111111", "#3d4ef5", "#e5484d", "#1f8a5b", "#f5a524"];

export function EditorDemo({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const doc = useWorkingDoc();
  const phone = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1024px)");
  const [tool, setTool] = useState<ToolId>(() =>
    typeof location !== "undefined" && new URLSearchParams(location.search).get("tool") === "sign" ? "sign" : "select",
  );
  const [history, setHistory] = useState<History>({
    past: [],
    present: [
      {
        id: "hello",
        kind: "text",
        page: 1,
        x: 90,
        y: 520,
        w: 520,
        h: 60,
        color: "#3d4ef5",
        text: "Signed copy, 21 Nov",
        font: "Lora",
        size: 40,
      },
      { id: "box", kind: "rect", page: 1, x: 640, y: 980, w: 260, h: 150, color: "#e5484d" },
    ],
    future: [],
  });
  const items = history.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [space, setSpace] = useState(false);
  const [color, setColor] = useState(COLORS[1]!);
  const [font, setFont] = useState("Inter");
  const [fill, setFill] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatures, setSignatures] = useState<SignatureImage[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(760);

  useEffect(() => {
    if (phone) onExpandedChange(true);
  }, [phone, onExpandedChange]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setFit(Math.min(el.clientWidth - (phone ? 24 : 64), 820));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone, expanded]);

  const pageWidth = fit * ZOOMS[zoom]!;
  const unit = pageWidth / PAGE_W;

  function commit(next: Item[]) {
    setHistory((h) => ({ past: [...h.past.slice(-199), h.present], present: next, future: [] }));
  }
  function travel(direction: "undo" | "redo") {
    setHistory((h) => {
      if (direction === "undo" && h.past.length)
        return { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] };
      if (direction === "redo" && h.future.length)
        return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
      return h;
    });
  }

  const travelRef = useRef(travel);
  travelRef.current = travel;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const undo = () => travelRef.current("undo");
    const redo = () => travelRef.current("redo");
    window.addEventListener("proto:undo", undo);
    window.addEventListener("proto:redo", redo);
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable=true], canvas");
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !typing) {
        const key = event.key.toLowerCase();
        if (key === "z") travelRef.current(event.shiftKey ? "redo" : "undo");
        else if (key === "y") travelRef.current("redo");
        else if (key === "=" || key === "+") setZoom((z) => Math.min(z + 1, ZOOMS.length - 1));
        else if (key === "-") setZoom((z) => Math.max(z - 1, 0));
        else return;
        event.preventDefault();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === " " && !event.repeat) {
        event.preventDefault();
        setSpace(true);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedRef.current) {
        const id = selectedRef.current;
        setHistory((h) => ({
          past: [...h.past, h.present],
          present: h.present.filter((i) => i.id !== id),
          future: [],
        }));
        setSelected(null);
        return;
      }
      if (event.key === "Escape") {
        if (selectedRef.current) setSelected(null);
        else onExpandedChange(false);
        return;
      }
      const match = TOOLS.find((t) => t.key === event.key.toLowerCase());
      if (match) setTool(match.id);
    }
    const onUp = (event: KeyboardEvent) => event.key === " " && setSpace(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("proto:undo", undo);
      window.removeEventListener("proto:redo", redo);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [onExpandedChange]);

  // Ctrl/⌘ + wheel and trackpad pinches zoom around the pointer; two fingers pinch on touch.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let acc = 0;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      acc += event.deltaY;
      if (Math.abs(acc) < 40) return;
      const step = acc > 0 ? -1 : 1;
      acc = 0;
      zoomAround(step, event.clientX, event.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function zoomAround(step: number, clientX: number, clientY: number) {
    const el = scroller.current!;
    setZoom((z) => {
      const next = Math.max(0, Math.min(z + step, ZOOMS.length - 1));
      if (next === z) return z;
      const box = el.getBoundingClientRect();
      const ratio = ZOOMS[next]! / ZOOMS[z]!;
      const px = clientX - box.left + el.scrollLeft;
      const py = clientY - box.top + el.scrollTop;
      requestAnimationFrame(() => {
        el.scrollLeft = px * ratio - (clientX - box.left);
        el.scrollTop = py * ratio - (clientY - box.top);
      });
      return next;
    });
  }

  const panning = tool === "hand" || space;
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  function onScrollerPointerDown(event: React.PointerEvent) {
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    }
    if (!panning || event.button !== 0) return;
    event.preventDefault();
    const el = scroller.current!;
    el.setPointerCapture(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
  }
  function onScrollerPointerMove(event: React.PointerEvent) {
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size === 2 && pinch.current) {
        const [a, b] = [...touches.current.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (Math.abs(distance / pinch.current - 1) > 0.25) {
          zoomAround(distance > pinch.current ? 1 : -1, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
          pinch.current = distance;
        }
      }
    }
    if (!pan.current) return;
    const el = scroller.current!;
    el.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
    el.scrollTop = pan.current.top - (event.clientY - pan.current.y);
  }
  function onScrollerPointerUp(event: React.PointerEvent) {
    touches.current.delete(event.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    pan.current = null;
  }

  function placeSignature(image: SignatureImage) {
    const w = 300;
    const h = (image.height / image.width) * w;
    const item: Item = {
      id: image.id + Date.now(),
      kind: "image",
      page: 1,
      x: 560,
      y: 700 - h / 2,
      w,
      h,
      color: "",
      url: image.url,
    };
    commit([...items, item]);
    setSelected(item.id);
    setTool("select");
    setOptionsOpen(false);
  }

  function deleteSignature(image: SignatureImage) {
    const before = signatures;
    setSignatures(signatures.filter((s) => s.id !== image.id));
    deletedToast("Signature", () => setSignatures(before));
  }

  const selectedItem = items.find((i) => i.id === selected) ?? null;
  const full = expanded;

  const options = (
    <Options
      tool={tool}
      item={selectedItem}
      color={color}
      onColor={(next) => {
        setColor(next);
        if (selectedItem) commit(items.map((i) => (i.id === selectedItem.id ? { ...i, color: next } : i)));
      }}
      font={selectedItem?.font ?? font}
      onFont={(next) => {
        void loadFont(next);
        setFont(next);
        if (selectedItem?.kind === "text")
          commit(items.map((i) => (i.id === selectedItem.id ? { ...i, font: next } : i)));
      }}
      fill={fill}
      onFill={setFill}
      signatures={signatures}
      onNewSignature={() => {
        setOptionsOpen(false);
        setSigning(true);
      }}
      onUseSignature={placeSignature}
      onDeleteSignature={deleteSignature}
      onDeleteItem={() => {
        if (!selectedItem) return;
        commit(items.filter((i) => i.id !== selectedItem.id));
        setSelected(null);
      }}
    />
  );

  useEffect(() => {
    void loadFont("Lora");
  }, []);

  const frame = (
    <div
      className={cx(
        "flex min-h-0 flex-col bg-surface-band",
        full
          ? "fixed inset-0 z-50"
          : "h-[min(82dvh,900px)] overflow-hidden rounded-[24px] border border-line shadow-sticky",
      )}
    >
      <TopBar
        name={doc?.name ?? "lease-agreement.pdf"}
        phone={phone}
        full={full}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => travel("undo")}
        onRedo={() => travel("redo")}
        zoom={ZOOMS[zoom]!}
        onZoom={(step) => setZoom((z) => Math.max(0, Math.min(z + step, ZOOMS.length - 1)))}
        onExpand={() => onExpandedChange(!full)}
      />
      <div className="flex min-h-0 flex-1">
        {!phone && <Rail tool={tool} onTool={setTool} />}
        <div
          ref={scroller}
          onPointerDown={onScrollerPointerDown}
          onPointerMove={onScrollerPointerMove}
          onPointerUp={onScrollerPointerUp}
          onPointerCancel={onScrollerPointerUp}
          className={cx(
            "relative min-w-0 flex-1 overflow-auto overscroll-contain",
            panning && (pan.current ? "cursor-grabbing" : "cursor-grab"),
            panning && "select-none",
          )}
          style={{ touchAction: panning ? "none" : "pan-x pan-y" }}
        >
          <div className="mx-auto grid w-max gap-6 px-3 py-6 sm:px-8 sm:py-8">
            {[1, 2, 3].map((n) => (
              <PageView
                key={n}
                n={n}
                width={pageWidth}
                unit={unit}
                tool={panning ? "hand" : tool}
                items={items.filter((i) => i.page === n)}
                selected={selected}
                color={color}
                font={font}
                fill={fill}
                onSelect={setSelected}
                onCommit={(next) => commit([...items.filter((i) => i.page !== n), ...next])}
              />
            ))}
          </div>
        </div>
        {!phone && wide && (
          <aside aria-label="Options" className="w-72 shrink-0 overflow-y-auto border-l border-line bg-surface p-4">
            {options}
          </aside>
        )}
      </div>
      {phone && (
        <BottomBar
          tool={tool}
          onTool={(next) => {
            setTool(next);
            if (next === "sign") setOptionsOpen(true);
          }}
          onOptions={() => setOptionsOpen(true)}
        />
      )}
      {!phone && !wide && (
        <div className="border-t border-line bg-surface px-4 py-2">
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            className="press flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm font-semibold hover:bg-surface-band"
          >
            <SlidersHorizontalIcon weight="bold" className="size-4" aria-hidden="true" />{" "}
            {TOOLS.find((t) => t.id === tool)?.label} options
          </button>
        </div>
      )}
      <Sheet
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        title={`${TOOLS.find((t) => t.id === tool)?.label ?? "Tool"} options`}
      >
        <div className="pb-2">{options}</div>
      </Sheet>
      <SignatureDialog
        open={signing}
        onOpenChange={setSigning}
        onAdd={(image) => {
          setSignatures([image, ...signatures]);
          placeSignature(image);
        }}
      />
    </div>
  );

  if (full) return frame;
  return (
    <section className="border-b border-line bg-sticky-pink/30">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6">
        <div className="flex items-center gap-4">
          <span
            className="grid size-12 shrink-0 -rotate-3 place-items-center rounded-xl bg-sticky-pink shadow-sticky sm:size-14"
            aria-hidden="true"
          >
            <PencilSimpleIcon weight="duotone" className="size-7" />
          </span>
          <h1 className="text-4xl sm:text-5xl">Edit PDF</h1>
        </div>
        <div className="mt-6">{frame}</div>
      </div>
    </section>
  );
}

function TopBar({
  name,
  phone,
  full,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoom,
  onExpand,
}: {
  name: string;
  phone: boolean;
  full: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoom: (step: number) => void;
  onExpand: () => void;
}) {
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-2 sm:px-3">
      {phone && full && (
        <IconButton label="Leave the editor" onClick={onExpand}>
          <ArrowLeftIcon weight="bold" aria-hidden="true" />
        </IconButton>
      )}
      <p className="min-w-0 flex-1 truncate px-1 font-semibold">{name}</p>
      <IconButton label="Undo" shortcut="mod+z" disabled={!canUndo} onClick={onUndo}>
        <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
      </IconButton>
      <IconButton label="Redo" shortcut="mod+shift+z" disabled={!canRedo} onClick={onRedo}>
        <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
      </IconButton>
      {!phone && (
        <>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <IconButton label="Zoom out" shortcut="mod+-" disabled={zoom <= ZOOMS[0]!} onClick={() => onZoom(-1)}>
            <MinusIcon weight="bold" aria-hidden="true" />
          </IconButton>
          <output aria-label="Zoom" className="w-12 text-center text-sm font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </output>
          <IconButton label="Zoom in" shortcut="mod+=" disabled={zoom >= ZOOMS.at(-1)!} onClick={() => onZoom(1)}>
            <PlusIcon weight="bold" aria-hidden="true" />
          </IconButton>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          {full && canFullscreen && (
            <IconButton
              label="Full screen"
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void document.documentElement.requestFullscreen()
              }
            >
              <ArrowsOutIcon weight="bold" aria-hidden="true" />
            </IconButton>
          )}
          <IconButton label={full ? "Leave Expand (Esc)" : "Expand"} onClick={onExpand}>
            {full ? (
              <CornersInIcon weight="bold" aria-hidden="true" />
            ) : (
              <CornersOutIcon weight="bold" aria-hidden="true" />
            )}
          </IconButton>
        </>
      )}
      <button
        type="button"
        onClick={() => toast(`Downloading ${name}`)}
        className="btn-pill press ml-1 min-h-10 bg-primary px-3 text-on-primary hover:bg-primary-hover sm:px-5"
      >
        <DownloadSimpleIcon weight="bold" className="size-5" aria-hidden="true" />
        <span className="max-sm:sr-only">Download</span>
      </button>
    </div>
  );
}

function Rail({ tool, onTool }: { tool: ToolId; onTool: (tool: ToolId) => void }) {
  const groups = [...new Set(TOOLS.map((t) => t.group))];
  return (
    <Toolbar
      aria-label="Tools"
      orientation="vertical"
      className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-surface py-3 [scrollbar-width:none]"
    >
      <ToggleGroup
        aria-label="Tool"
        orientation="vertical"
        value={[tool]}
        deselectable={false}
        onValueChange={(value) => value[0] && onTool(value[0] as ToolId)}
        className="flex flex-col items-center gap-1"
      >
        {groups.map((group, gi) => (
          <div key={group} className="contents">
            {gi > 0 && <ToolbarSeparator className="my-1.5 h-px w-8 bg-line" />}
            {TOOLS.filter((t) => t.group === group).map((t) => (
              <Tooltip key={t.id} type="label" delay={300} {...(t.key && { shortcut: t.key })}>
                <TooltipTrigger
                  render={<Toggle value={t.id} />}
                  className="press grid size-11 place-items-center rounded-xl text-ink-muted hover:bg-ink/8 hover:text-ink data-pressed:bg-primary data-pressed:text-on-primary data-pressed:shadow-sm"
                >
                  <t.icon weight={tool === t.id ? "fill" : "bold"} className="size-5.5" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="pop z-50">
                  {t.label}
                  {t.key && <TooltipShortcut />}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </ToggleGroup>
    </Toolbar>
  );
}

function BottomBar({
  tool,
  onTool,
  onOptions,
}: {
  tool: ToolId;
  onTool: (tool: ToolId) => void;
  onOptions: () => void;
}) {
  return (
    <div className="flex shrink-0 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div
        role="group"
        aria-label="Tools"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]"
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => onTool(t.id)}
            className="press grid min-w-14 shrink-0 justify-items-center gap-0.5 rounded-xl px-1.5 py-1 text-[11px] font-semibold text-ink-muted aria-pressed:bg-primary aria-pressed:text-on-primary"
          >
            <t.icon weight={tool === t.id ? "fill" : "bold"} className="size-5.5" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onOptions}
        className="press grid w-16 shrink-0 justify-items-center gap-0.5 border-l border-line py-1.5 text-[11px] font-semibold"
      >
        <SlidersHorizontalIcon weight="bold" className="size-5.5" aria-hidden="true" />
        Options
      </button>
    </div>
  );
}

function Options({
  tool,
  item,
  color,
  onColor,
  font,
  onFont,
  fill,
  onFill,
  signatures,
  onNewSignature,
  onUseSignature,
  onDeleteSignature,
  onDeleteItem,
}: {
  tool: ToolId;
  item: Item | null;
  color: string;
  onColor: (color: string) => void;
  font: string;
  onFont: (font: string) => void;
  fill: boolean;
  onFill: (fill: boolean) => void;
  signatures: SignatureImage[];
  onNewSignature: () => void;
  onUseSignature: (image: SignatureImage) => void;
  onDeleteSignature: (image: SignatureImage) => void;
  onDeleteItem: () => void;
}) {
  const swatches = (
    <div className="grid gap-1.5">
      <span className="text-sm font-semibold">Colour</span>
      <div role="group" aria-label="Colour" className="flex gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={(item?.color ?? color) === c}
            onClick={() => onColor(c)}
            className="press grid size-9 place-items-center rounded-full border-2 border-transparent aria-pressed:border-primary"
          >
            <span className="size-6 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </div>
    </div>
  );
  const hint = (text: ReactNode) => (
    <p className="rounded-xl bg-surface-band px-3 py-2 text-sm text-ink-muted">{text}</p>
  );

  if (item && tool === "select") {
    return (
      <div className="grid gap-4">
        <h2 className="font-sans text-base font-bold tracking-normal">
          {item.kind === "image" ? "Signature" : item.kind === "text" ? "Text" : "Shape"}
        </h2>
        {item.kind === "text" && <Select label="Font" value={font} onChange={onFont} options={TEXT_FONTS} />}
        {item.kind !== "image" && swatches}
        {hint(
          item.kind === "image" ? (
            <>
              Keeps its shape when you resize it. Hold <kbd className="font-semibold">Shift</kbd> to stretch.
            </>
          ) : (
            <>
              Hold <kbd className="font-semibold">Shift</kbd> while resizing to keep its proportions.
            </>
          ),
        )}
        <button
          type="button"
          onClick={onDeleteItem}
          className="btn-pill press min-h-10 border-2 border-line text-[#c2272d] hover:border-[#c2272d]/40 hover:bg-sticky-pink/30"
        >
          <TrashIcon weight="bold" className="size-4.5" aria-hidden="true" /> Delete
        </button>
      </div>
    );
  }

  switch (tool) {
    case "text":
      return (
        <div className="grid gap-4">
          <Select label="Font" value={font} onChange={onFont} options={TEXT_FONTS} />
          {swatches}
          {hint("Click on the page to add text. Fonts beyond Helvetica, Times and Courier load when you pick them.")}
        </div>
      );
    case "rect":
    case "ellipse":
    case "line":
    case "arrow":
      return (
        <div className="grid gap-4">
          {swatches}
          {(tool === "rect" || tool === "ellipse") && <Check label="Fill" checked={fill} onChange={onFill} />}
          {hint(
            tool === "line" || tool === "arrow" ? (
              <>
                Drag on the page. Hold <kbd className="font-semibold">Shift</kbd> to snap to 15° steps.
              </>
            ) : (
              <>
                Drag on the page. Hold <kbd className="font-semibold">Shift</kbd> for a perfect{" "}
                {tool === "rect" ? "square" : "circle"}.
              </>
            ),
          )}
        </div>
      );
    case "sign":
      return (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-base font-bold tracking-normal">Your signatures</h2>
          </div>
          {signatures.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3">
              {signatures.map((image) => (
                <SavedSignature
                  key={image.id}
                  image={image}
                  onUse={() => onUseSignature(image)}
                  onDelete={() => onDeleteSignature(image)}
                />
              ))}
            </ul>
          ) : (
            hint("None yet. Make one and it can stay on this device for next time.")
          )}
          <button
            type="button"
            onClick={onNewSignature}
            className="btn-pill press bg-primary text-on-primary hover:bg-primary-hover"
          >
            <SignatureIcon weight="bold" className="size-5" aria-hidden="true" /> New signature
          </button>
        </div>
      );
    case "hand":
      return hint(
        <>
          Drag to move around the page. With any tool, hold <kbd className="font-semibold">Space</kbd>, or use two
          fingers. <kbd className="font-semibold">Ctrl</kbd> + scroll or a pinch zooms.
        </>,
      );
    case "select":
      return hint("Click something you've added to change it. Drag to move it; drag a corner to resize.");
    default:
      return hint("This tool's options look like the others in the real build.");
  }
}

type Drag =
  | { mode: "draw"; start: { x: number; y: number }; kind: Item["kind"] }
  | { mode: "move"; id: string; start: { x: number; y: number }; origin: Item }
  | { mode: "resize"; id: string; corner: "nw" | "ne" | "sw" | "se"; start: { x: number; y: number }; origin: Item };

function PageView({
  n,
  width,
  unit,
  tool,
  items,
  selected,
  color,
  font,
  fill,
  onSelect,
  onCommit,
}: {
  n: number;
  width: number;
  unit: number;
  tool: ToolId;
  items: Item[];
  selected: string | null;
  color: string;
  font: string;
  fill: boolean;
  onSelect: (id: string | null) => void;
  onCommit: (items: Item[]) => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Item[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const shown = draft ?? items;

  const toPage = (event: React.PointerEvent) => {
    const box = overlay.current!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / unit, y: (event.clientY - box.top) / unit };
  };

  function onPointerDown(event: React.PointerEvent) {
    if (tool === "hand" || event.button !== 0) return;
    const p = toPage(event);
    if (tool === "text") {
      const item: Item = {
        id: `t${Date.now()}`,
        kind: "text",
        page: n,
        x: p.x,
        y: p.y - 30,
        w: 400,
        h: 50,
        color,
        text: "Your text",
        font,
        size: 34,
      };
      onCommit([...items, item]);
      onSelect(item.id);
      return;
    }
    if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { mode: "draw", start: p, kind: tool };
      onSelect(null);
      return;
    }
    if (tool === "select") onSelect(null);
  }

  function startItem(event: React.PointerEvent, item: Item, corner?: "nw" | "ne" | "sw" | "se") {
    if (tool !== "select") return;
    event.stopPropagation();
    overlay.current!.setPointerCapture(event.pointerId);
    onSelect(item.id);
    const start = toPage(event);
    drag.current = corner
      ? { mode: "resize", id: item.id, corner, start, origin: item }
      : { mode: "move", id: item.id, start, origin: item };
  }

  function onPointerMove(event: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toPage(event);
    if (d.mode === "draw") {
      let w = p.x - d.start.x;
      let h = p.y - d.start.y;
      if (d.kind === "line" || d.kind === "arrow") {
        if (event.shiftKey) {
          const angle = Math.round(Math.atan2(h, w) / (Math.PI / 12)) * (Math.PI / 12);
          const length = Math.hypot(w, h);
          w = Math.cos(angle) * length;
          h = Math.sin(angle) * length;
        }
      } else if (event.shiftKey) {
        const side = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * side;
        h = Math.sign(h || 1) * side;
      }
      setDraft([
        ...items,
        { id: "draft", kind: d.kind, page: n, x: d.start.x, y: d.start.y, w, h, color, ...(fill && { text: "fill" }) },
      ]);
      return;
    }
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const o = d.origin;
    let next: Item;
    if (d.mode === "move") next = { ...o, x: o.x + dx, y: o.y + dy };
    else {
      const left = d.corner === "nw" || d.corner === "sw";
      const top = d.corner === "nw" || d.corner === "ne";
      let w = Math.max(20, o.w + (left ? -dx : dx));
      let h = Math.max(20, o.h + (top ? -dy : dy));
      // D-044 Shift rules: pictures keep their shape unless Shift; shapes are free unless Shift.
      const keep = o.kind === "image" ? !event.shiftKey : event.shiftKey;
      if (keep) {
        const ratio = o.w / o.h;
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      next = { ...o, w, h, x: left ? o.x + o.w - w : o.x, y: top ? o.y + o.h - h : o.y };
      if (o.kind === "text") next.size = (o.size ?? 34) * (h / o.h);
    }
    setDraft(items.map((i) => (i.id === d.id ? next : i)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || !draft) return;
    if (d.mode === "draw") {
      const made = draft.find((i) => i.id === "draft")!;
      if (Math.hypot(made.w, made.h) > 12) {
        const item = normalise({ ...made, id: `s${Date.now()}` });
        onCommit([...items, item]);
        onSelect(item.id);
      }
    } else onCommit(draft);
    setDraft(null);
  }

  return (
    <div className="relative" style={{ width }}>
      <MockPage n={n} large />
      <div
        ref={overlay}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cx(
          "absolute inset-0",
          tool === "hand" ? "" : tool === "select" ? "cursor-default" : "cursor-crosshair",
        )}
        style={{ touchAction: tool === "select" || tool === "hand" ? "auto" : "none" }}
        aria-label={`Page ${n}`}
        role="group"
      >
        {shown.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            unit={unit}
            selected={item.id === selected && tool === "select"}
            onStart={startItem}
            interactive={tool === "select"}
          />
        ))}
      </div>
    </div>
  );
}

function normalise(item: Item): Item {
  if (item.kind === "line" || item.kind === "arrow") return item;
  return {
    ...item,
    x: Math.min(item.x, item.x + item.w),
    y: Math.min(item.y, item.y + item.h),
    w: Math.abs(item.w),
    h: Math.abs(item.h),
  };
}

function ItemView({
  item,
  unit,
  selected,
  interactive,
  onStart,
}: {
  item: Item;
  unit: number;
  selected: boolean;
  interactive: boolean;
  onStart: (event: React.PointerEvent, item: Item, corner?: "nw" | "ne" | "sw" | "se") => void;
}) {
  const box = normalise(item);
  const style = {
    left: box.x * unit,
    top: box.y * unit,
    width: Math.max(box.w * unit, 2),
    height: Math.max(box.h * unit, 2),
  };
  if (item.kind === "line" || item.kind === "arrow") {
    const x2 = item.x + item.w;
    const y2 = item.y + item.h;
    return (
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <defs>
          <marker id={`head-${item.id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill={item.color} />
          </marker>
        </defs>
        <line
          x1={item.x * unit}
          y1={item.y * unit}
          x2={x2 * unit}
          y2={y2 * unit}
          stroke={item.color}
          strokeWidth={Math.max(2, 4 * unit)}
          strokeLinecap="round"
          {...(item.kind === "arrow" && { markerEnd: `url(#head-${item.id})` })}
        />
      </svg>
    );
  }
  return (
    <div
      onPointerDown={(event) => onStart(event, item)}
      className={cx("absolute", interactive && "cursor-move", selected && "outline-2 outline-offset-2 outline-primary")}
      style={style}
    >
      {item.kind === "rect" && (
        <div
          className="size-full rounded-[2px] border-[3px]"
          style={{ borderColor: item.color, background: item.text === "fill" ? `${item.color}33` : undefined }}
        />
      )}
      {item.kind === "ellipse" && (
        <div
          className="size-full rounded-[50%] border-[3px]"
          style={{ borderColor: item.color, background: item.text === "fill" ? `${item.color}33` : undefined }}
        />
      )}
      {item.kind === "image" && (
        <img src={item.url} alt="Signature" draggable={false} className="size-full select-none" />
      )}
      {item.kind === "text" && (
        <div
          className="size-full overflow-visible leading-none whitespace-nowrap"
          style={{
            fontFamily: TEXT_FONTS.find((f) => f.value === item.font)?.css,
            fontSize: (item.size ?? 34) * unit,
            color: item.color,
          }}
        >
          {item.text}
        </div>
      )}
      {selected &&
        (["nw", "ne", "sw", "se"] as const).map((corner) => (
          <span
            key={corner}
            onPointerDown={(event) => onStart(event, item, corner)}
            className={cx(
              "absolute size-3.5 rounded-full border-2 border-primary bg-surface shadow-sm max-sm:size-5",
              corner === "nw" && "-top-2 -left-2 cursor-nwse-resize",
              corner === "ne" && "-top-2 -right-2 cursor-nesw-resize",
              corner === "sw" && "-bottom-2 -left-2 cursor-nesw-resize",
              corner === "se" && "-right-2 -bottom-2 cursor-nwse-resize",
            )}
          />
        ))}
    </div>
  );
}
