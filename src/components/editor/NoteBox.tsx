import { useId, useLayoutEffect, useRef } from "react";
import { NOTE_SIZE, toHex, type NoteItem } from "~/editor/items";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: NoteItem;
  scale: number;
  selected: boolean;
  editing: boolean;
  onText: (text: string) => void;
  onEndEdit: () => void;
}

/**
 * A comment: a sticky-note icon on the page, saved as a PDF note annotation that readers open to show the text.
 * Selected, its text shows beside it; activated (Enter, or a press when selected), it's typed into there.
 */
export function NoteBox({ item, scale, selected, editing, onText, onEndEdit, ...handlers }: Props) {
  const gestures = useItemGestures(item, scale, selected, handlers);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textId = useId();
  useLayoutEffect(() => {
    if (!editing) return;
    const area = areaRef.current!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [editing]);
  const size = NOTE_SIZE * scale;
  const colour = toHex(item.color);

  return (
    <div className="absolute" style={{ left: item.x * scale, top: item.y * scale }}>
      <button
        type="button"
        data-item={item.id}
        data-kind="note"
        aria-label={item.text.trim() ? `Comment: ${item.text}` : "New comment"}
        aria-pressed={selected}
        aria-describedby={selected && !editing ? textId : undefined}
        className="relative block cursor-move border-0 bg-transparent p-0 select-none"
        style={{ width: size, height: size, touchAction: "none" }}
        {...gestures}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="block size-full drop-shadow-sm">
          <path d="M2 2h16v12h-7l-5 4v-4H2z" fill={colour} stroke="#0f0d2e" strokeWidth={1} strokeLinejoin="round" />
          <path d="M5 6h10M5 9.5h7" stroke="#0f0d2e" strokeWidth={1} strokeLinecap="round" />
        </svg>
        {selected && !editing && <SelectionFrame />}
      </button>
      {(editing || (selected && item.text)) && (
        <div
          className="absolute top-0 z-10 w-60 rounded-lg border-2 border-ink/15 p-2 shadow-sticky"
          style={{ left: size + 8, backgroundColor: colour }}
        >
          {editing ? (
            <textarea
              ref={areaRef}
              aria-label="Comment"
              value={item.text}
              rows={4}
              onChange={(event) => onText(event.target.value)}
              onBlur={onEndEdit}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="block w-full resize-none rounded border-0 bg-surface/70 p-1.5 text-sm text-ink focus:outline-2 focus:outline-primary"
            />
          ) : (
            <p id={textId} className="text-sm break-words whitespace-pre-wrap text-ink">
              {item.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
