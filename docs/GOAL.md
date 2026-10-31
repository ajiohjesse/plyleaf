# Plyleaf — Product Goal

> **Every PDF tool you need. Actually free. No sign-up, no watermark, no upload.**

This is the north-star document. Every session working on Plyleaf reads it first.
It changes only when the owner approves. Log any change in [DECISIONS.md](DECISIONS.md).

---

## 1. The problem

Most "free" online PDF tools hide the price until the end. You edit, annotate and sign the document, and then
the download button asks you to create an account, then to start a trial, then to pay. Others cap you at
2 or 3 tasks per hour or day, stamp a watermark on the result, or upload your private documents to their servers.

## 2. The goal

Build **Plyleaf**: a web app with every major feature of the leading online PDF tools
(iLovePDF, Smallpdf, Sejda, PDF24, Adobe Acrobat online), where:

1. **Every feature is free, with no limits.** No task quotas, no file-size paywall, no "Pro" tier, no watermark.
2. **Downloading never needs an account.** You open the site, do the work and download the result.
3. **Files never leave the device.** All processing runs in the browser (WebAssembly + Web Workers).
   This is both the privacy promise and the reason the app can stay free: there are no servers to pay for.
4. **It's open source (AGPL-3.0),** so anyone can check promises 1 to 3 themselves.

## 3. Non-negotiable principles

These override any other consideration. A change that breaks one is a bug.

| # | Principle | In practice |
|---|-----------|-------------|
| P1 | **Free forever, all features** | No paid tier, no feature flags tied to payment, no "upgrade" prompts. Donations are optional and never gate anything. |
| P2 | **No account required, ever** | No sign-in screen in any flow. There is no account system at all (see DECISIONS D-003). |
| P3 | **Local-first processing** | User files are processed in the browser. No user file bytes go over the network. The only exception is a feature the user explicitly opts into, with clear disclosure (see M8 gate). |
| P4 | **No watermarks or degraded output** | Output is the same quality you'd pay for elsewhere. |
| P5 | **Honest UI** | No dark patterns, fake progress bars, countdowns or nag modals. A cookie-free analytics setup means no cookie banner either. |
| P6 | **Fast and light** | Tool pages are static HTML. Heavy engines (WASM) are loaded lazily, only when a file is dropped. |
| P7 | **Accessible** | WCAG 2.2 AA: keyboard operable, screen-reader labelled, sufficient contrast. |

## 4. Who it's for

- People who need a quick one-off PDF task (merge, compress, sign) and are tired of paywalls.
- Privacy-conscious users and organisations that can't upload documents to third parties.
- Mobile users: phone-friendly, including camera scan-to-PDF.

## 5. Feature scope (v1.0)

Grouped as they appear in the app. **(E)** = in the unified Editor workspace.

**Organize**
- Merge PDFs (and images) · Split (by range, every N pages, by size, by bookmark) · Extract pages
- Delete pages · Rotate pages · Reorder pages by drag and drop · Insert blank pages · Duplicate pages
- Crop pages · N-up, several pages per sheet *(v1.x)*

**Convert to PDF**
- JPG / PNG / WebP / HEIC / GIF / TIFF → PDF · Scan to PDF (phone camera, with edge detection and perspective fix)
- Word / Excel / PowerPoint / ODF → PDF · HTML / plain text / Markdown → PDF

**Convert from PDF**
- PDF → JPG / PNG / WebP (per page, chosen DPI) · Extract images · PDF → plain text
- PDF → Word (DOCX) · PDF → Excel (XLSX, table detection) · PDF → PowerPoint (PPTX, pages as slides)
- PDF → PDF/A, archival *(v1.x)*

**Edit & annotate (E)**
- Add text (fonts, size, colour) · Edit existing text (best effort: same font where available)
- Add images · Shapes (rectangle, ellipse, line, arrow) · Whiteout
- Highlight / underline / strikethrough · Freehand drawing · Sticky-note comments · Stamps
- Undo / redo · Zoom · Page thumbnails sidebar

**Sign & forms (E)**
- Fill interactive (AcroForm) forms · Type on non-interactive forms
- Signature: draw / type / upload image; initials; date stamp. Saved signatures stay **on this device only** (IndexedDB)
- Flatten forms and annotations

**Optimize & secure**
- Compress (low / recommended / extreme, with before and after sizes) · Grayscale
- Protect with password (AES-256) · Unlock (with the known password) · Edit permissions
- True redaction (content removed, not covered), including search-and-redact
- OCR → searchable PDF (multiple languages)
- Edit metadata · Remove metadata · Repair corrupted PDFs

**Page tools**
- Page numbers · Watermark (text/image) · Header and footer · Bates numbering

