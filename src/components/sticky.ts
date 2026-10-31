import type { Category } from "~/data/tools";

/** Tailwind classes for each sticky-note colour, written out in full so Tailwind finds them. */
export const stickyBg: Record<Category["sticky"], string> = {
  yellow: "bg-sticky-yellow",
  lavender: "bg-sticky-lavender",
  pink: "bg-sticky-pink",
  mint: "bg-sticky-mint",
  coral: "bg-sticky-coral",
};

/** A pale wash of each colour, for a tool page's hero. Ink text on it is at least as legible as on the sticky itself. */
export const stickyWash: Record<Category["sticky"], string> = {
  yellow: "bg-sticky-yellow/30",
  lavender: "bg-sticky-lavender/30",
  pink: "bg-sticky-pink/30",
  mint: "bg-sticky-mint/30",
  coral: "bg-sticky-coral/30",
};
