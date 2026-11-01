import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { cssFont, unsupportedCharacters } from "~/editor/fonts";
import { canRedo, canUndo, change, redo, settle, startHistory, undo, type History } from "~/editor/history";
import {
  clickedShape,
  DEFAULT_INK,
  DEFAULT_SHAPE,
  DEFAULT_TEXT,
  drawnShape,
  inkOrigin,
  isEmpty,
  moveItem,
  newId,
  removeItem,
  thinStroke,
  toEdits,
  MARKUP_COLOURS,
  NOTE_COLOUR,
  NOTE_SIZE,
  STAMP_RATIO,
  STAMP_WIDTH,
  STAMPS,
  quadBounds,
  updateItem,
  WHITE,
  type Asset,
  type AssetId,
  type ImageItem,
  type InkStyle,
  type Item,
  type ItemId,
  type MarkupItem,
  type NoteItem,
  type MarkupStyle,
  type ShapeStyle,
  type TextItem,
  type TextStyle,
} from "~/editor/items";
import { startingSize } from "~/editor/images";
import type { Point } from "~/editor/shapes";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { thumbnails } from "~/thumbnails/thumbnails";
import { NEAR, ON_SCREEN, useViewportObserver } from "~/components/thumbnails/ThumbnailGrid";
import { ActionBar, FailureAlert, plural, primaryButton } from "~/components/workspace/parts";
import { EditorPage, type PageHandlers, type Tool } from "./EditorPage";
import {
  CommentIcon,
  HighlightIcon,
  ImageIcon,
  PenIcon,
  RedoIcon,
  SelectIcon,
  ShapeIcon,
  StampIcon,
  TextIcon,
  UndoIcon,
  WhiteoutIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";
import { baselineRatio } from "./measure";
import {
  InkOptions,
  MarkupOptions,
  NoteOptions,
  ShapeOptions,
  StampOptions,
  TextOptions,
  WhiteoutOptions,
} from "./options";
import { prepareImage } from "./prepareImage";

/** Zoom steps, as multiples of the size that fits the pages to the screen's width. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** "Fit" never shows a page larger than this many CSS pixels per point. */
const MAX_FIT = 1.5;

interface Props {
  doc: ReadyDocument;
  onSaved: (file: Blob, name: string) => void;
  /** The tool chosen when the file opens. */
  initialTool?: Tool;
  /** Added to the output's name: "report-edited.pdf". */
  suffix?: string;
}

/**
 * The editor: every page of the document, with what the user adds drawn over it, a toolbar of tools, and the button
 * that saves a copy with the additions written into the pages. Everything added can be selected, moved and changed
 * until then.
 */
export function Editor({ doc, onSaved, initialTool = "select", suffix = "edited" }: Props) {
  const [history, setHistory] = useState<History<Item[]>>(() => startHistory([]));
  const items = history.present;
  // A text box that hasn't had anything typed yet. It joins the items (and the history) with its first character.
  const [draft, setDraft] = useState<TextItem | NoteItem | null>(null);
  const [noteColour, setNoteColour] = useState(NOTE_COLOUR);
  const [stamp, setStamp] = useState({ name: STAMPS[0]!.name, color: STAMPS[0]!.color });
  const [tool, setTool] = useState<Tool>(initialTool);
  const [selected, setSelected] = useState<ItemId | null>(null);
  const [editing, setEditing] = useState<ItemId | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE);
  // A shape being drawn: shown, but not an item until the pointer is let go.
  const [sketch, setSketch] = useState<Item | null>(null);
  const [coverColour, setCoverColour] = useState(WHITE);
  const [inkStyle, setInkStyle] = useState<InkStyle>(DEFAULT_INK);
  const [markupStyle, setMarkupStyle] = useState<MarkupStyle>("highlight");
  const [markupColours, setMarkupColours] = useState(MARKUP_COLOURS);
  const [notice, setNotice] = useState<string | null>(null);
  // Text selection asks the engine at every move; only the latest answer counts.
  const selecting = useRef(0);
  const [zoom, setZoom] = useState(ZOOMS.indexOf(1));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const observeNear = useViewportObserver(NEAR);
  const observeOnScreen = useViewportObserver(ON_SCREEN);
  useEffect(() => () => thumbnails.forget(doc.info.id), [doc.info.id]);
  // Pictures added, by id. Kept while the editor is open: undo can bring back an item that uses one.
  const [assets, setAssets] = useState<ReadonlyMap<AssetId, Asset>>(new Map());
  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);
  useEffect(() => () => assetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.url)), []);
  // Pages on screen now, so a new image goes on the page the user is looking at.
  const onScreenPages = useRef(new Set<number>());
  const imageInput = useRef<HTMLInputElement>(null);
  // An item just added, to take keyboard focus (and come into view) once it's on the page.
  const focusing = useRef<ItemId | null>(null);
  useEffect(() => {
    if (!focusing.current) return;
    const element = boardRef.current?.querySelector<HTMLElement>(`[data-item="${focusing.current}"]`);
    if (!element) return;
    focusing.current = null;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
  });

  const shown = [...items, ...(draft ? [draft] : []), ...(sketch ? [sketch] : [])];
  const selectedItem = shown.find((item) => item.id === selected) ?? null;
  const update = useCallback(
    (next: (items: Item[]) => Item[], merge: string | null = null) =>
      setHistory((current) => change(current, next(current.present), merge)),
    [],
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale(boardRef, doc);
  const scale = fit * ZOOMS[zoom]!;

  /** Adds a finished item, selects it and goes back to the select tool. */
  function add(item: Item) {
    update((list) => [...list, item]);
    setSelected(item.id);
    setEditing(null);
    setTool("select");
    focusing.current = item.id;
  }

  /** Marks up the text between two points (or, from a click, the word there); says so when there's none. */
  async function markUp(page: number, from: Point, to: Point, done: boolean, words: boolean) {
    const request = ++selecting.current;
    let selection;
    try {
      selection = await engine.selectText(doc.info.id, page, from, to, words);
    } catch (failure) {
      if (done) setError(operationFailureMessage(failure));
      return;
    }
    if (request !== selecting.current) return;
    const id = sketch?.id ?? newId();
    if (selection.quads.length === 0) {
      setSketch(null);
      if (done) {
        setNotice(
          "There's no text there to mark. Drag across the words, or click one. Scanned pages are pictures of text, so there's nothing to select on them.",
        );
      }
      return;
    }
    const [x, y] = quadBounds(selection.quads);
    const item: MarkupItem = {
      id,
      kind: "markup",
      page,
      style: markupStyle,
      quads: selection.quads,
      text: selection.text,
      color: markupColours[markupStyle],
      x,
      y,
    };
    if (!done) return setSketch(item);
    setSketch(null);
    setNotice(null);
    // Several in a row are usual, so the tool stays on.
    update((list) => [...list, item]);
  }

  function place(page: number, x: number, y: number) {
    if (tool === "stamp") {
      if (!stamp.name.trim()) return setNotice("Type the words for your stamp first.");
      const [width, height] = [STAMP_WIDTH, STAMP_WIDTH * STAMP_RATIO];
      setNotice(null);
      return add({ id: newId(), kind: "stamp", page, x: x - width / 2, y: y - height / 2, width, ...stamp });
    }
    if (tool === "note") {
      // The press is the icon's middle. Like a text box, it joins the items with its first character.
      const half = NOTE_SIZE / 2;
      const note: NoteItem = { id: newId(), kind: "note", page, x: x - half, y: y - half, text: "", color: noteColour };
      setDraft(note);
      setSelected(note.id);
      setEditing(note.id);
      setTool("select");
      return;
    }
    if (tool === "markup") return void markUp(page, { x, y }, { x, y }, true, true);
    if (tool === "shape") {
      return add({ id: newId(), kind: "shape", page, ...shapeStyle, ...clickedShape(shapeStyle, x, y) });
    }
    if (tool === "whiteout") {
      const box = clickedShape({ ...shapeStyle, shape: "rectangle" }, x, y);
      return add({ id: newId(), kind: "whiteout", page, ...box, color: coverColour });
    }
    if (tool !== "text") return;
    // The press marks the top-left of the text box; text is stored by its baseline.
    const ascent = baselineRatio(cssFont(textStyle.font, textStyle.bold, textStyle.italic)) * textStyle.size;
    const item: TextItem = { id: newId(), kind: "text", page, x, y: y + ascent, text: "", ...textStyle };
    setDraft(item);
    setSelected(item.id);
    setEditing(item.id);
    setTool("select");
  }

  const handlers: PageHandlers = {
    onPlace: place,
    onDraw: (page, from, to, done, path) => {
      if (tool === "markup") return void markUp(page, from, to, done, false);
      if (tool === "draw") {
        const points = thinStroke(path);
        const stroke: Item = {
          id: sketch?.id ?? newId(),
          kind: "ink",
          page,
          points,
          ...inkStyle,
          ...inkOrigin(points),
        };
        if (!done) return setSketch(stroke);
        setSketch(null);
        // Drawing is usually several strokes, so the pen stays on.
        return update((list) => [...list, stroke]);
      }
      const id = sketch?.id ?? newId();
      let item: Item;
      if (tool === "shape") item = { id, kind: "shape", page, ...shapeStyle, ...drawnShape(shapeStyle, from, to) };
      else if (tool === "whiteout") {
        const box = drawnShape({ ...shapeStyle, shape: "rectangle" }, from, to);
        item = { id, kind: "whiteout", page, ...box, color: coverColour };
      } else return;
      if (!done) return setSketch(item);
      setSketch(null);
      add(item);
    },
    onBackground: () => {
      setSelected(null);
      setEditing(null);
    },
    handlersFor: (item) => {
      const isDraft = draft?.id === item.id;
      const page = doc.info.pages[item.page]!;
      return {
        onSelect: () => setSelected(item.id),
        onDeselect: () => setSelected(null),
        onMoveTo: (x, y) => {
          // Markup belongs to its text.
          if (item.kind === "markup") return;
          const moved = moveItem(item, x - item.x, y - item.y, page);
          if (isDraft) setDraft({ ...draft, ...moved });
          else update((list) => updateItem(list, item.id, moved), `move:${item.id}`);
        },
        onMoveEnd: () => setHistory(settle),
        onActivate: () => {
          if (item.kind === "text" || item.kind === "note") setEditing(item.id);
        },
        onRemove: () => {
          if (isDraft) setDraft(null);
          else update((list) => removeItem(list, item.id));
          setSelected(null);
        },
        onText: (text) => {
          if (!isDraft) return update((list) => updateItem(list, item.id, { text }), `text:${item.id}`);
          if (text === "") return setDraft({ ...draft, text });
          update((list) => [...list, { ...draft, text }], `text:${item.id}`);
          setDraft(null);
        },
        onEndEdit: () => {
          setEditing(null);
          if (isDraft) {
            setDraft(null);
            setSelected(null);
          } else if (isEmpty(item)) {
            // Emptied: it goes, in the same step as the typing, so one undo brings back the text it had.
            update((list) => removeItem(list, item.id), `text:${item.id}`);
            setSelected(null);
          }
          setHistory(settle);
        },
        onResize: (width, height) => update((list) => updateItem(list, item.id, { width, height }), `size:${item.id}`),
      };
    },
  };

  /** Adds a picked picture to the page on screen, in its middle, and selects it. */
  async function addImage(file: File) {
    setError(null);
    try {
      const prepared = await prepareImage(file);
      const asset: Asset = {
        id: newId(),
        name: file.name,
        bytes: prepared.bytes,
        url: URL.createObjectURL(new Blob([prepared.bytes])),
      };
      setAssets((current) => new Map(current).set(asset.id, asset));
      const page = Math.min(...onScreenPages.current, doc.info.pageCount - 1);
      const info = doc.info.pages[page]!;
      const size = startingSize(prepared, info);
      const item: ImageItem = {
        id: newId(),
        kind: "image",
        page,
        x: (info.width - size.width) / 2,
        y: (info.height - size.height) / 2,
        ...size,
        asset: asset.id,
      };
      add(item);
    } catch {
      setError(`${file.name} couldn't be read as a picture here. Try a JPG or PNG.`);
    }
  }

  function restyleShape(patch: Partial<ShapeStyle>) {
    setShapeStyle((style) => ({ ...style, ...patch }));
    if (selectedItem?.kind !== "shape") return;
    // A drawn shape keeps its kind.
    const { shape: _kind, ...restyled } = patch;
    const key = Object.keys(restyled).join();
    update((list) => updateItem(list, selectedItem.id, restyled), `style:${selectedItem.id}:${key}`);
  }

  function restyle(patch: Partial<TextStyle>) {
    setTextStyle((style) => ({ ...style, ...patch }));
    if (selectedItem?.kind !== "text") return;
    if (draft?.id === selectedItem.id) setDraft({ ...draft, ...patch });
    else {
      const key = Object.keys(patch).join();
      update((list) => updateItem(list, selectedItem.id, patch), `style:${selectedItem.id}:${key}`);
    }
  }

  const [announcement, setAnnouncement] = useState("");
  /** Undoes or redoes a step. What was being typed or placed is finished first, and a selection that's gone clears. */
  function travel(direction: "undo" | "redo") {
    const next = direction === "undo" ? undo(history) : redo(history);
    if (next === history) return;
    setHistory(next);
    setDraft(null);
    setEditing(null);
    if (!next.present.some((item) => item.id === selected)) setSelected(null);
    setAnnouncement(direction === "undo" ? "Undone" : "Redone");
  }

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (⌘ on a Mac). A text field keeps them for its own typing.
  const travelByKey = useEffectEvent(travel);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (key === "z") travelByKey(event.shiftKey ? "redo" : "undo");
      else if (key === "y" && !event.shiftKey) travelByKey("redo");
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    setWorking(true);
    setError(null);
    try {
      const bytes = await engine.transform(doc.info.id, { edits: toEdits(items, assets) });
      onSaved(new Blob([bytes], { type: "application/pdf" }), outputName(doc.name, suffix));
    } catch (failure) {
      setError(operationFailureMessage(failure));
    } finally {
      setWorking(false);
    }
  }

  const changes = items.filter((item) => !isEmpty(item)).length;
  const textOptions = tool === "text" || selectedItem?.kind === "text";
  const shapeOptions = tool === "shape" || selectedItem?.kind === "shape";
  const whiteoutOptions = tool === "whiteout" || selectedItem?.kind === "whiteout";
  const markupOptions = tool === "markup" || selectedItem?.kind === "markup";
  const inkOptions = tool === "draw" || selectedItem?.kind === "ink";
  const noteOptions = tool === "note" || selectedItem?.kind === "note";
  const stampOptions = tool === "stamp" || selectedItem?.kind === "stamp";
  const removeSelected = selectedItem ? () => handlers.handlersFor(selectedItem).onRemove() : undefined;
  const missing =
    selectedItem?.kind === "text"
      ? unsupportedCharacters(selectedItem.text)
      : selectedItem?.kind === "stamp"
        ? unsupportedCharacters(selectedItem.name)
        : tool === "stamp"
          ? unsupportedCharacters(stamp.name)
          : [];

  return (
    <div className="space-y-3">
      <div className="sticky top-[4.25rem] z-20">
        <div
          role="toolbar"
          aria-label="Editing tools"
          className="flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface p-1.5 shadow-sticky"
        >
          <ToolButton label="Select" pressed={tool === "select"} onClick={() => setTool("select")}>
            <SelectIcon />
          </ToolButton>
          <ToolButton
            label="Add text"
            pressed={tool === "text"}
            onClick={() => {
              setTool(tool === "text" ? "select" : "text");
              setSelected(null);
            }}
          >
            <TextIcon />
          </ToolButton>
          <ToolButton
            label="Highlight text"
            pressed={tool === "markup"}
            onClick={() => {
              setTool(tool === "markup" ? "select" : "markup");
              setSelected(null);
            }}
          >
            <HighlightIcon />
          </ToolButton>
          <ToolButton
            label="Draw"
            pressed={tool === "draw"}
            onClick={() => {
              setTool(tool === "draw" ? "select" : "draw");
              setSelected(null);
            }}
          >
            <PenIcon />
          </ToolButton>
          <ToolButton
            label="Add comment"
            pressed={tool === "note"}
            onClick={() => {
              setTool(tool === "note" ? "select" : "note");
              setSelected(null);
            }}
          >
            <CommentIcon />
          </ToolButton>
          <ToolButton
            label="Add stamp"
            pressed={tool === "stamp"}
            onClick={() => {
              setTool(tool === "stamp" ? "select" : "stamp");
              setSelected(null);
            }}
          >
            <StampIcon />
          </ToolButton>
          <ToolButton
            label="Add shape"
            pressed={tool === "shape"}
            onClick={() => {
              setTool(tool === "shape" ? "select" : "shape");
              setSelected(null);
            }}
          >
            <ShapeIcon />
          </ToolButton>
          <ToolButton
            label="Whiteout"
            pressed={tool === "whiteout"}
            onClick={() => {
              setTool(tool === "whiteout" ? "select" : "whiteout");
              setSelected(null);
            }}
          >
            <WhiteoutIcon />
          </ToolButton>
          <ToolButton label="Add image" onClick={() => imageInput.current?.click()}>
            <ImageIcon />
          </ToolButton>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="Image to add"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void addImage(file);
            }}
          />
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <ToolButton label="Undo" shortcut="Control+Z" disabled={!canUndo(history)} onClick={() => travel("undo")}>
            <UndoIcon />
          </ToolButton>
          <ToolButton
            label="Redo"
            shortcut="Control+Shift+Z Control+Y"
            disabled={!canRedo(history)}
            onClick={() => travel("redo")}
          >
            <RedoIcon />
          </ToolButton>
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <ToolButton label="Zoom out" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
            <ZoomOutIcon />
          </ToolButton>
          <output className="min-w-12 text-center text-sm tabular-nums" aria-label="Zoom">
            {Math.round(scale * 100)}%
          </output>
          <ToolButton label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}>
            <ZoomInIcon />
          </ToolButton>
          {/* One line: it gives way (cut short, whole in its tooltip) rather than making the toolbar taller. */}
          <p
            className="hidden min-w-0 flex-1 truncate px-2 text-right text-sm text-ink-muted md:block"
            aria-live="polite"
            title={hint(tool, selectedItem, editing)}
          >
            {hint(tool, selectedItem, editing)}
          </p>
        </div>
        {/* Floats over the board, so the pages don't jump when it appears. */}
        {textOptions && (
          <TextOptions
            style={selectedItem?.kind === "text" ? selectedItem : textStyle}
            onChange={restyle}
            onRemove={removeSelected}
          />
        )}
        {stampOptions && (
          <StampOptions
            key={selectedItem?.kind === "stamp" ? selectedItem.id : "new"}
            stamp={selectedItem?.kind === "stamp" ? selectedItem : stamp}
            onChange={(patch) => {
              setStamp((current) => ({ ...current, ...patch }));
              if (selectedItem?.kind === "stamp") {
                const key = Object.keys(patch).join();
                update((list) => updateItem(list, selectedItem.id, patch), `style:${selectedItem.id}:${key}`);
              }
            }}
            onRemove={removeSelected}
          />
        )}
        {noteOptions && (
          <NoteOptions
            color={selectedItem?.kind === "note" ? selectedItem.color : noteColour}
            onChange={(color) => {
              setNoteColour(color);
              if (selectedItem?.kind !== "note") return;
              if (draft?.id === selectedItem.id) setDraft({ ...draft, color });
              else update((list) => updateItem(list, selectedItem.id, { color }), `style:${selectedItem.id}:color`);
            }}
            onRemove={removeSelected}
          />
        )}
        {inkOptions && (
          <InkOptions
            style={selectedItem?.kind === "ink" ? selectedItem : inkStyle}
            onChange={(patch) => {
              setInkStyle((style) => ({ ...style, ...patch }));
              if (selectedItem?.kind === "ink") {
                const key = Object.keys(patch).join();
                update((list) => updateItem(list, selectedItem.id, patch), `style:${selectedItem.id}:${key}`);
              }
            }}
            onRemove={removeSelected}
          />
        )}
        {markupOptions && (
          <MarkupOptions
            style={selectedItem?.kind === "markup" ? selectedItem.style : markupStyle}
            color={selectedItem?.kind === "markup" ? selectedItem.color : markupColours[markupStyle]}
            onStyle={(style) => {
              setMarkupStyle(style);
              // A mark keeps its colour when it changes kind.
              if (selectedItem?.kind === "markup") {
                update((list) => updateItem(list, selectedItem.id, { style }), `style:${selectedItem.id}:kind`);
              }
            }}
            onColour={(color) => {
              const style = selectedItem?.kind === "markup" ? selectedItem.style : markupStyle;
              setMarkupColours((colours) => ({ ...colours, [style]: color }));
              if (selectedItem?.kind === "markup") {
                update((list) => updateItem(list, selectedItem.id, { color }), `style:${selectedItem.id}:color`);
              }
            }}
            onRemove={removeSelected}
          />
        )}
        {whiteoutOptions && (
          <WhiteoutOptions
            color={selectedItem?.kind === "whiteout" ? selectedItem.color : coverColour}
            onChange={(color) => {
              setCoverColour(color);
              if (selectedItem?.kind === "whiteout") {
                update((list) => updateItem(list, selectedItem.id, { color }), `style:${selectedItem.id}:color`);
              }
            }}
            onRemove={removeSelected}
          />
        )}
        {shapeOptions && (
          <ShapeOptions
            style={selectedItem?.kind === "shape" ? selectedItem : shapeStyle}
            fixedKind={selectedItem?.kind === "shape"}
            onChange={restyleShape}
            onRemove={removeSelected}
          />
        )}
      </div>

      {missing.length > 0 && (
        <output className="block rounded-card border-2 border-sticky-yellow bg-sticky-yellow/30 px-4 py-3">
          {missing.join(" ")} can&apos;t be shown in the standard fonts, so {missing.length === 1 ? "it" : "they"} will
          be left out of the PDF.
        </output>
      )}
      {error && <FailureAlert message={error} />}
      {notice && (
        <output className="block rounded-card border-2 border-sticky-yellow bg-sticky-yellow/30 px-4 py-3">
          {notice}
        </output>
      )}

      {/* Room at the top for the tool options that float under the toolbar. */}
      <div
        ref={boardRef}
        className="overflow-x-auto rounded-card bg-surface-band p-3 pt-16 sm:p-6 sm:pt-18"
        data-editor-board
      >
        <ol aria-label="Pages" className="mx-auto flex w-max flex-col items-center gap-4 sm:gap-6">
          {doc.info.pages.map((page, index) => (
            <EditorPage
              key={index}
              docId={doc.info.id}
              index={index}
              page={page}
              pageCount={doc.info.pageCount}
              scale={scale}
              items={shown.filter((item) => item.page === index)}
              tool={tool}
              selected={selected}
              editing={editing}
              observeNear={observeNear}
              observeOnScreen={observeOnScreen}
              assets={assets}
              onVisible={(visible) => {
                if (visible) onScreenPages.current.add(index);
                else onScreenPages.current.delete(index);
              }}
              {...handlers}
            />
          ))}
        </ol>
      </div>

      <ActionBar
        status={
          working ? "Saving…" : changes === 0 ? "Add something to the pages, then download." : plural(changes, "edit")
        }
      >
        <button type="button" disabled={working || changes === 0} className={primaryButton} onClick={() => void save()}>
          {working ? "Saving…" : "Download PDF"}
        </button>
      </ActionBar>
    </div>
  );
}

