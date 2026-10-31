# Plyleaf: Research and Strategy

Research date: 2026-10-31. Competitor limits come from third-party comparison sites (sources at the bottom). Vendors change
them often, so treat them as indicative.

## 1. How existing online PDF tools make money

| Tool | Free tier (as reported) | How it pushes you to pay | Where files are processed |
|------|------------------------|-----------------------|-----------------|
| Smallpdf | ~2 tasks/day | Daily quota, then paywall; "Edit text" is Pro-only; Pro ~$12/mo | Uploaded to their servers |
| iLovePDF | ~3 tasks/hour, page and size caps, ads | Limits + ads; Premium ~$5–7/mo | Uploaded |
| Sejda | 3 tasks/hour, 200 pages or 50 MB per task | Hourly quota; Pro ~$7.50/mo or a week pass | Uploaded (deleted after 2 h); desktop app available |
| Adobe Acrobat online | Annotate only; can't edit body text; account to download or share | Account wall, then 30-day trial that needs a card | Uploaded |
| pdfFiller and similar | 30-day trial, credit card required | Full paywall at download | Uploaded |
| PDF Candy | 1 task/hour | Quota | Uploaded |
| TinyWow | 3 tasks/day, 50 MB, 200 pages | Quota | Uploaded |
| PDF24 | No stated limits, no signup | Ads; desktop app | Mostly uploaded |
| SimplePDF | Editor free with no limits | Business plans for embedding | Client-side editor |
| **BentoPDF** (open source, AGPL) | Free, everything in the browser | None (self-host / commercial licence) | **In the browser (WASM)** |
| **Stirling-PDF** (open source) | Free if you self-host | Hosted/enterprise plans | Your own server |

**What the paid tools have in common:** let the user put in the effort (upload, edit, sign), then block the payoff
(download) behind an account, then behind a payment. Quotas and "Pro-only" badges on the most-wanted features
(edit text, compress hard, OCR, Office conversion) do the rest.

**Why they do it:** server-side processing costs real money per task (CPU, storage, bandwidth), so every free user is a
cost that has to be converted to revenue.

**The opening:** the open-source projects (BentoPDF, Stirling-PDF) show the technology works, but they aren't
consumer products. BentoPDF is a toolbox for technical users and is reported to use 700 MB+ of RAM in a tab;
Stirling-PDF has to be self-hosted. Nobody combines **"free with no catch"** with the **polish and ease of
Smallpdf/iLovePDF**. That's Plyleaf's position.

## 2. Core strategy: process everything in the browser

Running every operation client-side in WebAssembly is what lets us **promise** free:

- **Marginal cost per task = $0.** Users' devices do the work. We serve static files from a CDN.
- **Privacy is real, not marketing copy.** Files never upload, so there is nothing to store, leak or delete.
- **Faster for most tasks.** No upload/download round trip, which matters most for large files and slow connections.
- **Works offline** as a PWA after the first visit.

Running costs at scale: a domain (~$10–15/year) + Cloudflare Pages (free tier: unlimited static bandwidth/requests;
files ≤ 25 MiB, so large WASM/OCR data goes to Cloudflare R2, which has free egress). Realistically **under $50/year**
even with heavy traffic. Nothing needs to be monetised.

### Hard parts, and how we handle them
| Hard part | Approach |
|-----------|----------|
| Office ↔ PDF conversion is heavy client-side | Milestone M8 is a **decision gate**: spike LibreOffice/ZetaOffice WASM and office2pdf WASM first. Only if quality is unacceptable, propose an *opt-in*, clearly disclosed, self-hosted conversion server (Gotenberg) to the owner. |
| Big WASM bundles (MuPDF ~10 MB, Ghostscript ~15 MB, OCR language data) | Load lazily per tool, cache with the service worker, show a one-time "preparing tool…" state. Landing pages ship zero engine code. |
| Memory on large files / phones | Engines in Web Workers, transfer ArrayBuffers instead of copying them, virtualised thumbnails, render at device-appropriate DPI, clear "file too large for this device" errors instead of crashes. |
| Editing existing text in PDFs | Inherently best-effort (font subsetting). Use MuPDF's text/font APIs; fall back to whiteout + overlay text with the closest font. Be honest in the UI. |
| Safari quirks (memory, OPFS, workers) | Safari is in the CI Playwright matrix from M1. |

## 3. Decision: sign-in or not?

**Decision: no accounts at all. Downloading never asks for anything.** (Recorded as D-003.)

| Option | For | Against |
|--------|-----|---------|
| Require sign-in to download | Email list, user count | It's the exact behaviour this product exists to fight. Adds friction at the moment of value. |
| Optional sign-in (for sync/history) | Cross-device signatures and history | Needs servers, auth, a database, GDPR/data-deletion work and security liability. Breaks "files never leave your device". Costs money, which pressures the "free" promise. Few users need it for one-off tasks. |
| **No accounts (chosen)** | Zero friction, zero data liability, zero running cost, a clear and believable promise ("we couldn't paywall you if we wanted to") | No email list (use an optional newsletter link instead); no cross-device sync |

What people would want an account for, we provide **locally**: saved signatures, recent tools and preferences live in
IndexedDB/localStorage with a visible "stored only on this device · clear" control. Export/import of settings as a file
covers moving between devices.

## 4. How Plyleaf stays sustainable without charging

1. **Near-zero costs** (above) mean there's almost nothing to fund.
2. **Optional donations**: GitHub Sponsors / Open Collective / Ko-fi, one quiet link in the footer and on the
   "done" screen. Never a modal, never a gate.
