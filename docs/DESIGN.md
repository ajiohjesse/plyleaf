# Plyleaf: Design Direction

Reference: [design/style-reference.jpg](design/style-reference.jpg), a playful, collaborative SaaS landing page in the
style of whiteboard/sticky-note products. We take its **feel**, not its brand: no copied logos, illustrations or exact colours.

## What we take from the reference

1. **Huge, heavy, tightly-set headlines** in near-black on white ("Digitize handwritten stickies").
2. **Bright white page with soft grey section bands** that alternate to give rhythm.
3. **One saturated blue** for primary actions, always as **pill-shaped** buttons.
4. **Sticky-note pastels** (yellow, pink, lavender) as content cards and decoration.
5. **Canvas/whiteboard motifs**: blue selection frames with corner handles, cursor arrows, small floating triangles and
   circles, chunky diagonal stripes behind hero objects.
6. **A product frame showcase**: a large bordered app window showing the real tool.
7. **Feature grid** of small illustrated tiles with a bold title and one line of grey copy.
8. **Comparison table** ("us vs other tools") with simple + marks. We'll use this for our core message.
9. **Wide CTA band** before a **dark navy footer** with multi-column links.

## Tokens (starting values; adjust in M0 for contrast)

```css
:root {
  /* ink & surfaces */
  --ink:          #0f0d2e;  /* headlines, body text (deep navy-black) */
  --ink-muted:    #5b5a73;  /* secondary copy */
  --surface:      #ffffff;
  --surface-band: #f4f4f7;  /* alternating section background */
  --line:         #e5e5ec;

  /* brand */
  --primary:        #3d4ef5; /* pill buttons, links, selection frames */
  --primary-hover:  #2c3ce0;
  --on-primary:     #ffffff;

  /* sticky-note accents (decoration + tool-category colours) */
  --sticky-yellow:   #ffd43b;
  --sticky-pink:     #ffb3c1;
  --sticky-coral:    #ff7a85;
  --sticky-lavender: #b9c1ff;
  --sticky-mint:     #a8e6cf;

  /* footer */
  --footer-bg:  #0e0b3a;
  --footer-ink: #c9c8e6;

  --radius-card: 14px;
  --radius-pill: 999px;
  --shadow-sticky: 0 2px 0 rgba(15,13,46,.06), 0 10px 24px -12px rgba(15,13,46,.25);
}
```

Dark mode: an inverted ink/surface set with the same accents. Ship it in M9, but define tokens for it from M0.

## Typography
- **Display:** *Outfit* 800 (Google Fonts), tracking −2%, line-height 1.0–1.05. Hero size `clamp(2.75rem, 6vw, 5rem)`.
- **Body/UI:** *Figtree* 400/500/600, 16px base, line-height 1.55.
- Self-host fonts (no Google Fonts request at runtime) to keep the "no third-party requests" privacy story clean.

## Tool category colours
Each tool category gets a sticky colour used in its icon tile and its page hero:
Organize = yellow · Convert = lavender · Edit & Sign = pink · Optimize & Secure = mint · Advanced = coral.

## Page blueprints

**Home**
1. Hero: headline "Every PDF tool. Actually free." + subline "No sign-up. No watermark. Your files never leave your device." +
   a big drop zone + a tilted sticky-note illustration of a PDF with a blue selection frame.
2. Promise strip (where the reference has customer logos): ✓ No sign-up · ✓ No limits · ✓ No upload · ✓ Open source.
3. Product frame: the real editor in a browser window frame, with floating cursor arrows.
4. Tool grid: all tools as sticky tiles grouped by category, searchable.
5. Comparison table: Plyleaf vs "typical online PDF tools" — download without account, daily limits, watermark,
   files uploaded, price.
6. "How it works locally" explainer with a simple diagram.
7. CTA band + navy footer.

**Tool page** (`/merge-pdf` etc.): compact hero in the category colour, drop zone above the fold, then the workspace
replaces the hero in place once files are added (no page navigation, no modal). Below: 3-step how-to, FAQ, related tools.

**Workspace**: thumbnails/pages on a light canvas background (the "board"), toolbar floating like the reference's
board UI, selection handles in `--primary`, primary action ("Download") as a pill, always visible, never gated.

## Interaction tone
- Microcopy is friendly and short ("Drop PDFs here", "Done — your file is ready").
- Motion is subtle: sticky notes settle with a slight rotation; respect `prefers-reduced-motion`.
- The "done" screen shows: Download (primary), "Continue with another tool" chips, and a quiet "Plyleaf is free
  because it runs on your device. ♥ Support it" link. Never a modal.