**Extras (v1.x)**
- Compare two PDFs (visual and text diff) · Batch mode (same tool on many files) · Saved "workflows" (tool chains)

**Platform**
- Installable PWA that **works offline** after first visit
- Responsive from 360 px phones to desktop
- i18n-ready (English first; string catalogue from day one)

### Explicitly out of scope
- User accounts, cloud storage, sharing links, team features (they conflict with P2/P3 and cost money to run).
- AI chat-with-PDF, translation, e-signature *workflows* with audit trails (send for signing). Revisit after v1.0.
- Native desktop/mobile apps (the PWA covers this).

## 6. Success criteria for v1.0

- Every feature in §5 (except Extras) works in the latest Chrome, Edge, Firefox and Safari (desktop + iOS/Android).
- A 100-page, 50 MB PDF can be merged, compressed and edited on a mid-range laptop without the tab crashing.
- Tool landing pages: Lighthouse Performance ≥ 95, Accessibility = 100, SEO = 100.
- E2E test coverage: every tool has at least one Playwright test that processes a fixture file and checks the output.
- Network audit: an automated test checks that processing a file sends **zero** requests containing file data.
- Deployed at `plyleaf.com` with a privacy page, an open-source link and an optional donation page.

## 7. Milestones

Each milestone ends in something that's deployed and usable. Status lives in [PROGRESS.md](PROGRESS.md).
A milestone is **done** only when every item in its "Done when" list is true and checked in PROGRESS.md.

### M0: Foundation
Repo, tooling, design system and the deployed landing page shell.
- Done when: Astro + React + TS + Tailwind project builds; lint, typecheck, unit tests and Playwright run in CI (GitHub Actions);
  design tokens from [DESIGN.md](DESIGN.md) are implemented; the landing page (hero, tool grid, comparison table, footer)
  is live on a Cloudflare Pages preview URL; LICENSE (AGPL-3.0) and README are in place.

### M1: Engine and core architecture
The reusable plumbing every tool sits on.
- Done when: a PDF engine runs in a Web Worker behind a typed API (Comlink); the engine spike in DECISIONS.md is resolved
  (MuPDF.js vs pdf-lib + pdf.js, with numbers); there is shared file intake (drag-drop, picker, paste, multiple files),
  page-thumbnail rendering (virtualised for 500+ pages), a download/"save as" pipeline and an error and memory-limit UX;
  a test asserts that no file bytes leave the browser.

### M2: Organize suite
- Done when: merge, split, extract, delete, rotate, reorder, insert blank, duplicate and crop all work, each with
  its own SEO landing page plus one shared "Organize" workspace; there are E2E tests for each.

### M3: Images and scanning
- Done when: images → PDF (including HEIC), PDF → images, extract images and camera scan-to-PDF
  (edge detection + perspective correction) all work on mobile and desktop.

### M4: Optimize and secure
- Done when: compress (3 levels, with before and after sizes), grayscale, protect, unlock, permissions, flatten, repair,
  and metadata edit/remove all work and are verified with external tools (e.g. qpdf --check) in tests.

### M5: Editor
The unified editing workspace, the heart of the app.
- Done when: text, images, shapes, whiteout, markup annotations, freehand, comments, stamps, page numbers, watermark,
  header/footer, Bates numbering and undo/redo all work; edit existing text works for standard fonts; output opens correctly in Acrobat Reader,
  Chrome and macOS Preview.

### M6: Sign and forms
- Done when: AcroForm filling, typing on flat forms, signatures (draw/type/upload) saved locally, initials, date stamps
  and flatten all work.

### M7: Redact and OCR
- Done when: true redaction (verified: redacted text can't be extracted from the output), search-and-redact, and OCR to a
  searchable PDF with a language picker all work; OCR language data loads lazily.

### M8: Office conversions (decision gate)
- Gate: spike client-side options (LibreOffice/ZetaOffice WASM, office2pdf WASM, docx-preview + print) for fidelity, bundle size and speed.
  If client-side quality isn't acceptable, present the owner with an opt-in server fallback (self-hosted Gotenberg,
  files deleted right after conversion, clearly disclosed) **for a decision**. Don't build the server without approval.
- Done when: Word/Excel/PowerPoint/ODF/HTML → PDF and PDF → Word/Excel/PowerPoint/text work at the agreed quality bar.

### M9: Launch readiness
- Done when: PWA offline mode works; Lighthouse targets from §6 are met; WCAG 2.2 AA audit passes; privacy, about,
  open-source and donate pages exist; sitemap and per-tool metadata are in place; cookie-free analytics is on; production deploy is at plyleaf.com.

### M10: v1.x extras
- Done when: compare PDFs, batch mode, saved workflows, PDF/A and N-up have shipped.
