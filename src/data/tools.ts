/**
 * The tool catalogue shown on the home page grid and in the footer (GOAL.md §5).
 * A tool gets `available: true` once its page exists; until then the grid shows it as "soon" and doesn't link it.
 */

export type CategoryId = "organize" | "convert" | "edit-sign" | "optimize-secure" | "advanced";

export interface Category {
  id: CategoryId;
  name: string;
  /** Sticky-note colour token used for the category's tiles (DESIGN.md "Tool category colours"). */
  sticky: "yellow" | "lavender" | "pink" | "mint" | "coral";
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: CategoryId;
  /** Extra words people search for, used by the grid filter. */
  keywords?: string[];
  available?: boolean;
}

export const categories: Category[] = [
  { id: "organize", name: "Organize", sticky: "yellow" },
  { id: "convert", name: "Convert", sticky: "lavender" },
  { id: "edit-sign", name: "Edit & sign", sticky: "pink" },
  { id: "optimize-secure", name: "Optimize & secure", sticky: "mint" },
  { id: "advanced", name: "Page tools", sticky: "coral" },
];

export const tools: Tool[] = [
  // Organize
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine PDFs and images into one file, in any order.",
    category: "organize",
    keywords: ["combine", "join"],
    available: true,
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    // Splitting by file size and by bookmark can follow; say so here once they work.
    description: "Split into files by page ranges or every N pages.",
    category: "organize",
    keywords: ["separate", "divide"],
    available: true,
  },
  {
    slug: "extract-pages",
    name: "Extract pages",
    description: "Pull the pages you need into a new PDF.",
    category: "organize",
    available: true,
  },
  {
    slug: "delete-pages",
    name: "Delete pages",
    description: "Remove pages you don't want.",
    category: "organize",
    keywords: ["remove"],
    available: true,
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Turn pages the right way up.",
    category: "organize",
    keywords: ["turn"],
    available: true,
  },
  {
    slug: "reorder-pages",
    name: "Reorder pages",
    description: "Drag pages into a new order.",
    category: "organize",
    keywords: ["sort", "rearrange", "move"],
    available: true,
  },
  {
    slug: "insert-blank-page",
    name: "Insert blank page",
    description: "Add empty pages anywhere.",
    category: "organize",
    keywords: ["add page"],
    available: true,
  },
  {
    slug: "duplicate-pages",
    name: "Duplicate pages",
    description: "Copy pages within a document.",
    category: "organize",
    keywords: ["copy"],
    available: true,
  },
  {
    slug: "crop-pdf",
    name: "Crop PDF",
    description: "Trim margins or cut pages to size.",
    category: "organize",
    keywords: ["trim", "margins"],
    available: true,
  },

  // Convert
  {
    slug: "jpg-to-pdf",
    name: "Images to PDF",
    description: "JPG, PNG, WebP, HEIC, GIF and TIFF to PDF.",
    category: "convert",
    keywords: ["jpg", "png", "heic", "photo", "picture"],
    available: true,
  },
  {
    slug: "scan-to-pdf",
    name: "Scan to PDF",
    description: "Use your phone camera to scan paper.",
    category: "convert",
    keywords: ["camera", "scanner"],
    available: true,
  },
  {
    slug: "pdf-to-jpg",
    name: "PDF to images",
    description: "Save pages as JPG, PNG or WebP.",
    category: "convert",
    keywords: ["jpg", "png", "picture"],
    available: true,
  },
  {
    slug: "extract-images",
    name: "Extract images",
    description: "Save every image inside a PDF.",
    category: "convert",
    keywords: ["pictures"],
    available: true,
  },
  {
    slug: "word-to-pdf",
    name: "Office to PDF",
    description: "Word, Excel, PowerPoint and ODF to PDF.",
    category: "convert",
    keywords: ["word", "docx", "excel", "xlsx", "powerpoint", "pptx"],
  },
  {
    slug: "pdf-to-word",
    name: "PDF to Word",
    description: "Turn a PDF into an editable DOCX.",
    category: "convert",
    keywords: ["docx", "doc"],
  },
  {
    slug: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Pull tables out into a spreadsheet.",
    category: "convert",
    keywords: ["xlsx", "table", "spreadsheet"],
  },
  {
    slug: "pdf-to-powerpoint",
    name: "PDF to PowerPoint",
    description: "Turn pages into slides.",
    category: "convert",
    keywords: ["pptx", "slides"],
  },
  {
    slug: "pdf-to-text",
    name: "PDF to text",
    description: "Copy out all the text.",
    category: "convert",
    keywords: ["txt"],
  },

  // Edit & sign
  {
    slug: "edit-pdf",
    name: "Edit PDF",
    description: "Add and change text, images and shapes.",
    category: "edit-sign",
    keywords: ["text", "write"],
  },
  {
    slug: "annotate-pdf",
    name: "Annotate PDF",
    description: "Highlight, underline, draw and comment.",
    category: "edit-sign",
    keywords: ["highlight", "comment", "draw", "markup"],
  },
  {
    slug: "sign-pdf",
    name: "Sign PDF",
    description: "Draw, type or upload your signature.",
    category: "edit-sign",
    keywords: ["signature", "esign"],
  },
  {
    slug: "fill-pdf-form",
    name: "Fill PDF form",
    description: "Fill in forms, interactive or not.",
    category: "edit-sign",
    keywords: ["form", "acroform"],
  },
  {
    slug: "redact-pdf",
    name: "Redact PDF",
    description: "Remove sensitive text for good.",
    category: "edit-sign",
    keywords: ["blackout", "censor", "hide"],
  },

  // Optimize & secure
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Make files smaller, three strengths.",
    category: "optimize-secure",
    keywords: ["reduce", "shrink", "size"],
    available: true,
  },
  {
    slug: "ocr-pdf",
    name: "OCR PDF",
    description: "Make scanned PDFs searchable.",
    category: "optimize-secure",
    keywords: ["scan", "recognize", "searchable"],
  },
  {
    slug: "protect-pdf",
    name: "Protect PDF",
    description: "Add a password (AES-256).",
    category: "optimize-secure",
    keywords: ["password", "encrypt", "lock"],
  },
  {
    slug: "unlock-pdf",
    name: "Unlock PDF",
    description: "Remove a password you know.",
    category: "optimize-secure",
    keywords: ["password", "decrypt"],
  },
  {
    slug: "pdf-permissions",
    name: "Edit permissions",
    description: "Control printing, copying and editing.",
    category: "optimize-secure",
    keywords: ["restrict"],
  },
  {
    slug: "grayscale-pdf",
    name: "Grayscale PDF",
    description: "Convert colour pages to black and white.",
    category: "optimize-secure",
    keywords: ["black and white", "greyscale", "gray", "grey"],
    available: true,
  },
  {
    slug: "flatten-pdf",
    name: "Flatten PDF",
    description: "Bake forms and notes into the page.",
    category: "optimize-secure",
  },
  {
    slug: "repair-pdf",
    name: "Repair PDF",
    description: "Fix damaged or broken files.",
    category: "optimize-secure",
    keywords: ["fix", "corrupt"],
  },
  {
    slug: "pdf-metadata",
    name: "Edit metadata",
    description: "Change or strip title, author and more.",
    category: "optimize-secure",
    keywords: ["properties", "author"],
  },

  // Page tools
  {
    slug: "add-page-numbers",
    name: "Page numbers",
    description: "Number pages, your style.",
    category: "advanced",
    keywords: ["numbering"],
  },
  {
    slug: "watermark-pdf",
    name: "Watermark",
    description: "Stamp text or an image on pages.",
    category: "advanced",
    keywords: ["stamp"],
  },
  {
    slug: "header-footer",
    name: "Header & footer",
    description: "Add text to the top or bottom.",
    category: "advanced",
  },
  {
    slug: "bates-numbering",
    name: "Bates numbering",
    description: "Legal-style page identifiers.",
    category: "advanced",
    keywords: ["legal"],
  },
];

/** Lowercases and strips accents so "Résumé" matches "resume". */
function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Tools whose name, description or keywords contain every word of the query. An empty query returns all tools. */
export function filterTools(list: readonly Tool[], query: string): Tool[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter((tool) => {
    const haystack = normalise([tool.name, tool.description, ...(tool.keywords ?? [])].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
