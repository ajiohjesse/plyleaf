import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { cssFont, FONTS, unsupportedCharacters } from "~/editor/fonts";
import { canRedo, canUndo, change, redo, settle, startHistory, undo, type History } from "~/editor/history";
import { formatDate, type DateFormat } from "~/editor/dates";
import { changedFields, fieldEdits, type FieldInput } from "~/editor/forms";
import type { Box, FormField } from "~/engine/types";
import { fittedSize, placedSize, type SignatureKind } from "~/sign/ink";
import { queryExpression, type SearchQuery } from "~/redact/search";
import { SignPanel } from "~/components/sign/SignPanel";
import { useSignatures, type Signature } from "~/components/sign/useSignatures";
import {
  clickedShape,
  DEFAULT_INK,
  DEFAULT_SHAPE,
  DEFAULT_TEXT,
  DEFAULT_TICK,
  drawnShape,
  inkOrigin,
  isEmpty,
  moveItem,
  newId,
  removeItem,
  rewriteLine,
  unchanged,
  thinStroke,
  toEdits,
  MARKUP_COLOURS,
  NOTE_COLOUR,
  NOTE_SIZE,
  STAMP_RATIO,
  STAMP_WIDTH,
  STAMPS,
  quadBounds,
  alreadyRedacted,
  redactionOver,
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
  type TickItem,
  type TickStyle,
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
  DateIcon,
  EditTextIcon,
  HighlightIcon,
  ImageIcon,
  InitialsIcon,
  PenIcon,
  RedactIcon,
  RedoIcon,
  SelectIcon,
  ShapeIcon,
  SignIcon,
  StampIcon,
  TextIcon,
  TickIcon,
  UndoIcon,
  WhiteoutIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";
import { baselineRatio } from "./measure";
import {
  DateOptions,
  InkOptions,
  MarkupOptions,
  NoteOptions,
  RedactOptions,
  ShapeOptions,
  StampOptions,
  TextOptions,
  TickOptions,
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
  /**
   * Fill PDF form: a PDF with no fields to fill opens with the text tool (to type on a flat form) at a form's usual
   * text size.
   */
  fillForm?: boolean;
}

/**
 * The editor: every page of the document, with what the user adds drawn over it, a toolbar of tools, and the button
 * that saves a copy with the additions written into the pages. Everything added can be selected, moved and changed
 * until then.
 */
export function Editor({ doc, onSaved, initialTool = "select", suffix = "edited", fillForm = false }: Props) {
  const [history, setHistory] = useState<History<Item[]>>(() => startHistory([]));
  const items = history.present;
  // A text box that hasn't had anything typed yet. It joins the items (and the history) with its first character.
  const [draft, setDraft] = useState<TextItem | NoteItem | null>(null);
  const [noteColour, setNoteColour] = useState(NOTE_COLOUR);
  const [stamp, setStamp] = useState({ name: STAMPS[0]!.name, color: STAMPS[0]!.color });
  // A form with nothing to fill in opens ready to type on (Fill PDF form).
  const flatForm = fillForm && doc.info.formFields === 0;
  const [tool, setTool] = useState<Tool>(flatForm ? "text" : initialTool);
  const [selected, setSelected] = useState<ItemId | null>(null);
  const [editing, setEditing] = useState<ItemId | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyle>(fillForm ? { ...DEFAULT_TEXT, size: 12 } : DEFAULT_TEXT);
  const [tickStyle, setTickStyle] = useState<TickStyle>(DEFAULT_TICK);
  const [dateFormat, setDateFormat] = useState<DateFormat>("numeric");
  // The document's interactive form fields (null until they're read), and what the user has filled in, by field name.
  const [fields, setFields] = useState<FormField[] | null>(doc.info.formFields > 0 ? null : []);
  const [fieldValues, setFieldValues] = useState<ReadonlyMap<string, FieldInput>>(new Map());
  const [flatten, setFlatten] = useState(false);
  // With redactions, the document's properties (title, author…) are removed too unless the user says not to.
  const [removeProperties, setRemoveProperties] = useState(true);
  const [searching, setSearching] = useState(false);
  const { signatures, storage, add: addSignature, remove: forgetSignature } = useSignatures();
  // The signature (and initials) the Sign tool puts down: the one chosen, or else the newest.
  const [chosen, setChosen] = useState<Record<SignatureKind, string | null>>({ signature: null, initials: null });
  // An empty signature field the user pressed before having a signature: the next one made or chosen goes in it.
  const [signTarget, setSignTarget] = useState<{ page: number; box: Box } | null>(null);
  // Each signature's picture, added to the assets once.
  const signatureAssets = useRef(new Map<string, AssetId>());
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE);
  // A shape being drawn: shown, but not an item until the pointer is let go.
  const [sketch, setSketch] = useState<Item | null>(null);
  const [coverColour, setCoverColour] = useState(WHITE);
  const [inkStyle, setInkStyle] = useState<InkStyle>(DEFAULT_INK);
  const [markupStyle, setMarkupStyle] = useState<MarkupStyle>("highlight");
  const [markupColours, setMarkupColours] = useState(MARKUP_COLOURS);
  const [notice, setNotice] = useState<string | null>(
    flatForm
      ? "This PDF has no fields to fill in, so you can type anywhere: click where the words should go. Use Add tick for boxes, and Sign for your signature."
      : null,
  );
  // For the date tool. Read once, when the editor opens.
  const [today] = useState(() => new Date());
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

  useEffect(() => {
    if (doc.info.formFields === 0) return;
    let current = true;
    engine.formFields(doc.info.id).then(
      (found) => current && setFields(found),
      () => current && setFields([]),
    );
    return () => {
      current = false;
    };
  }, [doc.info.id, doc.info.formFields]);

  const ofKind = (kind: SignatureKind) => signatures.filter((signature) => signature.kind === kind);
  const chosenSignature = (kind: SignatureKind): Signature | undefined =>
    ofKind(kind).find((signature) => signature.id === chosen[kind]) ?? ofKind(kind).at(-1);

  /** The asset showing a signature, added the first time it's used. */
  function signatureAsset(signature: Signature): AssetId {
    const known = signatureAssets.current.get(signature.id);
    if (known) return known;
    const asset: Asset = {
      id: newId(),
      name: signature.kind === "signature" ? "Signature" : "Initials",
      bytes: signature.png,
      url: URL.createObjectURL(new Blob([signature.png.slice()], { type: "image/png" })),
    };
    setAssets((current) => new Map(current).set(asset.id, asset));
    signatureAssets.current.set(signature.id, asset.id);
    return asset.id;
  }

  /** Puts a signature (or initials) on a page: centred on a point, or fitted into a signature field's box. */
  function placeSignature(signature: Signature, page: number, at: { x: number; y: number } | { box: Box }) {
    const info = doc.info.pages[page]!;
    let size: { width: number; height: number };
    let centre: { x: number; y: number };
    if ("box" in at) {
      const [x0, y0, x1, y1] = at.box;
      size = fittedSize(signature.width, signature.height, { width: x1 - x0, height: y1 - y0 });
      centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    } else {
      size = placedSize(signature.width, signature.height, signature.kind);
      centre = at;
    }
    const x = Math.min(Math.max(0, centre.x - size.width / 2), Math.max(0, info.width - size.width));
    const y = Math.min(Math.max(0, centre.y - size.height / 2), Math.max(0, info.height - size.height));
    setNotice(null);
    add({ id: newId(), kind: "image", page, x, y, ...size, asset: signatureAsset(signature), role: signature.kind });
  }

  /** Chooses a signature for the Sign tool; one wanted for a signature field goes straight into it. */
  function chooseSignature(signature: Signature) {
    setChosen((current) => ({ ...current, [signature.kind]: signature.id }));
    if (signTarget && signature.kind === "signature") {
      placeSignature(signature, signTarget.page, { box: signTarget.box });
      setSignTarget(null);
    }
  }

  const pageFields = groupByPage(fields ?? []);
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
    if (tool === "sign" || tool === "initials") {
      const signature = chosenSignature(tool === "sign" ? "signature" : "initials");
      if (!signature) {
        return setNotice(
          tool === "sign"
            ? "Make your signature first, above the pages."
            : "Make your initials first, above the pages.",
        );
      }
      return placeSignature(signature, page, { x, y });
    }
    if (tool === "tick") {
      const { size } = tickStyle;
      const tick: TickItem = { id: newId(), kind: "tick", page, x: x - size / 2, y: y - size / 2, ...tickStyle };
      // Forms usually have several boxes to tick, so the tool stays on.
      update((list) => [...list, tick]);
      return;
    }
    if (tool === "date") {
      const ascent = baselineRatio(cssFont(textStyle.font, textStyle.bold, textStyle.italic)) * textStyle.size;
      const text = formatDate(today, dateFormat);
      return add({ id: newId(), kind: "text", page, x, y: y + ascent, text, ...textStyle });
    }
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
    if (tool === "redact") return void redactWordAt(page, x, y);
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

  /** Redact tool, a click: the word there, or a box of the usual size where there's no text (a scan, a picture). */
  async function redactWordAt(page: number, x: number, y: number) {
    let selection;
    try {
      selection = await engine.selectText(doc.info.id, page, { x, y }, { x, y }, true);
    } catch (failure) {
      return setError(operationFailureMessage(failure));
    }
    const info = doc.info.pages[page]!;
    const item: Item =
      selection.quads.length > 0
        ? redactionOver(page, quadBounds(selection.quads), info, selection.text)
        : { id: newId(), kind: "redact", page, ...clickedShape({ ...shapeStyle, shape: "rectangle" }, x, y) };
    setNotice(null);
    update((list) => [...list, item]);
  }

  /** Marks every match of a search for redaction, as one step. */
  async function redactMatches(query: SearchQuery) {
    const expression = queryExpression(query);
    if (!expression) return;
    setSearching(true);
    setError(null);
    try {
      const found = await engine.findText(doc.info.id, expression);
      const marked: Item[] = [];
      let matches = 0;
      for (const { page, matches: onPage } of found) {
        for (const match of onPage) {
          matches++;
          for (const box of match.boxes) {
            if (alreadyRedacted([...items, ...marked], page, box)) continue;
            marked.push(redactionOver(page, box, doc.info.pages[page]!, match.text));
          }
        }
      }
      const pages = new Set(marked.map((item) => item.page)).size;
      if (matches === 0) {
        setNotice(
          "Nothing found. If this is a scan, its pages are pictures of text with nothing to search: make it searchable with OCR PDF first, or draw boxes over what to redact.",
        );
      } else if (marked.length === 0) {
        setNotice(`All ${plural(matches, "match", "matches")} found are already marked.`);
      } else {
        update((list) => [...list, ...marked]);
        setNotice(
          `Marked ${plural(matches, "match", "matches")} on ${plural(pages, "page")}. Check them, then download. Undo takes them back, and a mark you select can be deleted.`,
        );
      }
    } catch (failure) {
      setError(operationFailureMessage(failure));
    } finally {
      setSearching(false);
    }
  }

  const handlers: PageHandlers = {
    onPlace: place,
    onPickLine: (page, line) => {
      const item = rewriteLine(line, page);
      // One step with the typing that follows; if the words stay the same, it's dropped again.
      update((list) => [...list, item], `text:${item.id}`);
      setSelected(item.id);
      setEditing(item.id);
      setTool("select");
    },
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
      } else if (tool === "redact") {
        item = { id, kind: "redact", page, ...drawnShape({ ...shapeStyle, shape: "rectangle" }, from, to) };
      } else return;
      if (!done) return setSketch(item);
      setSketch(null);
      // Redacting is usually several areas, so the tool stays on.
      if (item.kind === "redact") return update((list) => [...list, item]);
      add(item);
    },
    onBackground: () => {
      setSelected(null);
      setEditing(null);
    },
    onFieldChange: (name, value) => setFieldValues((current) => new Map(current).set(name, value)),
    onSignField: (field) => {
      const signature = chosenSignature("signature");
      if (signature) return placeSignature(signature, field.page, { box: field.box });
      // No signature yet: make one, and it goes in this field.
      setSignTarget({ page: field.page, box: field.box });
      setSelected(null);
      setTool("sign");
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
          const moved = {
            ...moveItem(item, x - item.x, y - item.y, page),
            ...(item.kind === "text" && { moved: true }),
          };
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
          } else if (unchanged(item)) {
            // Opened but left as it was: nothing to rewrite. Just opened, its step is taken back as if it never was.
            setHistory((current) =>
              current.open === `text:${item.id}`
                ? undo(current)
                : change(current, removeItem(current.present, item.id)),
            );
            setSelected(null);
          } else if (isEmpty(item)) {
            // Emptied: it goes, in the same step as the typing, so one undo brings back the text it had.
            update((list) => removeItem(list, item.id), `text:${item.id}`);
            setSelected(null);
          }
          setHistory(settle);
        },
        onResize: (width, height) =>
          update(
            (list) => updateItem(list, item.id, item.kind === "tick" ? { size: width } : { width, height }),
            `size:${item.id}`,
          ),
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
      const edits = { ...toEdits(items, assets), fields: fieldEdits(fields ?? [], fieldValues) };
      const bytes = await engine.transform(doc.info.id, {
        edits,
        ...(flatten && { flatten: "all" as const }),
        ...(redactions > 0 && removeProperties && { metadata: "remove" as const }),
      });
      onSaved(new Blob([bytes], { type: "application/pdf" }), outputName(doc.name, suffix));
    } catch (failure) {
      setError(operationFailureMessage(failure));
    } finally {
      setWorking(false);
    }
  }

  const filledIn = changedFields(fields ?? [], fieldValues).length;
  const redactions = items.filter((item) => item.kind === "redact").length;
  const changes = items.filter((item) => !isEmpty(item)).length + filledIn;
  // Flattening is offered once there's something it would fix in place: fields, or annotations old or new.
  const flattenable =
    (fields?.length ?? 0) > 0 ||
    doc.info.annotations > 0 ||
    items.some((item) => ["markup", "ink", "note", "stamp"].includes(item.kind));
  const tickOptions = tool === "tick" || selectedItem?.kind === "tick";
  const textOptions = tool === "text" || selectedItem?.kind === "text";
  const shapeOptions = tool === "shape" || selectedItem?.kind === "shape";
  const whiteoutOptions = tool === "whiteout" || selectedItem?.kind === "whiteout";
  const redactOptions = tool === "redact" || selectedItem?.kind === "redact";
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
            label="Sign"
            pressed={tool === "sign"}
            onClick={() => {
              setTool(tool === "sign" ? "select" : "sign");
              setSelected(null);
              setSignTarget(null);
            }}
          >
            <SignIcon />
          </ToolButton>
          <ToolButton
            label="Add initials"
            pressed={tool === "initials"}
            onClick={() => {
              setTool(tool === "initials" ? "select" : "initials");
              setSelected(null);
              setSignTarget(null);
            }}
          >
            <InitialsIcon />
          </ToolButton>
          <ToolButton
            label="Add date"
            pressed={tool === "date"}
            onClick={() => {
              setTool(tool === "date" ? "select" : "date");
              setSelected(null);
            }}
          >
            <DateIcon />
          </ToolButton>
          <ToolButton
            label="Add tick"
            pressed={tool === "tick"}
            onClick={() => {
              setTool(tool === "tick" ? "select" : "tick");
              setSelected(null);
            }}
          >
            <TickIcon />
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
          <ToolButton
            label="Redact"
            pressed={tool === "redact"}
            onClick={() => {
              setTool(tool === "redact" ? "select" : "redact");
              setSelected(null);
            }}
          >
            <RedactIcon />
          </ToolButton>
          <ToolButton
            label="Edit text"
            pressed={tool === "retext"}
            onClick={() => {
              setTool(tool === "retext" ? "select" : "retext");
              setSelected(null);
            }}
          >
            <EditTextIcon />
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
        {(tool === "sign" || tool === "initials") && (
          <SignPanel
            key={tool}
            kind={tool === "sign" ? "signature" : "initials"}
            signatures={ofKind(tool === "sign" ? "signature" : "initials")}
            chosen={chosenSignature(tool === "sign" ? "signature" : "initials")?.id ?? null}
            storage={storage}
            onChoose={chooseSignature}
            onForget={(signature) => {
              setChosen((current) => ({ ...current, [signature.kind]: null }));
              void forgetSignature(signature);
            }}
            onMake={async (image, remember) => {
              chooseSignature(await addSignature(tool === "sign" ? "signature" : "initials", image, remember));
            }}
          />
        )}
        {tool === "date" && <DateOptions format={dateFormat} today={today} onChange={setDateFormat} />}
        {tickOptions && (
          <TickOptions
            style={selectedItem?.kind === "tick" ? selectedItem : tickStyle}
            onChange={(patch) => {
              setTickStyle((style) => ({ ...style, ...patch }));
              if (selectedItem?.kind === "tick") {
                const key = Object.keys(patch).join();
                update((list) => updateItem(list, selectedItem.id, patch), `style:${selectedItem.id}:${key}`);
              }
            }}
            onRemove={removeSelected}
          />
        )}
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
        {redactOptions && (
          <RedactOptions
            searching={searching}
            onSearch={(query) => void redactMatches(query)}
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
      {selectedItem?.kind === "text" && selectedItem.replaces && !selectedItem.replaces.exact && (
        <output className="block rounded-card border-2 border-sticky-yellow bg-sticky-yellow/30 px-4 py-3">
          This line is in {selectedItem.replaces.fontName}, which can&apos;t be reused here. It will be written in{" "}
          {FONTS.find((font) => font.id === selectedItem.font)!.label.toLowerCase()}, the closest standard font.
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
              fields={pageFields[index] ?? NO_FIELDS}
              fieldValues={fieldValues}
              group={doc.info.id}
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
          working
            ? "Saving…"
            : changes === 0
              ? fields && fields.length > 0
                ? "Fill in the form, or add something to the pages, then download."
                : "Add something to the pages, then download."
              : [
                  redactions > 0 && `${plural(redactions, "area")} to redact for good`,
                  filledIn > 0 && `${plural(filledIn, "field")} filled in`,
                  changes - filledIn - redactions > 0 && plural(changes - filledIn - redactions, "edit"),
                ]
                  .filter(Boolean)
                  .join(", ")
        }
      >
        {redactions > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeProperties}
              onChange={(event) => setRemoveProperties(event.target.checked)}
            />
            <span>
              Also remove the document&apos;s properties <span className="text-ink-muted">(title, author…)</span>
            </span>
          </label>
        )}
        {flattenable && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} />
            <span>
              Flatten <span className="text-ink-muted">(fields and annotations can&apos;t be changed afterwards)</span>
            </span>
          </label>
        )}
        <button
          type="button"
          disabled={working || (changes === 0 && !flatten)}
          className={primaryButton}
          onClick={() => void save()}
        >
          {working ? "Saving…" : "Download PDF"}
        </button>
      </ActionBar>
    </div>
  );
}

