import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { engine } from "~/engine/client";
import { outputName } from "~/download/download";
import { cssFont, FONTS, unsupportedCharacters } from "~/editor/fonts";
import { change, settle, startHistory, type History } from "~/editor/history";
import {
  DEFAULT_TEXT,
  fromHex,
  isEmpty,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  moveItem,
  newId,
  removeItem,
  toEdits,
  toHex,
  updateItem,
  type Item,
  type ItemId,
  type TextItem,
  type TextStyle,
} from "~/editor/items";
import { operationFailureMessage } from "~/intake/files";
import type { ReadyDocument } from "~/intake/intake";
import { thumbnails } from "~/thumbnails/thumbnails";
import { NEAR, ON_SCREEN, useViewportObserver } from "~/components/thumbnails/ThumbnailGrid";
import { ActionBar, FailureAlert, plural, primaryButton } from "~/components/workspace/parts";
import { EditorPage, type PageHandlers, type Tool } from "./EditorPage";
import { SelectIcon, TextIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from "./icons";
import { baselineRatio } from "./measure";

/** Zoom steps, as multiples of the size that fits the pages to the screen's width. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** "Fit" never shows a page larger than this many CSS pixels per point. */
const MAX_FIT = 1.5;

interface Props {
  doc: ReadyDocument;
  onSaved: (file: Blob, name: string) => void;
}

/**
 * The editor: every page of the document, with what the user adds drawn over it, a toolbar of tools, and the button
 * that saves a copy with the additions written into the pages. Everything added can be selected, moved and changed
 * until then.
 */
export function Editor({ doc, onSaved }: Props) {
  const [history, setHistory] = useState<History<Item[]>>(() => startHistory([]));
  const items = history.present;
  // A text box that hasn't had anything typed yet. It joins the items (and the history) with its first character.
  const [draft, setDraft] = useState<TextItem | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<ItemId | null>(null);
  const [editing, setEditing] = useState<ItemId | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT);
  const [zoom, setZoom] = useState(ZOOMS.indexOf(1));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const observeNear = useViewportObserver(NEAR);
  const observeOnScreen = useViewportObserver(ON_SCREEN);
  useEffect(() => () => thumbnails.forget(doc.info.id), [doc.info.id]);

  const shown = draft ? [...items, draft] : items;
  const selectedItem = shown.find((item) => item.id === selected) ?? null;
  const update = useCallback(
    (next: (items: Item[]) => Item[], merge: string | null = null) =>
      setHistory((current) => change(current, next(current.present), merge)),
    [],
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale(boardRef, doc);
  const scale = fit * ZOOMS[zoom]!;

  function place(page: number, x: number, y: number) {
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
          const moved = moveItem(item, x - item.x, y - item.y, page);
          if (isDraft) setDraft({ ...item, ...moved });
          else update((list) => updateItem(list, item.id, moved), `move:${item.id}`);
        },
        onMoveEnd: () => setHistory(settle),
        onActivate: () => setEditing(item.id),
        onRemove: () => {
          if (isDraft) setDraft(null);
          else update((list) => removeItem(list, item.id));
          setSelected(null);
        },
        onText: (text) => {
          if (!isDraft) return update((list) => updateItem(list, item.id, { text }), `text:${item.id}`);
          if (text === "") return setDraft({ ...item, text });
          update((list) => [...list, { ...item, text }], `text:${item.id}`);
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
      };
    },
  };

  function restyle(patch: Partial<TextStyle>) {
    setTextStyle((style) => ({ ...style, ...patch }));
    if (selectedItem?.kind !== "text") return;
    if (draft?.id === selectedItem.id) setDraft({ ...draft, ...patch });
    else {
      const key = Object.keys(patch).join();
      update((list) => updateItem(list, selectedItem.id, patch), `style:${selectedItem.id}:${key}`);
    }
  }

  async function save() {
    setWorking(true);
    setError(null);
    try {
      const bytes = await engine.transform(doc.info.id, { edits: toEdits(items) });
      onSaved(new Blob([bytes], { type: "application/pdf" }), outputName(doc.name, "edited"));
    } catch (failure) {
      setError(operationFailureMessage(failure));
    } finally {
      setWorking(false);
    }
  }

  const changes = items.filter((item) => !isEmpty(item)).length;
  const textOptions = tool === "text" || selectedItem?.kind === "text";
  const missing = selectedItem?.kind === "text" ? unsupportedCharacters(selectedItem.text) : [];

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
          <p className="ml-auto hidden px-2 text-sm text-ink-muted md:block" aria-live="polite">
            {hint(tool, selectedItem, editing)}
          </p>
        </div>
        {/* Floats over the board, so the pages don't jump when it appears. */}
        {textOptions && (
          <TextOptions
            style={selectedItem?.kind === "text" ? selectedItem : textStyle}
            onChange={restyle}
            onRemove={selectedItem ? () => handlers.handlersFor(selectedItem).onRemove() : undefined}
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
  if (editing) return "Type your text. Press Esc or click outside when you're done.";
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

function ToolButton({
  label,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-lg text-ink hover:bg-ink/10 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent aria-pressed:bg-primary aria-pressed:text-on-primary aria-pressed:hover:bg-primary-hover"
    >
      {children}
    </button>
  );
}

const fieldClass =
  "rounded-lg border-2 border-line bg-surface px-2 py-1.5 text-base focus:border-primary focus:outline-none";

/** Font, size, bold, italic and colour for the selected text, or for new text. */
function TextOptions({
  style,
  onChange,
  onRemove,
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  onRemove: (() => void) | undefined;
}) {
  const ids = { font: useId(), size: useId(), colour: useId() };
  const [sizeText, setSizeText] = useState<string | null>(null);
  return (
    <fieldset className="absolute inset-x-0 top-full mt-2 min-w-0 rounded-card border border-line bg-surface shadow-sticky">
      <legend className="sr-only">Text options</legend>
      {/* One row that scrolls sideways on a phone, rather than wrapping over the page. */}
      <div className="flex items-center gap-x-3 overflow-x-auto px-3 py-2 whitespace-nowrap">
        <label htmlFor={ids.font} className="sr-only">
          Font
        </label>
        <select
          id={ids.font}
          value={style.font}
          onChange={(event) => onChange({ font: event.target.value as TextStyle["font"] })}
          className={fieldClass}
        >
          {FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1">
          <label htmlFor={ids.size} className="text-sm">
            Size
          </label>
          <input
            id={ids.size}
            type="number"
            inputMode="numeric"
            min={MIN_TEXT_SIZE}
            max={MAX_TEXT_SIZE}
            value={sizeText ?? String(style.size)}
            onChange={(event) => {
              setSizeText(event.target.value);
              const size = Number(event.target.value);
              if (Number.isFinite(size) && size >= MIN_TEXT_SIZE && size <= MAX_TEXT_SIZE) onChange({ size });
            }}
            onBlur={() => setSizeText(null)}
            className={`${fieldClass} w-18`}
          />
        </span>
        <span className="flex items-center gap-1">
          <ToggleButton label="Bold" pressed={style.bold} onClick={() => onChange({ bold: !style.bold })}>
            <span className="font-bold">B</span>
          </ToggleButton>
          <ToggleButton label="Italic" pressed={style.italic} onClick={() => onChange({ italic: !style.italic })}>
            <span className="font-serif italic">I</span>
          </ToggleButton>
        </span>
        <span className="flex items-center gap-1">
          <label htmlFor={ids.colour} className="text-sm">
            Colour
          </label>
          <input
            id={ids.colour}
            type="color"
            value={toHex(style.color)}
            onChange={(event) => onChange({ color: fromHex(event.target.value) })}
            className="h-9 w-11 cursor-pointer rounded-lg border-2 border-line bg-surface p-0.5"
          />
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-pill px-3 text-sm font-semibold hover:bg-ink/10"
          >
            <TrashIcon />
            Delete
          </button>
        )}
      </div>
    </fieldset>
  );
}

function ToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border-2 border-line text-lg hover:border-primary aria-pressed:border-primary aria-pressed:bg-sticky-lavender/40"
    >
      {children}
    </button>
  );
}