function hint(tool: Tool, selected: Item | null, editing: ItemId | null) {
  if (tool === "text") return "Click the page where the text should go.";
  if (tool === "markup") return "Drag across the text to mark, or click a word.";
  if (tool === "note") return "Click the page where the comment should go.";
  if (tool === "stamp") return "Choose a stamp, then click the page to put it there.";
  if (tool === "draw") return "Draw on the page. Each stroke can be moved or deleted afterwards.";
  if (tool === "shape") return "Drag across the page to draw, or click to place one.";
  if (tool === "whiteout") return "Drag over what to cover. It's hidden, not removed from the file.";
  if (editing) return "Type, then press Esc or click outside when you're done.";
  if (selected?.kind === "markup") return "Change its kind or colour, or delete it.";
  if (selected?.kind === "note") return "Drag to move it. Click again, or press Enter, to change the comment.";
  if (selected && selected.kind !== "text")
    return "Drag to move, or use the arrow keys. Drag the corner, or + and -, to resize.";
  if (selected) return "Drag to move, or use the arrow keys. Click again to change the text.";
  return "Choose a tool, then click the page.";
}

/** Scale (CSS pixels per point) at which the widest page fills the board's width, up to MAX_FIT. */
function useFitScale(ref: React.RefObject<HTMLDivElement | null>, doc: ReadyDocument) {
  const [available, setAvailable] = useState(600);
  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => {
      const style = getComputedStyle(element);
      setAvailable(Math.max(1, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  const widest = Math.max(...doc.info.pages.map((page) => page.width));
  return Math.min(MAX_FIT, available / widest);
}

/**
 * A toolbar button. A disabled one is aria-disabled rather than disabled, so it keeps focus (undoing until there's
 * nothing left, say).
 */
function ToolButton({
  label,
  pressed,
  disabled = false,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** For aria-keyshortcuts. */
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={shortcut}
      onClick={disabled ? undefined : onClick}
      className="grid size-10 place-items-center rounded-lg text-ink hover:bg-ink/10 aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-pressed:bg-primary aria-pressed:text-on-primary aria-pressed:hover:bg-primary-hover"
    >
      {children}
    </button>
  );
}