3. **Open source (AGPL-3.0)** earns trust and contributors. The code proves that no files are uploaded.
4. Possible later (owner's decision only, never gating features): non-tracking sponsor slots
   (e.g. EthicalAds) on the landing pages only, never inside tools.

## 5. Growth: how people find PDF tools

People search for tasks: "merge pdf", "compress pdf to 100kb", "jpg to pdf", "sign pdf free". The leaders win on
**one fast, focused page per tool**. So:

- Every tool gets its own static, indexable page (`/merge-pdf`, `/compress-pdf`, …) with a drop zone above the fold,
  a short how-to, an FAQ (with FAQ schema) and the "free, no signup, no upload" promise.
- The comparison table ("Plyleaf vs others: download without account? Daily limits? Files uploaded?") is the
  core message, borrowed from the layout in the style reference.
- Launch channels: Product Hunt, Hacker News (Show HN), r/opensource / r/privacy, AlternativeTo listings next to
  Smallpdf/iLovePDF/Sejda.

## 6. Technology choices

| Concern | Choice | Why |
|---------|--------|-----|
| Site framework | **Astro** (static output) + **React 19** islands + **TypeScript** | Static HTML per tool page (SEO, speed); React only where interactive; Vite underneath handles WASM and workers natively. |
| Styling | **Tailwind CSS v4** + CSS variables for tokens; shadcn/ui primitives where useful | Fast to build a custom look on top of solid, accessible primitives. |
| Core PDF engine | **MuPDF.js** (`mupdf`, AGPL) as the main candidate | Render, edit, annotate, redact, encrypt/decrypt, clean/compress, repair and convert to images in one engine. AGPL fits our licence. |
| Lightweight authoring | **pdf-lib** (maintained fork `@cantoo/pdf-lib`, MIT) | Simple, fast structural ops and drawing; small bundle for simple tools. |
| Alternative renderer | **pdf.js** (Apache-2.0) or **@embedpdf/pdfium** (MIT + Apache) | Fallback if the M1 spike shows MuPDF is too heavy for simple tools. |
| Heavy compression / PDF/A | **Ghostscript WASM** (AGPL) | Best-in-class downsampling; lazy-loaded only on Compress "extreme" and PDF/A. |
| OCR | **Tesseract.js** (Apache-2.0) | Mature, client-side, per-language lazy data. |
| Office conversions | Spike in M8: LibreOffice/ZetaOffice WASM, office2pdf WASM; DOCX/XLSX/PPTX writers (`docx`, `exceljs`, `pptxgenjs`) for PDF → Office | See M8 gate. |
| Workers | Web Workers + **Comlink** | Keeps the UI at 60 fps, typed engine API. |
| Local storage | IndexedDB (`idb-keyval`), OPFS for large temp files | Signatures and settings on the device. |
| Testing | **Vitest** (unit), **Playwright** (E2E: Chromium, Firefox, WebKit) | Real-file fixtures; network-egress assertions. |
| Lint/format | **Oxlint** + Prettier | Matches the owner's existing setup (open-pdf experiment). |
| Hosting | **Cloudflare Pages** + R2 for large assets | Free unlimited static bandwidth. |
| Analytics | Cloudflare Web Analytics (cookieless) | No cookie banner needed (P5). |
| Licence | **AGPL-3.0** | Required by MuPDF/Ghostscript WASM; also guarantees forks stay open. |

The final engine split is decided by the M1 spike (bundle size, speed and memory on 3 reference files) and recorded in DECISIONS.md.

## 7. Name

**Plyleaf** ("ply" = a layer, "leaf" = a page). Chosen 2026-10-31 from a shortlist where every candidate was free as a GitHub
username/org and on .com/.app/.dev/.io/.org (checked by RDAP registry lookup), with no meaningful web footprint (the closest is
"Polyleaf", a roofing membrane). **Register `plyleaf.com` and the `plyleaf` GitHub org soon**: availability can change.

## Sources
- Competitor limits: [pdf.net: Smallpdf alternatives](https://pdf.net/blog/smallpdf-alternatives), [pdf.net: iLovePDF alternatives](https://pdf.net/blog/ilovepdf-alternatives.md), [temperstack: Sejda](https://www.temperstack.com/software/sejda/), [toolradar: iLovePDF vs Sejda](https://toolradar.com/compare/ilovepdf-vs-sejda), [codaone: best free PDF tools 2026](https://www.codaone.ai/blog/best-free-pdf-tools-2026/), [WindowsMode: best free online PDF editors](https://www.windowsmode.com/best-free-online-pdf-editors-for-windows/), [Cal Poly: Free PDF editors, are they actually free?](https://grandavehousing.calpoly.edu/news/free-pdf-editors-are-they), [SimplePDF FAQ](https://www.simplepdf.com/help/faq/is-pdf-editor-free-to-use), [TechRadar: best free PDF editor](https://www.techradar.com/best/free-pdf-editor)
- Open-source landscape: [It's FOSS: BentoPDF](https://itsfoss.com/bentopdf/), [IT-Connect: BentoPDF review](https://www.it-connect.fr/tuto-bentopdf-boite-a-outils-pdf-self-hosted/), [ideaproof: BentoPDF](https://ideaproof.io/open-source/project/bentopdf)
- Engines: [MuPDF.js (Artifex)](https://github.com/artifexsoftware/mupdf.js), [mupdf on npm](https://npmjs.com/package/mupdf), [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer), [EmbedPDF PDFium docs](https://www.embedpdf.com/docs/pdfium/introduction)
- Office in the browser: [ZetaOffice announcement](https://blog.allotropia.de/?p=677), [office2pdf crate](https://docs.rs/crate/office2pdf/latest), [docx-to-pdf-wasm](https://cdn.jsdelivr.net/npm/docx-to-pdf-wasm@0.1.0/README.md)
