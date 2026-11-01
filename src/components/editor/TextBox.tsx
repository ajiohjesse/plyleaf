import { useLayoutEffect, useRef } from "react";
import { LINE_HEIGHT } from "~/engine/types";
import { cssFont } from "~/editor/fonts";
import { toHex, type TextItem } from "~/editor/items";
import { baselineRatio } from "./measure";
import { useItemGestures, type ItemHandlers } from "./gestures";
import { SelectionFrame } from "./SelectionFrame";

interface Props extends ItemHandlers {
  item: TextItem;
  /** CSS pixels per point. */
  scale: number;
  selected: boolean;
  editing: boolean;
  onText: (text: string) => void;
  onEndEdit: () => void;
}

/**
 * A text item on the page: shown in the browser's stand-in for its standard font, at its baseline. Selected, it can be
 * dragged or nudged; editing, it's a textarea that grows with what's typed.
 */
export function TextBox({ item, scale, selected, editing, onText, onEndEdit, ...handlers }: Props) {
  const font = cssFont(item.font, item.bold, item.italic);
  const ascent = baselineRatio(font) * item.size;
  const gestures = useItemGestures(item, scale, selected, handlers);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!editing) return;
    const area = areaRef.current!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [editing]);

  const style: React.CSSProperties = {
    left: item.x * scale,
    top: (item.y - ascent) * scale,
    fontSize: item.size * scale,
    lineHeight: LINE_HEIGHT,
    color: toHex(item.color),
    ...font,
    touchAction: editing ? undefined : "none",
  };
  const label = item.text.trim() ? `Text: ${item.text}` : "New text";

  return (
    <div
      data-item={item.id}
      data-kind="text"
      className={`absolute whitespace-pre ${editing ? "" : "cursor-move select-none"}`}
      style={style}
      {...(editing ? {} : gestures)}
      role={editing ? undefined : "button"}
      tabIndex={editing ? undefined : 0}
      aria-label={editing ? undefined : label}
      aria-pressed={editing ? undefined : selected}
    >
      {/* Sizes the box (and the textarea over it). The zero-width space keeps a last empty line's height. */}
      <span aria-hidden={editing} className={editing ? "invisible" : undefined}>
        {item.text}
        {"​"}
      </span>
      {editing && (
        <textarea
          ref={areaRef}
          aria-label="Text"
          value={item.text}
          wrap="off"
          spellCheck
          onChange={(event) => onText(event.target.value)}
          onBlur={onEndEdit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="absolute inset-0 -mr-1 resize-none overflow-hidden border-0 bg-transparent p-0 outline-2 outline-offset-2 outline-primary outline-dashed"
          style={{ font: "inherit", lineHeight: LINE_HEIGHT, color: "inherit", width: "calc(100% + 0.25rem)" }}
        />
      )}
      {selected && !editing && <SelectionFrame />}
    </div>
  );
}
