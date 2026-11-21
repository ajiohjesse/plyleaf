// D-047: fonts load from our own origin only when picked or shown.
const loaders: Record<string, () => Promise<unknown>> = {
  "Dancing Script": () => import("@fontsource/dancing-script/400.css"),
  Caveat: () => import("@fontsource/caveat/400.css"),
  Sacramento: () => import("@fontsource/sacramento/400.css"),
  "Great Vibes": () => import("@fontsource/great-vibes/400.css"),
  Allura: () => import("@fontsource/allura/400.css"),
  "Alex Brush": () => import("@fontsource/alex-brush/400.css"),
  Yellowtail: () => import("@fontsource/yellowtail/400.css"),
  Kalam: () => import("@fontsource/kalam/400.css"),
  Inter: () => import("@fontsource/inter/400.css"),
  Roboto: () => import("@fontsource/roboto/400.css"),
  "Open Sans": () => import("@fontsource/open-sans/400.css"),
  Montserrat: () => import("@fontsource/montserrat/400.css"),
  Lora: () => import("@fontsource/lora/400.css"),
  Merriweather: () => import("@fontsource/merriweather/400.css"),
  "Playfair Display": () => import("@fontsource/playfair-display/400.css"),
  "Roboto Mono": () => import("@fontsource/roboto-mono/400.css"),
};

const loaded = new Map<string, Promise<unknown>>();

export function loadFont(family: string) {
  const load = loaders[family];
  if (!load) return Promise.resolve();
  if (!loaded.has(family))
    loaded.set(
      family,
      load().then(() => document.fonts.load(`32px "${family}"`)),
    );
  return loaded.get(family)!;
}

export const HANDWRITING = [
  "Dancing Script",
  "Caveat",
  "Sacramento",
  "Great Vibes",
  "Allura",
  "Alex Brush",
  "Yellowtail",
  "Kalam",
];

export const TEXT_FONTS = [
  { value: "Helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { value: "Times", label: "Times", css: "'Times New Roman', Times, serif" },
  { value: "Courier", label: "Courier", css: "'Courier New', Courier, monospace" },
  { value: "Inter", label: "Inter", css: "Inter, sans-serif" },
  { value: "Roboto", label: "Roboto", css: "Roboto, sans-serif" },
  { value: "Open Sans", label: "Open Sans", css: "'Open Sans', sans-serif" },
  { value: "Montserrat", label: "Montserrat", css: "Montserrat, sans-serif" },
  { value: "Lora", label: "Lora", css: "Lora, serif" },
  { value: "Merriweather", label: "Merriweather", css: "Merriweather, serif" },
  { value: "Playfair Display", label: "Playfair Display", css: "'Playfair Display', serif" },
  { value: "Roboto Mono", label: "Roboto Mono", css: "'Roboto Mono', monospace" },
];
