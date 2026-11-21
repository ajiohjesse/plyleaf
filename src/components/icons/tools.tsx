// Each tool's icon, in Duotone for sticky tiles (D-046). Kept apart from the interface icons so only the tool grid,
// tool pages and the tool finder load them.
import { makeIcon, type IconProps } from "./glyph";
import { glyphs } from "./tool-glyphs";

const names: Record<string, string> = {
  "merge-pdf": "arrows-merge",
  "split-pdf": "scissors",
  "extract-pages": "squares-four",
  "delete-pages": "trash",
  "rotate-pdf": "arrows-clockwise",
  "reorder-pages": "arrows-down-up",
  "insert-blank-page": "file-plus",
  "duplicate-pages": "copy",
  "crop-pdf": "crop",
  "jpg-to-pdf": "image",
  "scan-to-pdf": "camera",
  "pdf-to-jpg": "images",
  "extract-images": "file-image",
  "pdf-to-text": "file-txt",
  "html-to-pdf": "file-html",
  "markdown-to-pdf": "file-md",
  "text-to-pdf": "notepad",
  "edit-pdf": "pencil-simple",
  "annotate-pdf": "highlighter",
  "sign-pdf": "signature",
  "fill-pdf-form": "textbox",
  "redact-pdf": "eye-slash",
  "compress-pdf": "gauge",
  "protect-pdf": "lock-simple",
  "unlock-pdf": "lock-simple-open",
  "pdf-permissions": "key",
  "grayscale-pdf": "drop",
  "flatten-pdf": "stack",
  "repair-pdf": "wrench",
  "pdf-metadata": "tag",
  "add-page-numbers": "list-numbers",
  "watermark-pdf": "stamp",
  "header-footer": "rows",
  "bates-numbering": "barcode",
};

const icons = Object.fromEntries(
  Object.entries(names).map(([slug, name]) => [slug, makeIcon(glyphs, name, "duotone")]),
);

export function ToolIcon({ slug, className }: { slug: string } & IconProps) {
  const Icon = icons[slug];
  if (!Icon) throw new Error(`No icon for tool ${slug} in src/components/icons/tools.tsx`);
  return <Icon {...(className && { className })} />;
}