const NO_FIELDS: readonly FormField[] = [];

function hint(tool: Tool, selected: Item | null, editing: ItemId | null) {
  if (tool === "text") return "Click the page where the text should go.";
  if (tool === "sign") return "Click the page where your signature should go.";
  if (tool === "initials") return "Click the page where your initials should go.";
  if (tool === "date") return "Click the page where the date should go.";
  if (tool === "tick") return "Click each box to tick it.";
  if (tool === "retext") return "Click a line of the page's text to change it.";
  if (tool === "markup") return "Drag across the text to mark, or click a word.";
  if (tool === "note") return "Click the page where the comment should go.";
  if (tool === "stamp") return "Choose a stamp, then click the page to put it there.";
  if (tool === "draw") return "Draw on the page. Each stroke can be moved or deleted afterwards.";
  if (tool === "shape") return "Drag across the page to draw, or click to place one.";
  if (tool === "whiteout")
    return "Drag over what to cover. It's hidden, not removed from the file: to remove it, use Redact.";
  if (tool === "redact")
    return "Drag over what to remove, click a word, or find words above. It's removed when you download.";
  if (editing) return "Type, then press Esc or click outside when you're done.";
  if (selected?.kind === "markup") return "Change its kind or colour, or delete it.";
  if (selected?.kind === "redact") return "Drag to move, or the corner to resize. Delete it to keep what's under it.";
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

/** Form fields by page. */
function groupByPage(fields: readonly FormField[]): FormField[][] {
  const pages: FormField[][] = [];
  for (const field of fields) (pages[field.page] ??= []).push(field);
  return pages;
}
