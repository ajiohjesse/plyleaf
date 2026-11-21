import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwiseIcon,
  ArrowsDownUpIcon,
  ArrowsMergeIcon,
  BarcodeIcon,
  CameraIcon,
  CopyIcon,
  CropIcon,
  DropIcon,
  EraserIcon,
  FileHtmlIcon,
  FileMdIcon,
  FilePlusIcon,
  FileTxtIcon,
  FrameCornersIcon,
  GaugeIcon,
  HighlighterIcon,
  ImageIcon,
  ImagesIcon,
  ListNumbersIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  RowsIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  SignatureIcon,
  SquaresFourIcon,
  StackIcon,
  StampIcon,
  TagIcon,
  TextboxIcon,
  TrashIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import type { CategoryId } from "~/data/tools";

export const toolIcons: Record<string, Icon> = {
  "merge-pdf": ArrowsMergeIcon,
  "split-pdf": ScissorsIcon,
  "extract-pages": SquaresFourIcon,
  "delete-pages": TrashIcon,
  "rotate-pdf": ArrowsClockwiseIcon,
  "reorder-pages": ArrowsDownUpIcon,
  "insert-blank-page": FilePlusIcon,
  "duplicate-pages": CopyIcon,
  "crop-pdf": CropIcon,
  "jpg-to-pdf": ImageIcon,
  "scan-to-pdf": CameraIcon,
  "pdf-to-jpg": ImagesIcon,
  "extract-images": ImagesIcon,
  "pdf-to-text": FileTxtIcon,
  "html-to-pdf": FileHtmlIcon,
  "markdown-to-pdf": FileMdIcon,
  "text-to-pdf": FileTxtIcon,
  "edit-pdf": PencilSimpleIcon,
  "annotate-pdf": HighlighterIcon,
  "sign-pdf": SignatureIcon,
  "fill-pdf-form": TextboxIcon,
  "redact-pdf": EraserIcon,
  "compress-pdf": GaugeIcon,
  "protect-pdf": LockSimpleIcon,
  "unlock-pdf": LockSimpleOpenIcon,
  "pdf-permissions": ShieldCheckIcon,
  "grayscale-pdf": DropIcon,
  "flatten-pdf": StackIcon,
  "repair-pdf": WrenchIcon,
  "pdf-metadata": TagIcon,
  "add-page-numbers": ListNumbersIcon,
  "watermark-pdf": StampIcon,
  "header-footer": RowsIcon,
  "bates-numbering": BarcodeIcon,
};

export const categoryIcons: Record<CategoryId, Icon> = {
  organize: SquaresFourIcon,
  convert: FrameCornersIcon,
  "edit-sign": NotePencilIcon,
  "optimize-secure": ShieldCheckIcon,
  advanced: ListNumbersIcon,
};

export function ToolIcon({ slug, className = "size-5" }: { slug: string; className?: string }) {
  const Glyph = toolIcons[slug] ?? FilePlusIcon;
  return <Glyph weight="duotone" className={className} aria-hidden="true" />;
}

/** D-045: which tools are steps, which start a working document and which end with a download. */
export type Role = "step" | "start" | "ends";
const STARTS = new Set(["jpg-to-pdf", "scan-to-pdf", "html-to-pdf", "markdown-to-pdf", "text-to-pdf"]);
const ENDS = new Set(["split-pdf", "pdf-to-jpg", "extract-images", "pdf-to-text"]);
export const roleOf = (slug: string): Role => (STARTS.has(slug) ? "start" : ENDS.has(slug) ? "ends" : "step");
