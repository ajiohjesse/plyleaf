import type { CategoryId } from "~/data/tools";

const paths: Record<CategoryId, string> = {
  // Two stacked pages
  organize: "M8 3h9l4 4v11H8z M4 7v14h11",
  // Page with an arrow out
  convert: "M5 3h9l4 4v5 M18 7h-4V3 M5 3v18h7 M14 17h7m-3-3 3 3-3 3",
  // Pen nib
  "edit-sign": "M4 20l1-5L16 4l4 4L9 19z M13 7l4 4 M4 20h7",
  // Shield
  "optimize-secure": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  // Numbered page
  advanced: "M5 3h14v18H5z M9 8h6 M9 12h6 M10 17h4",
};

export function CategoryIcon({ category, className }: { category: CategoryId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[category]} />
    </svg>
  );
}
