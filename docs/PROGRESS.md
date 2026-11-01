# Progress

Single source of truth for where Plyleaf is. **Every session updates this file before it ends.**

- **Current milestone:** M5: Editor (M0–M2 done 2026-10-31, M3 and M4 done 2026-11-01)
- **Next action:** M5: watermark.
- **Owner asked (2026-11-01):** build all of M5 in one go, one PR per item, each auto-merged when CI passes.
- **Owner asked earlier (2026-11-01):** build all of M3 and M4 in one go, one PR per tool, each auto-merged when CI passes.
  Unlock removes owner-password restrictions only after the user confirms they have the right to; libheif-js approved.
- **Live:** https://plyleaf.ajiohjesse.workers.dev (Workers Builds deploys `main`; other branches get Preview URLs).
- **Blocked on owner:**
  - Later, at the owner's pace: register `plyleaf.com` (and optionally the `plyleaf` GitHub org). Not blocking (D-013).
- **Repo:** https://github.com/ajiohjesse/plyleaf (public). `gh`'s active account on this machine is `angosam`, so run
  `gh` as ajiohjesse with `GH_TOKEN=$(gh auth token --user ajiohjesse) gh …`. For `git push`, GH_TOKEN alone isn't
  enough (git's stored credential is angosam's): `GH_TOKEN=$(gh auth token --user ajiohjesse) git -c credential.helper= -c
  'credential.helper=!gh auth git-credential' push`.

## Milestones

