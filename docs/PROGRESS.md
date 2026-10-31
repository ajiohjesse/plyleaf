# Progress

Single source of truth for where Plyleaf is. **Every session updates this file before it ends.**

- **Current milestone:** M0: Foundation
- **Next action:** Create the GitHub repo (`plyleaf`), scaffold Astro + React + TS + Tailwind, set up CI.
- **Blocked on owner:** register `plyleaf.com` and the `plyleaf` GitHub org (recommended; the repo can live under the
  personal account until then).

## Milestones

Tick an item only when it's verified (tests pass / checked in a browser). Tick the milestone when all its items are ticked.
Done-when criteria are in [GOAL.md §7](GOAL.md#7-milestones).

### [ ] M0: Foundation
- [ ] GitHub repo created, AGPL-3.0 LICENSE, README
- [ ] Astro + React + TypeScript + Tailwind v4 scaffold builds
- [ ] Oxlint + Prettier + typecheck + Vitest + Playwright configured
- [ ] GitHub Actions CI runs all checks on PRs
- [ ] Design tokens and fonts from DESIGN.md implemented
- [ ] Landing page: hero, promise strip, tool grid, comparison table, CTA, footer (responsive)
- [ ] Cloudflare Pages preview deploy live

### [ ] M1: Engine and core architecture
- [ ] Engine spike done; D-006 resolved with numbers
- [ ] Worker + Comlink typed engine API
- [ ] File intake (drop, picker, paste, multi-file) + validation and errors
- [ ] Virtualised page thumbnails
- [ ] Download pipeline + memory-limit UX
- [ ] Network egress test (no file bytes leave the browser)

### [ ] M2: Organize suite
- [ ] Merge · [ ] Split · [ ] Extract · [ ] Delete · [ ] Rotate · [ ] Reorder · [ ] Insert blank · [ ] Duplicate · [ ] Crop
- [ ] Shared Organize workspace
- [ ] Per-tool landing pages + E2E tests

### [ ] M3: Images and scanning
- [ ] Images → PDF (incl. HEIC) · [ ] PDF → images · [ ] Extract images · [ ] Camera scan-to-PDF

### [ ] M4: Optimize and secure
- [ ] Compress (3 levels) · [ ] Grayscale · [ ] Protect · [ ] Unlock · [ ] Permissions · [ ] Flatten · [ ] Repair · [ ] Metadata

### [ ] M5: Editor
- [ ] Text add · [ ] Edit existing text · [ ] Images · [ ] Shapes · [ ] Whiteout · [ ] Markup · [ ] Freehand · [ ] Comments · [ ] Stamps
- [ ] Page numbers · [ ] Watermark · [ ] Header/footer · [ ] Bates · [ ] Undo/redo
- [ ] Output verified in Acrobat Reader, Chrome, macOS Preview

### [ ] M6: Sign and forms
- [ ] AcroForm fill · [ ] Type on flat forms · [ ] Signatures (draw/type/upload, saved locally) · [ ] Initials/date · [ ] Flatten

### [ ] M7: Redact and OCR
- [ ] True redaction (verified non-extractable) · [ ] Search-and-redact · [ ] OCR → searchable PDF (language picker)

### [ ] M8: Office conversions
- [ ] Spike + D-007 decided by owner
- [ ] Word/Excel/PPT/ODF/HTML → PDF · [ ] PDF → Word/Excel/PPT/text

### [ ] M9: Launch readiness
- [ ] PWA offline · [ ] Lighthouse targets · [ ] WCAG 2.2 AA audit · [ ] Privacy/About/Donate pages · [ ] SEO metadata + sitemap
- [ ] Cookieless analytics · [ ] Production deploy on plyleaf.com

### [ ] M10: v1.x extras
- [ ] Compare PDFs · [ ] Batch mode · [ ] Saved workflows · [ ] PDF/A · [ ] N-up

## Session log

Newest first. One entry per session: date, milestone, what changed, what was verified, what's next, anything left open.

### 2026-10-31: Planning session
- Researched competitors and the open-source landscape; wrote GOAL, STRATEGY, DESIGN, DECISIONS, CLAUDE.md.
- Owner approved the name **Plyleaf** (D-001).
- Verified: name availability (GitHub + .com/.app/.dev/.io/.org via RDAP), as of today.
- Next: M0, starting with creating the repo and the scaffold.
