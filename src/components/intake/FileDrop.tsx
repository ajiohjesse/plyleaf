import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { preloadEngine } from "~/engine/client";
import type { FileKind } from "~/intake/files";

const acceptAttribute: Record<FileKind, string> = {
  pdf: "application/pdf,.pdf",
  image: "image/*,.heic,.heif",
};

interface Props {
  onFiles: (files: File[]) => void;
  accept?: readonly FileKind[];
  multiple?: boolean;
  /** A smaller zone, for adding more files once a workspace has some. */
  compact?: boolean;
}

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Where files come in: a picker, a drop anywhere on the page, or a paste. Starts loading the engine as soon as the
 * user reaches for a file (hovering or focusing the picker, or dragging a file over the page).
 */
export function FileDrop({ onFiles, accept = ["pdf"], multiple = true, compact = false }: Props) {
  const inputId = useId();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const zoneRef = useRef<HTMLLabelElement>(null);
  // Always calls the latest onFiles, so the window listeners below are added once.
  const take = useEffectEvent((files: File[]) => onFiles(files));

  useEffect(() => {
    // dragenter and dragleave fire for every element the pointer crosses; count them to know when it left the page.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (depth++ === 0) {
        setDragging(true);
        preloadEngine();
      }
    };
    const leave = (event: DragEvent) => {
      if (hasFiles(event) && --depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    // Without this the browser would open a file dropped outside the zone in place of the page.
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) take(files);
    };
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      preloadEngine();
      take(files);
    };
    const listeners = [
      ["dragenter", enter],
      ["dragleave", leave],
      ["dragover", over],
      ["drop", drop],
      ["paste", paste],
    ] as const;
    for (const [type, listener] of listeners) window.addEventListener(type, listener as EventListener);
    // Marks the zone once the page-wide listeners are in place (tests wait for it).
    zoneRef.current?.setAttribute("data-listening", "");
    return () => {
      for (const [type, listener] of listeners) window.removeEventListener(type, listener as EventListener);
    };
  }, []);

  const both = accept.includes("image") && accept.includes("pdf");
  const noun = accept.includes("image") ? (both ? "files" : "images") : "PDFs";
  const one = accept.includes("image") ? (both ? "file" : "image") : "PDF";
  const title = compact
    ? multiple
      ? `Add more ${noun}`
      : `Use a different ${one}`
    : multiple
      ? `Drop ${both ? "PDFs or images" : noun} here`
      : `Drop a ${one} here`;
  const pick = multiple ? "Choose files" : "Choose a file";

  return (
    <>
      <label
        htmlFor={inputId}
        data-dragging={dragging || undefined}
        ref={zoneRef}
        className={[
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors",
          "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
          dragging ? "border-primary bg-sticky-lavender/30" : "border-ink/25 bg-surface hover:border-primary",
          compact ? "gap-2 px-4 py-5 sm:flex-row sm:gap-4" : "gap-4 px-6 py-12 sm:py-16",
        ].join(" ")}
        onPointerEnter={preloadEngine}
      >
        <svg
          viewBox="0 0 48 48"
          aria-hidden="true"
          className={compact ? "size-8" : "size-14"}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 6h17l9 9v27H12z" className="fill-sticky-yellow" />
          <path d="M29 6v9h9" />
          <path d="M25 37V22m-6 6 6-6 6 6" className="text-primary" />
        </svg>
        <span className={compact ? "font-semibold" : "font-display text-2xl font-extrabold sm:text-3xl"}>
          {dragging ? "Drop to add" : title}
        </span>
        <span className="btn-pill bg-primary text-on-primary group-hover:bg-primary-hover">{pick}</span>
        <span id={hintId} className="text-sm text-ink-muted">
          {compact ? `or drop or paste ${multiple ? "them" : "it"}` : "or paste one. Your files stay on this device."}
        </span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept.map((kind) => acceptAttribute[kind]).join(",")}
          multiple={multiple}
          aria-label={pick}
          aria-describedby={hintId}
          onFocus={preloadEngine}
          onClick={preloadEngine}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            // Clear it so that choosing the same file again still fires a change.
            event.currentTarget.value = "";
            if (files.length > 0) onFiles(files);
          }}
        />
      </label>
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-3 z-50 rounded-card border-4 border-dashed border-primary bg-primary/10"
        />
      )}
    </>
  );
}