Tick an item only when it's verified (tests pass / checked in a browser). Tick the milestone when all its items are ticked.
Done-when criteria are in [GOAL.md §7](GOAL.md#7-milestones).

### [x] M0: Foundation
- [x] GitHub repo created, AGPL-3.0 LICENSE, README
- [x] Astro + React + TypeScript + Tailwind v4 scaffold builds
- [x] Oxlint + Prettier + typecheck + Vitest + Playwright configured
- [x] GitHub Actions CI runs all checks on PRs
- [x] Design tokens and fonts from DESIGN.md implemented
- [x] Landing page: hero, promise strip, tool grid, comparison table, CTA, footer (responsive)
- [x] Cloudflare preview deploy live (Workers static assets, D-014): https://plyleaf.ajiohjesse.workers.dev

### [x] M1: Engine and core architecture
- [x] Engine spike done; D-006 resolved with numbers (D-015, [report](research/engine-spike.md))
- [x] Worker + Comlink typed engine API (D-016)
- [x] File intake (drop, picker, paste, multi-file) + validation and errors
- [x] Virtualised page thumbnails
- [x] Download pipeline + memory-limit UX
- [x] Network egress test (no file bytes leave the browser)

### [x] M2: Organize suite
- [x] Merge · [x] Split · [x] Extract · [x] Delete · [x] Rotate · [x] Reorder · [x] Insert blank · [x] Duplicate · [x] Crop
- [x] Shared Organize workspace
- [x] Per-tool landing pages + E2E tests

### [x] M3: Images and scanning
- [x] Images → PDF (incl. HEIC) · [x] PDF → images · [x] Extract images · [x] Camera scan-to-PDF

### [x] M4: Optimize and secure
- [x] Compress (3 levels) · [x] Grayscale · [x] Protect · [x] Unlock · [x] Permissions · [x] Flatten · [x] Repair · [x] Metadata

### [ ] M5: Editor
- [x] Text add · [x] Edit existing text · [x] Images · [x] Shapes · [x] Whiteout · [x] Markup · [x] Freehand · [x] Comments · [x] Stamps
- [x] Page numbers · [ ] Watermark · [ ] Header/footer · [ ] Bates · [x] Undo/redo
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

### 2026-11-01: Page numbers (M5)
- `src/pagetools/stamping.ts` (pure, shared by the page tools): nine positions with a margin (capitals start at the
  margin at the top, descenders end at it at the bottom), `{page}`/`{pages}`/`{date}`/`{file}` tokens, pages counted
  from a page on with a first number. `src/pagetools/numbers.ts`: formats ("1", "Page 1", "Page 1 of 9", "1 / 9",
  "- 1 -") or the user's own words with {page}.
- `/add-page-numbers` (`PageNumbersWorkspace` on `SingleFileTool`): format, font/size/colour/bold, from page, first
  number, margin, a 3 × 3 position grid and a live preview of the first numbered page
  (`components/pagetools/fields.tsx`: `PositionGrid`, `StyleFields`, `WholeNumberField`, `PagePreview`, all reused by
  the next page tools). Output `<name>-numbered.pdf` through `engine.transform`'s edits.
- Fixed on the way: ToolPage said "More page tools tools".
- Verified: 4 new unit tests (positions, tokens, counting from a page, formats). New E2E `page-numbers.spec.ts` (pages
  2–3 numbered "Page 1 of 2" top right, read back with MuPDF and right-aligned at the margin, qpdf-clean,
  `watchEgress`; own words need {page}; linked from home): 12/12 in all four projects. Checked at 375 px.
- Next: watermark.

### 2026-11-01: Edit existing text (M5)
- Engine: `engine.textLines(doc, page)` (`src/engine/text.ts`): each left-to-right line with its text, box, baseline
  start, size, colour and closest standard font (by name first, then the font's flags; `exact` for
  Helvetica/Times/Courier and their URW twins). `Edits` pages take `removeText` boxes, taken out with MuPDF's redaction
  (text only, each box narrowed to the middle half of its height so neighbouring lines stay) before marks are drawn.
- Editor: Edit text tool outlines the page's lines; clicking one makes a text item that starts exactly as the line is
  (words, baseline, size, colour, font) and opens it for typing; the old line is covered on screen and removed in the
  file. Left unchanged, it's dropped with no undo step; emptied, the line just goes; moved, it counts as changed. A
  line in a non-standard font says it'll be written in the closest standard one. Text running another way isn't
  offered.
- Verified: 4 new unit tests (lines with font, size, colour, baseline; a line rewritten in place with the old words
  gone and the background kept, qpdf-clean; turned text not offered; the model's removals). New E2E
  `edit-existing-text.spec.ts` (a Helvetica line changed in place, old words gone from the file, qpdf-clean,
  `watchEgress`; unchanged line adds nothing; bold red Times title stays bold and red): 8/8 in all four projects.
- Next: page numbers.

### 2026-11-01: Stamps (M5)
- Engine: stamp annotations (a standard PDF stamp name or the user's own words, colour, 19:5 box). MuPDF draws stamps
  in the page's unturned space, so on a turned page they'd show sideways or squashed: the engine draws each on an
  unturned scratch page and gives the real annotation that appearance through the shown page both share
  (`uprightStamp`). Checked at /Rotate 0, 90 and 270.
- Editor: Add stamp tool (Approved, Not approved, Draft, Final, Confidential, For comment, Expired, or "Your own…"
  words; colour); click or Enter places a 160-point stamp, then it's selected to move, resize (handle or +/−, keeping
  its shape) or restyle. Words the fonts can't show are flagged. The toolbar hint now stays on one line.
- Verified: 1 new unit test (names, colour, bounds on plain and turned pages, qpdf-clean). New E2E `stamps.spec.ts`
  (standard stamp resized, own words, positions read back with MuPDF, qpdf-clean, `watchEgress`; empty words refused,
  restyle): 8/8 in all four projects.
- Next: edit existing text.

### 2026-11-01: Comments (M5)
- Engine: note annotations (a "Comment" icon, the text as its contents, a pop-up beside it). A note's icon stays
  upright on a turned page, pinned by its rectangle's unturned upper-left corner, so the engine puts that corner where
  the icon should show.
- Editor: Add comment tool (note colour): a click (or Enter on a page) places a note with its text box open; like
  text, it joins the history with its first character and goes if left empty. Selected, the text shows beside the
  icon; Enter or a second press edits it; drag or arrows move it.
- Verified: 1 new unit test (note text with non-Latin characters, place on plain and turned pages, empty left out,
  qpdf-clean). New E2E `comments.spec.ts` (two-line comment placed by click, read back with MuPDF, qpdf-clean,
  `watchEgress`; empty dropped; keyboard placement and later change): 8/8 in all four projects.
- Next: stamps.

### 2026-11-01: Freehand drawing (M5)
- Engine: ink annotations (strokes, colour, width, opacity) from `Edits` pages' `annotations`.
- Editor: Draw tool (colour, thickness, see-through); every pointer point is kept (coalesced events too) and thinned to
  1 pt; each stroke is an item (one undo step) shown as an SVG path whose stroke, not its box, takes presses; strokes
  move by drag or arrow keys, restyle, delete. The pen stays on between strokes.
- Verified: 2 new unit tests (ink bounds on plain and turned pages, width, opacity, qpdf-clean; thinning, moving a
  stroke, its edits). New E2E `draw.spec.ts` (two strokes, undo/redo a whole stroke, one moved from the keyboard,
  read back as ink annotations, qpdf-clean, `watchEgress`): 4/4 in all four projects.
- Next: comments.

### 2026-11-01: Markup, and Annotate PDF (M5)
- Engine: `engine.selectText(doc, page, from, to, words)` (`src/engine/text.ts`, MuPDF's structured text, kept for the
  last four pages the user selects on): the text between two points in reading order, or the word clicked; nothing
  unless the drag crosses text or the click is on a word (MuPDF snaps to the nearest otherwise). `Edits` pages take
  `annotations`: highlight, underline and strike-out annotations with MuPDF-made appearances (D-035).
- Editor: Highlight text tool (Highlight / Underline / Strike out, colour); dragging shows the selection live (only the
  latest engine answer counts), a click marks a word; a message when there's no text (scanned pages). Marks stay with
  their text (no moving), can change kind and colour, or be deleted. The tool stays on for the next mark.
- `/annotate-pdf` live: the same editor opening with the highlighter, saving `<name>-annotated.pdf`.
- Verified: 2 new unit tests (selection by drag and word, nothing off text, a turned page; three annotation types with
  colours and bounds round the text, also on a turned page; qpdf-clean). New E2E `annotate.spec.ts` (highlight a line,
  underline a clicked word, strike out across two lines, read back with MuPDF, qpdf-clean, `watchEgress`; no-text
  message, restyle and delete; linked from home): 12/12 in all four projects.
- Known gap: choosing text needs a pointer; keyboard users can't select text to mark yet (search-and-mark could
  come with M7's search-and-redact).
- Next: freehand.

### 2026-11-01: Whiteout in the editor (M5)
- Whiteout tool: drag (or click, or Enter) to cover part of a page with a box in a cover colour (white by default, or
  the page's colour), moved and resized like shapes; drawn as a filled rectangle mark. The editor shows a dashed edge
  so it can be found on a white page. The options panel, the hint and the FAQ all say it hides rather than removes
  (redaction is M7).
- Verified: new E2E `edit-whiteout.spec.ts` ("Page 1" covered in white and part of the red area in blue, every pixel
  checked; the text is still extractable, as the UI says; qpdf-clean; `watchEgress`): 4/4 in all four projects.
- Next: markup.

### 2026-11-01: Shapes in the editor (M5)
- Engine: shape marks (rectangle, ellipse, line, arrow; outline colour and width, fill) drawn as paths; the arrow and
  ellipse geometry lives in `src/editor/shapes.ts` so the editor's SVG and the PDF match.
- Editor: Add shape tool with floating options (kind, outline colour or none, width, fill and its colour); drag across
  the page to draw (`EditorPage` drawing tools: a drag draws, a click places 120 × 80, Enter places in the middle), then
  move, resize from the far corner (a line's end) or with +/−, restyle or delete. The surface doesn't take focus on
  press, so it can't scroll mid-drag. Option panels moved to `components/editor/options.tsx`; `ResizeHandle` is
  shared with images.
- Verified: 3 new unit tests (outline/fill, ellipse corners empty, line direction, arrowhead, rotated page). New E2E
  `edit-shapes.spec.ts` (drawn rectangle filled, clicked ellipse, dragged arrow, checked by colour; keyboard-placed
  shape restyled and grown; qpdf-clean; `watchEgress`): 8/8 in all four projects; other editor specs still pass.
- Next: whiteout.

### 2026-11-01: Images in the editor (M5)
- Engine: image marks (a box, optional rotation about its centre and opacity) drawing from `Edits.images` (JPEG/PNG),
  each stored once in the PDF however many marks use it.
- Editor: Add image (file picker) puts the picture in the middle of the page on screen at 96 dpi, no bigger than half
  the page, selected and focused; drag to move, corner handle or +/− to resize (keeping its shape), Delete.
  `src/editor/images.ts` reads EXIF orientation: PNGs and upright JPEGs go in byte for byte, anything else (turned
  phone photos, WebP, GIF, AVIF, HEIC where the browser reads it) is redrawn by the browser
  (`components/editor/prepareImage.ts`). Pictures are editor assets, so undo never copies bytes.
- Verified: 6 new unit tests (placement on plain and rotated pages, one image object for two pages, JPEG passed
  through, rotation, opacity, bad input; orientation, starting size, resize, edits with shared images). New E2E
  `edit-images.spec.ts` (PNG resized by keyboard and dragged, checked by colour in the output, qpdf-clean,
  `watchEgress`; EXIF-turned JPEG shown and saved turned, corner handle; unreadable picture message): 12/12 in all four
  projects; `edit-text` and `undo-redo` still pass.
- Next: shapes.

### 2026-11-01: Undo and redo in the editor (M5)
- Toolbar Undo / Redo (aria-disabled when there's nothing, so focus stays; `aria-keyshortcuts`), Ctrl/⌘+Z,
  Ctrl/⌘+Shift+Z and Ctrl+Y anywhere but a text field (which keeps its own typing undo). Undoing finishes what was
  being typed or placed and clears a selection that's gone; "Undone"/"Redone" is announced.
- Verified: new E2E `undo-redo.spec.ts` (add, move and retype undone and redone from buttons and shortcuts, one step
  per gesture, a new change drops redo, the saved file has what's left): 4/4 in all four projects; `edit-text` still
  16/16.
- Next: images.

### 2026-11-01: Edit PDF, add text (M5)
- Engine (D-034): `transform` takes `edits` (marks per page; text for now: standard font, bold/italic, size, colour,
  alignment, rotation, opacity), drawn with MuPDF's PDF writer onto scratch pages and put on each page as a form
  XObject over its content. `src/engine/content.ts` holds the shared "own resources / draw on top" helpers (Grayscale
  uses them too).
- Editor: pure model `src/editor/` (items, undo history with merge keys, standard-font coverage); UI
  `src/components/editor/` (`EditorWorkspace` → `Editor`: toolbar with Select, Add text and zoom, floating text options,
  every page with its items as DOM over the cached render, Download PDF; done screen keeps the editor for "Back to
  editing"). Text boxes: click to place (or Enter on a page from the keyboard: the middle), type, Esc to finish; drag or
  arrow keys to move; tap again or Enter to edit; Delete. Text is stored by its baseline, measured in the browser's
  font. `ToolPage` takes `wide`.
- `/edit-pdf` live ("Add text to any page." until more tools ship).
- Verified: 12 new unit tests (text placed by baseline in each font, Unicode Latin/Cyrillic, multi-line spacing,
  rotated 90/180/270 and offset crop boxes, alignment, rotation, opacity, missing glyphs left out, one embedded font for
  20 pages, history and items). New E2E `edit-text.spec.ts` (styled text at the clicked point read back with MuPDF,
  qpdf-clean, `watchEgress` clean; keyboard add/nudge/back to editing; empty text dropped and the missing-glyph
  warning; linked from home): 16/16 in Chromium, Firefox, WebKit and Pixel 7. Checked at 375 px.
- Next: undo/redo.

### 2026-11-01: PDF metadata, M4 done
- Engine (D-033): `DocInfo.metadata`; `transform` `metadata` sets changed fields (empty removes) and drops XMP, or
  removes Info, XMP and PieceInfo entirely.
- `/pdf-metadata` (`MetadataWorkspace`): Title, Author, Subject, Keywords, Made with, Converted to PDF by, with the
  created/changed dates shown in the user's locale (`src/secure/metadata.ts`, `parsePdfDate`); Save changes sends
  only what changed; Remove all metadata. Output `<name>-metadata.pdf` or `<name>-no-metadata.pdf`.
- Verified: 5 new unit tests (reading; editing with non-Latin text, XMP dropped; removing leaves none of the old
  values anywhere in the bytes; PDF dates with offsets). New E2E `metadata.spec.ts` (edit and clear, read back with
  MuPDF, qpdf-clean, `watchEgress` clean; remove all; linked from home): 12/12. Full E2E suite on this branch (all of
  M3 and M4 stacked): 410 passed, 2 skipped (the camera test runs in Chromium only), in Chromium, Firefox, WebKit and
  Pixel 7. Checked at 375 px.
- All eight M4 items work and every output is checked with qpdf in tests, so M4 is done.
- Open: password-protected files open with their password only in the Optimize & secure tools (other tools point to
  Unlock); greyscale leaves annotations in colour; scanning hasn't been tried with real phone photos here.
- Next: M5, the editor.

### 2026-11-01: Repair PDF (M4)
- `/repair-pdf` (`RepairWorkspace`): MuPDF rebuilds a damaged file when opening it (`DocInfo.repaired`); the tool
  says whether it found damage and how many pages it recovered, and saves a clean copy (`transform` with no options).
- `truncatedPdf()` test fixture (cut before the xref).
- Verified: 1 new unit test (qpdf faults the cut-off original, not the repaired copy; pages kept). New E2E
  `repair.spec.ts` (cut-off file → "found 3 pages", qpdf-clean output, `watchEgress` clean; undamaged file; linked
  from home): 12/12 in all four browser projects.
- Next: Metadata.

### 2026-11-01: Flatten PDF (M4)
- Engine: `transform` takes `flatten` ("forms" or "all"): MuPDF's `bake`, before greyscale and compression, so
  links stay links. `DocInfo` counts `annotations` (not links) and `formFields`.
- `/flatten-pdf` (`FlattenWorkspace`): says how many fields and annotations there are; Everything or Form fields
  only; nothing to flatten says so.
- `formsPdf()` test fixture: a text field with an appearance, a square annotation and a link (MuPDF places
  annotations from the top left, so the square is symmetric).
- Verified: 3 new unit tests (counts; everything → no fields or annotations, both still drawn, link kept, qpdf-clean;
  forms only keeps the annotation). New E2E `flatten.spec.ts` (flatten → MuPDF finds no annotations or widgets and
  one link, qpdf-clean, `watchEgress` clean; nothing to flatten; linked from home): 12/12 in all four projects.
- Next: Repair.

### 2026-11-01: Edit permissions (M4)
- `/pdf-permissions` (`PermissionsWorkspace`): a checkbox per permission, starting from what the file allows
  (full-quality printing needs printing), an optional permissions (owner) password typed twice, otherwise a random
  one; a file opened with its user password keeps it (`security.keepUserPassword`, new). Allowing something the file
  didn't allow needs the same rights box as Unlock (D-032), unless the owner password opened it. The page says
  permissions are a request most apps follow, not a lock.
- Verified: 1 new unit test (keeping the open password while changing permissions and owner password). New E2E
  `permissions.spec.ts` (no copying/changing/commenting, printing kept, owner password works, qpdf: restrictions
  only, `--check` clean, `watchEgress` with the password as a secret; print → full-quality print; rights box when
  lifting a restriction; linked from home): 16/16 in all four browser projects.
- Next: Flatten.

### 2026-11-01: Unlock PDF, and protected files open with their password (M4)
- Engine (D-032): `openPdf(bytes, password)` authenticates (new code `wrong-password`), `DocInfo.unlockedWith`;
  the worker keeps the password per open document for `transform`, whose copies reopen with it.
- Intake: `passwords` option keeps a protected PDF as a "locked" document; `intake.unlock(key, password)` opens it or
  marks the password wrong. `SingleFileTool` turns it on and shows `PasswordPrompt`, so every Optimize & secure tool
  takes protected files. Other tools' message now says to remove the password with Unlock PDF first.
- `/unlock-pdf` (`UnlockWorkspace`): "Remove password" for a file opened with its password; a file with
  restrictions lists them (`src/secure/permissions.ts` labels) and needs "I own this PDF, or have the right to
  remove its restrictions" ticked first (owner's decision), unless the owner password opened it; a file with no
  protection says there's nothing to unlock.
- Verified: 3 new unit tests (password required / wrong / user vs owner and their permissions; transform of a
  password-opened document unlocks, or keeps it protected; intake's locked → wrong → open). New E2E
  `unlock.spec.ts` (wrong then right password, unlocked output qpdf-clean and unencrypted, `watchEgress` with the
  password as a secret; restrictions only after the box; nothing to unlock; Split says to unlock first; linked
  from home) and `intake.spec.ts`: 48/48 in all four browser projects.
- Next: Permissions.

### 2026-11-01: Protect PDF (M4)
- Engine: `transform` takes `security` (D-031): AES-256 with a user password, owner password (random when not
  given) and permissions (`permissionValue` → /P), or `encrypt=none`; default keeps the file's own encryption.
  `DocInfo` now has `encryption` and `permissions`.
- `/protect-pdf` (`ProtectWorkspace`): password typed twice, show passwords, errors for empty, comma and mismatch
  (shown once tried, or once the second is as long as the first), Enter submits; a file with restrictions keeps them.
  `src/components/secure/PasswordField.tsx` is shared with the tools to come.
- qpdf helper: this build can't inspect a password file without its password, so `qpdfEncryption(pdf, password)`.
- Verified: 8 new unit tests (permission values; AES-256 that qpdf opens with the password and not without, R6
  user-not-owner; non-Latin passwords; permissions only; random owner password; comma refused; none removes;
  other tools keep restrictions). New E2E `protect.spec.ts` (encrypt → qpdf: password-protected, opens with it,
  not with a guess, `--check` clean; `watchEgress` with the password as a secret; validation and show passwords;
  linked from home): 12/12 in all four browser projects.
- Next: Unlock.

### 2026-11-01: Grayscale PDF (M4)
- Engine: `transform` takes `grayscale` (D-030): images to DeviceGray in place, a Saturation-blend black overlay on
  each page (its own ExtGState, shared by pages that share resources) over the content wrapped in q/Q.
- Found and worked around a MuPDF 1.28 bug: walking image objects, adding streams, then saving with
  `garbage=compact` or `deduplicate` writes image objects without their streams. `transform` now saves its changes
  with plain `garbage`, reopens, and does the final save on the fresh copy (`repacked`).
- `/grayscale-pdf` (`GrayscaleWorkspace` on `SingleFileTool`): one button; output `<name>-grayscale.pdf`.
- Verified: 3 new unit tests (vectors and text grey at the right luminosity and still text; images Gray; shared
  resources get one blend mode; all qpdf-clean). New E2E `grayscale.spec.ts` (text page + images page → no colour
  anywhere when rendered, text extractable, qpdf-clean, `watchEgress` clean; linked from home) and compress again:
  20/20 in all four browser projects.
- Next: Protect.

### 2026-11-01: Compress PDF (M4)
- Engine (D-029): `engine.transform(doc, options)` changes a copy (`src/engine/transform.ts`); `compress` Low /
  Recommended / Extreme. `pageImages` (shared with Extract images) walks a page's image XObjects; `replaceImage`
  swaps an image's data and description in place.
- `/compress-pdf` (`CompressWorkspace`) on a new shared shell, `src/components/workspace/SingleFileTool.tsx` (intake,
  file card, the tool's `Options`, done screen, an `info` outcome for "nothing to do"). The done screen says
  "679 KB → 38 KB, 94% smaller"; under 1% saved, it says the file is already about as small as it gets.
- `tests/helpers/qpdf.ts`: qpdf in WASM (`qpdfCheck`, `qpdfEncryption`, `qpdfOpens`, by exit code), with a control
  test that it fails a damaged file. `photoPdf()` in `tests/helpers/pdf.ts` makes a page with a large noisy image.
- Verified: 5 new unit tests (each level smaller than the last and qpdf-clean, image sizes per level, the open
  document unchanged between runs, soft masks kept, text-only stays valid; the qpdf control). New E2E
  `compress.spec.ts` (Recommended then Extreme, sizes shown, qpdf-clean, `watchEgress` clean; nothing to save; linked
  from home): 12/12 in all four browser projects.
- Next: Grayscale.

### 2026-11-01: Scan to PDF, M3 done
- `/scan-to-pdf` (`ScanWorkspace`, D-028): "Use camera" (live `getUserMedia`, back camera, a shutter that adds page
  after page) or photos picked, dropped or pasted. Each photo: decoded on the page (`src/scan/photo.ts`, ≤ 3000 px),
  the page found (`src/scan/detect.ts`), straightened in the engine (`engine.openScan`: MuPDF `Pixmap.warp`, then
  colour / greyscale / black and white from `src/scan/filters.ts`). Pages show as thumbnails with adjust corners,
  move earlier/later and remove; `CornerEditor` drags corners (pointer capture, 44 px targets) or moves them with
  arrow keys, with "Back to detected" and "Whole photo". Look and page size (Images to PDF's `LayoutOptions`) apply to
  all pages; changing the look re-straightens every page. Output `scan.pdf`.
- `src/scan/quad.ts` (corner order, convexity, area, output size, moving a corner).
- Fixed before shipping: a tall photo pushed the corner editor wider than a phone screen.
- Verified: 11 new unit tests (quads; detection within 2.5% of each true corner on a made-up angled page, nothing in a
  plain or full-frame photo; Otsu; black and white under uneven light; straightened output has the red block top-left
  and paper in every corner; black and white is grey; crossed corners refused). New E2E `scan.spec.ts` (two photos →
  straightened pages checked by colour with MuPDF, `watchEgress` clean; corners by keyboard, back to detected, whole
  photo; black and white on A4; not a photo; linked from home) 20/20 in all four projects, and `scan-camera.spec.ts`
  (Chromium's fake camera: two shots → two pages, no camera before the button) in Chromium and Pixel 7. Checked at
  375 px (no horizontal scroll) with a made-up receipt photo: found and straightened.
- Real phone photos weren't tried from here (no device); the detector relies on paper being lighter than its
  background, and says nothing when it isn't (the corners start at the whole photo).
- All four M3 items work, so M3 is done.
- Next: M4, Compress.

### 2026-11-01: Extract images (M3)
- Engine: `extractImages(doc, page, skip)` (D-027): a page's image XObjects, inside forms too, once each across pages
  (the caller passes the object numbers already found), no stencil masks; plain JPEGs byte for byte, the rest decoded
  to PNG with CMYK → RGB and soft masks as alpha.
- `/extract-images` (`ExtractImagesWorkspace`, single file): "Leave out tiny images" (under 32 × 32 px, on by default),
  progress by page, a message when there are none. One image downloads as itself, several as `<name>-images.zip` of
  `<name>-page-NN-image-N.<ext>`.
- `tests/helpers/images.ts` `imagesPdf()` builds a PDF with a JPEG, an RGB image with a soft mask, a CMYK image, a
  stencil mask, the JPEG again on page 2 and a form holding another image.
- Verified: 4 new unit tests. New E2E `extract-images.spec.ts` (zip of four, names, the JPEG byte for byte,
  `watchEgress` clean; tiny images left out → one JPG; no images; linked from home): 16/16 in all four browser projects.
- Next: Scan to PDF.

### 2026-11-01: PDF to images (M3)
- Engine: `pageImage(doc, page, {dpi, format: "jpeg" | "png", quality})` renders on white and encodes with MuPDF,
  recording the resolution; sides are capped at 8192 px (`MAX_RENDER_SIDE` now lives in `types.ts`). D-026.
- `/pdf-to-jpg` (`PdfToImagesWorkspace`, single file): format JPG / PNG / WebP (WebP via the page's canvas, shown as
  unavailable where the browser can't encode it), resolution 72/150/300/600 dpi with the first image's pixel size,
  all or typed pages. One image downloads as itself, several as `<name>-images.zip` of `<name>-page-NN.<ext>`.
- `src/convert/pdf-images.ts` (`imageSize` rounds partial pixels up like MuPDF, `pageImageName`, WebP helpers) and
  `pagesInRanges` in `ranges.ts`, unit-tested.
- Verified: 8 new unit tests. New E2E `pdf-to-images.spec.ts` (zip of JPGs at 150 dpi incl. a rotated page, sizes and
  dpi read back with MuPDF, `watchEgress` clean; one PNG at 300 dpi; WebP where supported; typed-page errors; linked
  from home): 20/20 in all four browser projects. Checked at 375 px.
- Next: Extract images.

### 2026-11-01: Images to PDF, Merge takes images (M3)
- Engine (D-025): `engine.open` takes images. The worker opens JPEG/PNG/GIF/TIFF with MuPDF and writes a PDF with a
  page per frame (JPEG carried over unchanged, EXIF orientation applied, 96 dpi when the file doesn't say, scaled down
  to fit 612 × 842 pt so phone photos aren't a metre wide). WebP, AVIF and HEIC are decoded on the page
  (`src/engine/decode.ts`, `createImageBitmap` + canvas) and sent as RGBA (`openPixels`: JPEG q90 if lossy and opaque,
  else PNG with transparency); HEIC the browser can't decode goes to the worker's libheif (`src/engine/heic.ts`,
  libheif-js 1.23.5, LGPL-3.0, lazy). `DocInfo.source` says "pdf" or "image"; new error code `invalid-image`.
- `assemble` specs take `fit` ({width, height, margin}): the page becomes a form XObject scaled and centred on a page of
  that size, whatever its own /Rotate and crop.
- `/jpg-to-pdf` (`ImagesWorkspace`): images in order (the Merge list, now `src/components/workspace/FileOrder.tsx`),
  page size Same as image / A4 / US Letter, orientation (match each image, portrait, landscape) and margin
  (none, ¼ in, ½ in) via `src/convert/images.ts` `fitFor`. Output `<first>.pdf`, or `<first>-images.pdf` for several.
- Merge takes images too ("Drop PDFs or images here"), each a page its own size.
- Fixtures: `tests/fixtures/make-images.ts` makes `photo.heic` (an x265 frame in a hand-built HEIF container),
  `photo.webp` (lossy) and `drawing.webp` (lossless) with ffmpeg; `tests/helpers/images.ts` makes JPEG (with EXIF
  orientation/dpi), PNG and multi-page TIFF.
- Found on the way: Playwright's Windows WebKit has no OffscreenCanvas (nor Safari < 16.4), so decoding moved from the
  worker to the page. Locally, port 4321 was held by a stray `astro preview` (another chat's); Playwright reuses it, so
  rebuild `dist/` with `PLYLEAF_TEST_HARNESS=1 pnpm build` before `pnpm e2e` when that happens.
- Verified: 22 new unit tests (image opening: sizes, dpi, EXIF, big-photo cap, PNG lossless, TIFF frames, bad bytes;
  pixels: JPEG/PNG choice, transparency; HEIC decode; fit for every /Rotate with margins, scale up, bad margins; layout).
  New E2E `images-to-pdf.spec.ts` (five kinds incl. HEIC and both WebPs → sizes, orientation and filters checked with
  MuPDF; A4 + margin; all portrait; images only; unreadable image message; Merge with an image; linked from home;
  `watchEgress` clean). Full suite 248/248 in Chromium, Firefox, WebKit and Pixel 7. Checked at 375 px and desktop.
- Next: PDF → images.

### 2026-10-31: Crop PDF, M2 done
- Engine: `PageSpec` takes `crop` (fractions of the page as its own rotation shows it, from the top-left); `assemble`
  sets the page's /CropBox inside its current crop and media boxes, mapping through /Rotate 0/90/180/270, before any
  added rotation (D-024). Unit-tested for every rotation by rendering (the kept quadrant is all red), nested crops,
  crop then rotate, and bad areas.
- `/crop-pdf` (`CropWorkspace`, single file): a page preview with a selection frame (outside dimmed, eight handles,
  drag to move; pointer capture, `touch-none`), page arrows to check other pages, four margin fields in % (with
  inline errors) for keyboards and exact values, Reset, and "All pages" or "Some pages" (typed ranges). Output
  `<name>-cropped.pdf`. The FAQ says cropped-off content is hidden, not removed (redaction is M7).
- `src/organize/crop.ts` (`dragCrop`, `marginsOf`, `cropFromMargins`, `isFull`), unit-tested. Oxlint's
  `vitest/expect-expect` now also accepts `expect*` helpers.
- Fixed before shipping: the preview measured its wrapper including padding and overflowed on phones.
- Verified: 7 new unit tests (engine crop) + 5 (crop frame). New E2E `crop.spec.ts` (typed margins → every page's size
  checked with MuPDF; drag the top-left handle → margins follow; crop only page 2; margin errors; reset; page arrows;
  linked from home; `watchEgress` clean): 16/16 in all four browser projects, twice. Checked at 375 px and desktop.
- All nine Organize tools have their own page and E2E tests, six of them on the shared page board, so M2 is done.
- Open: no auto-detect of white margins yet; one crop frame per run (different crops per page need two runs).
- Next: M3, Images → PDF.

### 2026-10-31: Duplicate pages (M2)
- `/duplicate-pages`: a `duplicate` mode. A copy button under each page puts a copy right after it; the toolbar copies
  every selected page and removes all copies; copies (a page whose source already appeared earlier) have their own
  remove button. Copies reuse the source's resources (one `assemble`). Output `<name>-duplicated.pdf`.
- Verified: new E2E `duplicate.spec.ts` (single and selection copies, output order checked with MuPDF, remove one and
  all, only copies removable, linked from home, `watchEgress` clean): 12/12 in all four browser projects.
- Next: Crop.

### 2026-10-31: Insert blank page (M2)
- `/insert-blank-page`: an `insert` mode. A + under each page adds a blank after it; the toolbar adds blanks before or
  after each selected page and removes them all; blank pages have their own remove button. Blanks take the size and
  orientation their neighbour shows. Output `<name>-with-blanks.pdf`.
- Tool specs moved out of `OrganizeWorkspace.tsx` into `src/components/organize/tools.tsx`.
- Verified: new E2E `insert-blank.spec.ts` (blank after a landscape page and before page 1, output page sizes checked
  with MuPDF, remove one and all, linked from home, `watchEgress` clean). All five page-board specs 60/60 in all four
  browser projects. Checked at 375 px.
- Next: Duplicate pages.

### 2026-10-31: Reorder pages (M2)
- `/reorder-pages`: a `reorder` mode of `OrganizeWorkspace`. `PageBoard` takes `onMove` and then sorts with dnd-kit
  (`rectSortingStrategy`): a drag handle under each page (pointer, touch, keyboard with arrow keys in the grid) and
  announcements by position. The toolbar moves the selection to the start or end, reverses, and resets. Moved pages
  are named with where they came from ("Page 2, page 4 of the original"). Output `<name>-reordered.pdf`.
- `board.ts`: `moveToEdge`, `originalOrder`, `isReordered` (unit-tested). `GripIcon` moved to the shared parts.
- E2E notes: drag tests centre the board first (the sticky action bar covers handles at the bottom of the viewport),
  and wait for dnd-kit's "Over position" announcement before releasing, because WebKit can process the last pointer
  move after the button is released. Keyboard drags use `pressUntilAnnounced` (`tests/helpers/drag.ts`): Chromium can
  deliver the first arrow key before dnd-kit has measured the drop targets, and it's ignored. Merge's drag test had
  the same two flakes (it failed 2 of 3 runs locally on `main` in Chromium); it uses the same fixes now.
- Verified: new E2E `reorder.spec.ts` (keyboard drag with announcements, pointer drag, output order checked with
  MuPDF, move to start/end with the selection following, reverse, reset, linked from home, `watchEgress` clean),
  3 runs each in all four browser projects (one run timed out under 8 parallel workers × 3 repeats; 5/5 alone).
  Checked at 375 px, no horizontal scroll.
- Next: Insert blank pages.

### 2026-10-31: Rotate PDF (M2)
- `/rotate-pdf`: a `rotate` mode of `OrganizeWorkspace`. Each page has turn left/right buttons; a toolbar turns the
  selected pages (or all pages when none are) and resets. The board shows each turn at once; output `<name>-rotated.pdf`
  adds to each page's own /Rotate. Changes are announced in a polite live region.
- Tool specs can now add a `toolbar` (under the select bar) and per-page `controls`, both given a `ToolContext` whose
  `change` is a functional update of the latest board (two quick changes both count; found when two turns in one tick
  lost the first).
- No turn animation: a CSS transition from 0° to 270° spins the long way, which reads as the wrong direction.
- Verified: new E2E `rotate.spec.ts` (per-page turns, selection turns, a page with its own /Rotate 90, output sizes and
  /Rotate checked with MuPDF, all pages with none selected, reset, linked from home, `watchEgress` clean). Rotate +
  extract + delete specs 36/36 in all four browser projects. Checked at 375 px.
- Next: Reorder pages.

### 2026-10-31: Delete pages (M2)
- `/delete-pages`: a `delete` mode of `OrganizeWorkspace`. Marked pages show faded with a coral frame and a cross
  (`PageBoard` `tone="remove"`), the bar says "3 pages to delete · 3 pages left", and deleting every page is refused
  ("Keep at least one page."). Output `<name>-edited.pdf`, built from the kept pages only.
- Tool specs now give one `status(selected, total)` and a `tone`.
- Verified: new E2E `delete.spec.ts` (mark by click and shift-click, download and check the pages left by size and that
  the deleted pages' text isn't in the file; select all refuses; linked from home; `watchEgress` clean). Delete +
  extract specs 24/24 in all four browser projects. Checked at 375 px and desktop.
- Next: Rotate pages.

### 2026-10-31: Extract pages and the shared page board (M2)
- `src/organize/board.ts`: the page board model for the page-level tools (D-023). A board is an immutable list of
  pages with stable keys (source page or blank, size, added rotation); operations remove, rotate, move, reverse,
  duplicate, insert blanks, select by typed ranges or a shift-click span; `toSpecs` turns it (or a selection) into
  `engine.assemble` specs. All unit-tested, including ones later tools will use.
- `src/components/organize/PageBoard.tsx`: every page as a selectable thumbnail (a toggle button, `aria-pressed`,
  primary ring with the selection-frame corner handles and a check), added rotation shown with CSS, blank pages drawn
  white, renders only near the viewport like `ThumbnailGrid` (whose hooks it now shares). Per-page buttons via a
  `controls` render prop, for later tools.
- `OrganizeWorkspace` (`tool` prop; tool specs in one table): single-file intake, a select bar (type ranges, Select
  all, Clear), the board, the action bar; the board and selection survive the done screen and reset for a new file.
  `/extract-pages` is its first tool: selected pages in original order → `<name>-extracted.pdf`.
- `tests/helpers/organize.ts`: shared E2E steps (numbered-width PDFs, board locators, `readPages` with /Rotate, download).
- Verified: 8 new unit tests. New E2E `extract.spec.ts` (click, shift-click span, deselect, extract and check pages
  with MuPDF, back keeps the selection, typed ranges, select all/clear, typed-range errors, swapping files gives a
  fresh board, linked from home, `watchEgress` clean): 12/12 in all four browser projects. Checked at 375 px
  (2 columns) and desktop (5 columns), no horizontal scroll; fixed the board's padding counting toward column width.
- Next: Delete pages.

### 2026-10-31: Split PDF (M2)
- `/split-pdf` (`SplitWorkspace`, single file): split by page ranges (typed, like `1-3, 5, 8-`; suggested as halves
  so the syntax shows by example) or every N pages, with a live preview of the files it makes and inline errors
  (`aria-invalid`, described by the error). Each part is one `engine.assemble`, one at a time, with "Splitting… 2 of 5".
  One part downloads as a PDF; several as a zip (D-022). Parts are named after their pages (`report-pages-1-3.pdf`,
  repeats get `-2`); the zip is `report-split.zip`. A one-page file says there's nothing to split.
- `src/organize/ranges.ts` (`parseRanges`, `everyN`, `describeRange`) and `src/organize/split.ts` (`partNames`,
  `zipFiles`), unit-tested. Added `fflate` 0.8.2 (MIT).
- Shared workspace pieces in `src/components/workspace/parts.tsx` (`ActionBar`, `FailureAlert`, `IconButton`,
  `Choice` radio cards, `FileCard`, `FirstPage`, `plural`, `Result`); Merge now uses them. `DownloadPanel` takes an
  optional `detail` line; Save as describes a `.zip` as a ZIP archive.
- The catalogue says "by page ranges or every N pages" until by size and by bookmark exist (P5).
- Verified: 7 new unit tests. New E2E `split.spec.ts` (ranges → zip of three PDFs checked page by page with MuPDF,
  back and split one range → a single PDF, `watchEgress` clean; every N with the last part shorter; range and N
  errors disable the button; one-page file; swapping files; not-a-PDF; no engine before a file; linked from home).
  Split + merge specs 32/32 in Chromium, Firefox, WebKit and Pixel 7. Checked at 375 px and desktop, no console errors.
- Open: split by size and by bookmark; the zip is built in memory (all parts plus the zip at once).
- Next: Extract pages with the shared Organize workspace.

### 2026-10-31: Merge PDF (M2)
- First tool page. `/merge-pdf` uses a new `src/layouts/ToolPage.astro` (DESIGN "Tool page"): compact hero in the
  category's colour (a 30% wash of the sticky; only ink text on it), the workspace island under the h1, then how it
  works, an FAQ (`<details>`) and the category's other tools ("Soon" ones unlinked). The intro hides once the
  workspace has files (`:has([data-files])`). Design in D-021.
- `MergeWorkspace` (`src/components/merge/`): intake → a file list in merge order, each row with its first page
  (`PageCanvas`, now its own module), a drag handle, move up/down and remove → a sticky bar with the totals and
  "Merge PDFs" (needs two ready files; says so) → `engine.assemble` of every page in list order → `DownloadPanel`
  (`<first file>-merged.pdf`). "Back to your files" keeps everything open and returns focus to the Merge button.
- Reordering: `intake.move(key, index)` (unit-tested, works while files are still opening). Dragging uses dnd-kit
  (`@dnd-kit/core` 6.3.1 + `sortable` 10, MIT): pointer, touch (handle has `touch-action: none`) and keyboard (space,
  arrows, space) with our own screen-reader announcements by file name and position. Move buttons are `aria-disabled`
  at the ends so they keep focus, and say what happened in a polite live region.
- `DownloadPanel` now focuses its heading when it appears, so the done screen scrolls into view below the sticky header
  (it was half hidden after merging from the bottom of a long list) and screen readers land on it.
- Merge takes PDFs only for now; the catalogue description no longer mentions images (they come with M3's Images to
  PDF). Shared `stickyBg`/`stickyWash` in `src/components/sticky.ts`; a unit test checks every available tool has a
  page and every page's tool is available.
- Checked: grafting pages with link annotations doesn't drag other pages along (one linked page out of six: 6 objects).
- Verified: new E2E `merge.spec.ts` (merge three files picked and dropped, reorder by keyboard with focus kept,
  download `cover-merged.pdf` and check page sizes in order with MuPDF, back, remove, merge again, `watchEgress` clean;
  keyboard drag with announcements and pointer drag; one file → hint and disabled button; not-a-PDF message; no WASM
  or worker request before a file; linked from the home grid). Full suite 120/120 in Chromium, Firefox, WebKit and
  Pixel 7. Checked in the dev server at 375 px and desktop (pointer drag, move buttons, done screen, FAQ, related
  tools, no horizontal scroll, no console errors). `pnpm check` passes (99 unit tests).
- Open: merge outputs lose bookmarks and AcroForm fields (the FAQ says so); carrying outlines over is a possible later
  improvement. The done screen's "continue with another tool" chips still wait for more tools.
- Next: Split.

### 2026-10-31: Network egress test, M1 done
- Added `tests/helpers/egress.ts` (`watchEgress`, D-020): watches every request of a browser context and lists each
  one that could carry user data: another origin, a method other than GET/HEAD, a body, a WebSocket/EventSource/beacon,
  or a test secret (the file's name) in the URL or headers. `blob:`/`data:` URLs are local and ignored.
- Probed first: Playwright sees requests from URL-loaded workers (classic and module) in Chromium, Firefox and WebKit,
  but nothing from a `blob:` worker in any of them. So the watch also wraps `Worker`/`SharedWorker` and
  `serviceWorker.register` in an init script and flags `blob:`/`data:` workers and service workers as unwatched.
- New E2E `egress.spec.ts`: (1) open PDFs by picker, drop and paste plus a damaged one, render every thumbnail, then
  combine, download and Save as (stubbed picker), with no problems, and the watch saw the worker script and the WASM
  the worker fetches; (2) a control that the watch catches a POST, a secret in a query string, another origin, a beacon,
  a PUT from a URL-loaded worker, a `blob:` worker and a service worker registration.
- Moved the drop/paste helpers from `intake.spec.ts` to `tests/helpers/files.ts` for reuse.
- Verified: full E2E 104/104 in Chromium, Firefox, WebKit and Pixel 7; egress + intake specs ×3 stable. `pnpm check`
  passes. No UI changed.
- Ticked the last M1 item and M1.
- Open: workers started by a worker aren't checked (we start none). M9's service worker will need Chromium's service-worker network events
  (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS`) before the watch can allow it.
- Next: M2, Merge first.

### 2026-10-31: Download pipeline + memory-limit UX (M1)
- Owner chose to finish M1 before M2. Also made `main` require both CI jobs (owner asked, after PR #7 merged with E2E
  still running because nothing was required): enforced for admins, no review requirement, not strict.
- Engine failures (D-019): new codes `out-of-memory` (MuPDF's "malloc (N bytes) failed" or a JS RangeError; the call
  fails, documents stay open), `engine-crashed` (a `WebAssembly.RuntimeError`, i.e. an abort, or the worker's `error`
  event after it had loaded) and `engine-unavailable` (the worker script or MuPDF couldn't load, e.g. offline before the
  WASM was cached). `toEngineError` classifies; the client races every call against the worker dying, so nothing
  hangs; on a fatal code it terminates the worker (next call starts a fresh one) and `engine.onReset` tells listeners
  that the open documents are gone. Checked in Node that MuPDF stays usable after a failed allocation (2 GB heap cap).
- Intake: notices have a `tone` (error/warning) and identical messages show once ("couldn't load the engine" for a
  whole batch). It follows `engine.onReset` while subscribed and drops the lost documents with a plain message. It
  warns (without refusing) when the open files total over `largeInputBytes()`: 300 MB, or 100 MB on touch devices or
  ones reporting ≤ 4 GB RAM; the warning goes away if the total drops back under. Notices list is now "File messages".
  `formatSize`, `operationFailureMessage` and `resetMessage` live in `src/intake/files.ts`.
- Download: `src/download/download.ts` (`outputName` makes safe names like `report-merged.pdf` for Windows, macOS and
  Linux; `downloadFile` via a temporary `<a download>`; `saveAs` with `showSaveFilePicker` where it exists, a closed
  dialog isn't an error). `DownloadPanel` is the DESIGN "done" screen: "Done — your file is ready", name and size,
  Download pill, "Save as…" only where supported, optional start-over. `CombinePanel` (intake → assemble every page →
  download) is on a new `test-harness/download` page that warns above 20 KB.
- Thumbnails follow-up: on-screen pages now jump the render queue (`thumbnails.prioritise`, a second shared
  IntersectionObserver), so after a long jump the visible pages render before the off-screen margin. Found because the
  600-page E2E timed out once in Firefox under full parallel load.
- Fixed: last session's PROGRESS/DECISIONS edits had cp1252 bytes for × (a Python script without `encoding=`);
  repaired to UTF-8. Playwright's `expect` timeout is now 10 s: the first open in a test loads the 10 MB WASM, which
  took Firefox over 5 s with four browsers in parallel.
- Verified: 16 new unit tests (97 total: error classification, worker death/abort/never-started/OOM with a fake
  worker, intake warning/withdrawal/dedupe/reset, messages, names incl. reserved and multi-byte, save-as and cancel,
  render priority). New E2E `download.spec.ts`: combine two PDFs and download `Q3 report-combined.pdf` (reopened with
  MuPDF: 3 pages); Save as via a stubbed picker; Save as only offered where supported; large-input warning; WASM
  blocked → one "couldn't load" notice, then works once unblocked; worker script blocked → same, and a fresh worker
  next time. Full suite 96/96 in Chromium, Firefox, WebKit and Pixel 7, twice in a row. Checked the warning, error and
  done screens at 375 px and desktop. `pnpm check` passes.
- Open: split (M2) will need several outputs in one download, probably a zip (fflate, MIT). The done screen's "continue
  with another tool" chips and the support link wait for tool pages (M2) and the donate page (M9). A real WASM abort
  or OOM can't be produced in E2E, so those paths are unit-tested only.
- Next: network egress test.

### 2026-10-31: Virtualised page thumbnails (M1)
- Added `src/thumbnails/cache.ts`: `createThumbnailCache` (framework-free). Requests queue in order and go to the
  engine two at a time; a request cancelled before it starts never reaches the engine; requests for the same image
  share one render; images are kept per (doc, page, width) under a 64 MB byte budget, least recently used dropped first
  (and `ImageBitmap.close()`d); `forget(doc)` drops a closed document's images and queued renders and ignores its
  renders in flight (worker ids can be reissued). `renderWidth` picks device pixels (capped at 2×) in steps of 32 px so
  small layout changes reuse cached images. `src/thumbnails/thumbnails.ts` is the page's shared instance. Design in D-018.
- `src/components/thumbnails/ThumbnailGrid.tsx`: every page is a light `<li>` placeholder of the right shape (fitted in
  an A4-portrait box), so keyboard, screen readers and find-in-page see all of them; only pages within one viewport of
  the screen (one shared IntersectionObserver) mount a `<canvas>` and request a render, and the canvas goes when they
  leave. Columns come from the grid's width (min 128 px, at least 2). Failed renders say "Can't show this page".
  `PagesPanel` (intake + a grid per open document) is on a new `test-harness/thumbnails` page; the harness now exposes
  the cache as `window.harness.thumbnails`.
- Verified: 8 new unit tests (order and concurrency, cancel before/after start, shared renders, LRU budget incl. an
  oversize image, forget with a reused id, failures not cached, render widths). New E2E `thumbnails.spec.ts` (pages the
  right way up and shape by pixel colour, incl. a /Rotate 90 page; a 600-page PDF lists 600 items but renders under 100
  near the top, jumping to the end renders the last page without the middle and removes the top canvases, scrolling back
  re-renders nothing; removing a document empties the cache and closes it). Full suite 72/72 in Chromium, Firefox, WebKit
  and Pixel 7, thumbnails spec ×3 stable. In the dev harness: 600 pages listed in ~300 ms, a fast scroll through all of
  them kept ~36 canvases and 41 MB of cached images; checked at 375 px (2 columns, no horizontal scroll) and 1024 px.
  `pnpm check` passes; a production build still has no harness pages.
- Open: the grid observes the window's viewport; an M2 workspace with its own scroll container will need to pass that
  as the IntersectionObserver root. WebKit is the slowest at a long jump (~1.3 s to the last page after scrolling 600
  pages). Thumbnails ignore user-applied rotation for now (M2 can rotate the canvas with CSS).
- Next: download pipeline + memory-limit UX.

### 2026-10-31: File intake (M1)
- Added `src/intake/`: `files.ts` (sniffs each file's first 1 KB for a PDF header or an image signature, falls back to
  the name/type for headerless PDFs so MuPDF can try a repair; `checkFiles` accepts or explains each file;
  `openFailureMessage` maps `EngineError` codes to plain words) and `intake.ts` (`createIntake(engine)`: a
  framework-free store of open documents that checks a batch, opens accepted files one at a time in order, keeps one
  notice per file it couldn't take, closes documents on remove, and swaps the file in single-file tools). Design in D-017.
- React pieces in `src/components/intake/`: `useIntake` (store + real engine), `FileDrop` (a `<label>` around a
  visually hidden file input, so it's native and keyboard reachable; drop anywhere on the page; paste; preloads the
  engine on hover/focus/click/dragenter; a compact "Add more" form once files are listed), `DocumentList`,
  `IntakeNotices` (always-present live region) and `IntakePanel` composing them.
- Test harness: `[name].astro` now builds `engine`, `intake` and `intake-single`; the intake pages mount `IntakePanel`.
  `window.harness` typing moved to `tests/helpers/harness.ts`. `makePdf` returns `Uint8Array<ArrayBuffer>` so it can go
  straight into a `File`.
- Verified: 16 new unit tests (sniffing incl. leading junk, misleading names, HEIC; rejections and messages; ordered
  sequential opening, notices per batch, removal during opening, single-file swap, subscriptions). New E2E
  `intake.spec.ts` (7 tests: picker, drop, paste, drag highlight, damaged/protected/empty files, remove closes in the
  engine, single-file swap, keyboard focus preloads the WASM). Full suite 60/60 in Chromium, Firefox, WebKit and
  Pixel 7. Checked the empty and filled states at 375 px and 1280 px. `pnpm check` passes.
- Open: no tool page uses intake yet, so the home hero still has no drop zone (D-011). A dropped folder reads as "is
  empty". Per-file size/memory warnings belong to the memory-limit UX item.
- Next: virtualised page thumbnails.

### 2026-10-31: Engine worker API (M1)
- Added `src/engine/`: `ops.ts` (pure MuPDF operations: `openPdf`, `describe`, `renderPage`, `assemble`), `worker.ts`
  (Comlink worker holding open documents by id), `client.ts` (main-thread API: `engine.open/render/assemble/close`,
  `preloadEngine()`), `errors.ts` (`EngineError` codes survive the worker boundary) and `types.ts`. Design in D-016.
  `mupdf` and `comlink` (Apache-2.0) are now runtime dependencies.
- `assemble(pages)` is the one structural operation: pages of open documents (with added rotation) and blank pages, in
  order. It covers merge, extract, delete, reorder, rotate, duplicate and insert blank for M2.
- The worker starts on first use and is recycled (terminated) when idle with no documents open once 64 MB of input
  has gone through it. Astro now builds workers as ES modules (`vite.worker.format`), and `mupdf` is excluded from dev
  pre-bundling so its `.wasm` resolves under `pnpm dev`.
- Test harness pages: `src/pages/test-harness/[name].astro` is only built with `PLYLEAF_TEST_HARNESS=1`, which the
  Playwright web server sets. Production builds have no harness page (checked). `.claude/launch.json` has a
  `plyleaf-dev-harness` dev server with it on.
- Verified: 21 new unit tests (ops against real MuPDF in Node with PDFs generated by `tests/helpers/pdf.ts`: sizes,
  own and inherited rotation, repair of a truncated file, not-a-PDF, user vs owner password, render size and
  orientation by pixel colour, merge/reorder/duplicate/rotate/blank, shared resources copied once, bad arguments; error
  codes over a real Comlink channel; worker start/reuse/recycle with a fake worker). New E2E `engine.spec.ts`: no
  engine request before first use, then the WASM loads; open/render/assemble/reopen in the worker; typed errors. Full
  suite 32/32 in Chromium, Firefox, WebKit and Pixel 7. Also checked open/render/errors under `pnpm dev`.
  `pnpm check` passes.
- Open: production `dist/` already contains the engine chunks and the 10 MB `.wasm` (Astro bundles the harness script
  even when the page isn't generated); nothing references them until a tool ships, and it's under Workers' 25 MiB
  per-file limit. A worker that dies (a real OOM abort) leaves Comlink calls pending forever: handle that in the
  memory-limit UX item (reject in-flight calls on `error`, restart, re-open). `open` has no password option yet (M4).
- Next: file intake.

### 2026-10-31: Engine spike, D-006 resolved (M1)
- Built `bench/engine/`: a fixture generator (seeded, licence-clean: 12-page text 40 KB, 100-page scan 28 MB,
  42-page mixed 52 MB; not committed), adapters for MuPDF.js 1.28, PDFium (`@embedpdf/pdfium` 2.15), pdf.js 6.4 and
  pdf-lib (`@cantoo/pdf-lib` 2.11), a Vite page and a Playwright runner (3 runs × 3 browser engines, fresh context per
  run). `pnpm bench:fixtures`, `pnpm bench:engine`, then `node bench/engine/report.ts <results.json>`.
- Result: MuPDF.js was fastest at bulk thumbnails in Chromium, Firefox and WebKit, and fastest at merge/rotate.
  PDFium was 7× slower in Firefox, pdf.js 7–11× slower in WebKit. MuPDF.js's cost is the download (3.5 MB Brotli vs 1.6 MB
  for PDFium). Decision D-015: MuPDF.js only, in a worker. Full tables in `docs/research/engine-spike.md`.
- Verified: every engine's merged and rotated output reopened with the right page count; first-page thumbnails from
  all three renderers checked by eye. `pnpm check` passes (bench code is linted and typechecked too).
- Open: the WASM heap reached 226 MB with the 52 MB file open and 469 MB after merging 80 MB of input, and it never
  shrinks. The worker API needs recycling and size-based memory warnings. `measureUserAgentSpecificMemory` only works in
  Playwright's full Chromium channel, not the headless shell. Check Cloudflare serves `.wasm` compressed once it ships.
- Next: worker + Comlink engine API.

### 2026-10-31: M0 done, site live
- Owner connected the repo to a Worker named `plyleaf` with Workers Builds. Found it with the Cloudflare connector
  (assets-only, no script). The connector doesn't expose the `workers.dev` subdomain; it's `ajiohjesse`.
- Verified on https://plyleaf.ajiohjesse.workers.dev: 200 with the `_headers` security headers, real 404 page for
  unknown paths, `/_astro/*` cached immutable, self-hosted fonts. Playwright can now target a deployed site with
  `BASE_URL`; all 20 E2E runs pass against production, including the same-origin-only check (so Cloudflare injects no
  third-party scripts).
- PR Previews: the first Preview build (PR #3) failed. `wrangler preview` needs a `previews` block in `wrangler.jsonc`,
  even an empty one; after adding it the build passed and Cloudflare posted the Preview URL on the PR
  (`<branch>-plyleaf.ajiohjesse.workers.dev`, served with `X-Robots-Tag: noindex`). E2E: 20/20 pass against it.
  Workers Builds logs are only in the dashboard (the connector can't read them, and the GitHub check has no log text).
- Ticked the last M0 item and M0 itself.
- Next: M1, starting with the engine spike (D-006).

### 2026-10-31: Cloudflare deploy setup (M0)
- PR #1 merged after green CI. Owner added a Cloudflare connector; it can list Workers and search docs but has no tool to
  create a Worker or connect a repo, so the one-time connection stays a dashboard step for the owner.
- Chose Workers static assets + Workers Builds over Pages (D-014). Added `wrangler.jsonc` (assets from `dist/`,
  `404-page` handling, preview URLs on), Wrangler as a dev dependency (pnpm `allowBuilds` for esbuild/workerd),
  `public/_headers` (nosniff, no-referrer, no FLoC/Topics, no framing; immutable caching for `/_astro/*`) and a 404 page.
- Verified: `wrangler deploy --dry-run` reads 13 assets with no warnings; `wrangler dev` serves `/` with the headers,
  returns a real 404 with our page for unknown paths, and caches `/_astro/*` for a year. `pnpm check` and E2E (now 5
  tests × 4 browser projects) pass. Compatibility date is 2026-10-30, the newest the local workerd supports.
- Owner steps: dashboard → Workers & Pages → Create → Import a repository → GitHub `ajiohjesse/plyleaf`. Project name
  `plyleaf`, build command `pnpm build`, deploy command `npx wrangler deploy`, root `/`. Then Settings → Build → Branch
  control → enable Preview builds. Node 24 comes from `.nvmrc`; pnpm from `packageManager`.
- CSP is not set yet: Astro's island loader is an inline script, so a strict CSP needs hashes. Add it in M9.

### 2026-10-31: M0 scaffold, tooling, tokens, landing page
- `git init` (local only, no remote yet): planning docs + AGPL-3.0 LICENSE on `main`, all M0 work on branch `m0/scaffold`.
- Scaffolded Astro 7 (static) + React 19 islands + TypeScript 6 (strictest) + Tailwind v4. Tooling: Oxlint (warnings
  fail), Prettier (+ Astro plugin), `astro check`, Vitest, Playwright (Chromium, Firefox, WebKit, Pixel 7). CI workflow
  runs all of them plus the build on every PR.
- Design tokens in `src/styles/global.css`, mapped to Tailwind names; dark tokens defined but opt-in (D-010). Outfit and
  Figtree self-hosted via Fontsource (D-009). A unit test checks every text/background token pair for WCAG AA in both
  themes; they all pass with the DESIGN.md starting values, so no colour changes were needed.
- Home page: header, hero with the sticky-note/selection-frame illustration, promise strip, product-frame mock of the
  workspace, searchable tool grid (React island, `client:idle`, 36 tools from `src/data/tools.ts`, all "Soon"),
  how-it-works, comparison table, CTA band, navy footer. No hero drop zone yet: that comes with M1 file intake (D-011).
- Verified: lint, format check, typecheck, 36 unit tests, build; Playwright home tests (sections, search filter,
  same-origin requests only, no horizontal scroll) pass in Chromium, Firefox, WebKit and the Pixel 7 profile, repeated
  3×. Checked in a browser at 375 px and desktop widths. Fixed on the way: search text typed before the island hydrated
  was dropped (the input is now uncontrolled and read on hydration); `client:visible` never hydrated in WebKit when the
  page scrolled by focusing the input, so the grid hydrates on idle instead; the comparison table overflowed on phones.
- Home page JS: ~72 KB gzipped (mostly React), loaded after the page is idle, never blocking first paint. Revisit for the M9
  Lighthouse target if needed (vanilla filter or Preact).
- Owner chose a public repo under `ajiohjesse` and deferred the domain (D-013). Created
  https://github.com/ajiohjesse/plyleaf, pushed `main` and `m0/scaffold`, opened PR #1.
- CI passed on PR #1 on GitHub runners: lint/typecheck/unit/build and E2E in all four browser projects.
- Next: merge PR #1; Cloudflare Pages preview.

### 2026-10-31: Planning session
- Researched competitors and the open-source landscape; wrote GOAL, STRATEGY, DESIGN, DECISIONS, CLAUDE.md.
- Owner approved the name **Plyleaf** (D-001).
- Verified: name availability (GitHub + .com/.app/.dev/.io/.org via RDAP), as of today.
- Next: M0, starting with creating the repo and the scaffold.
