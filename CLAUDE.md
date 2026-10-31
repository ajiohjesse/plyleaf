# Plyleaf: agent instructions

Plyleaf is a completely free, no-sign-up, browser-only PDF toolkit. The goal, scope and milestones are in
[docs/GOAL.md](docs/GOAL.md). Build towards it one milestone at a time, over many sessions.

## Session protocol (do this every session)

1. **Orient.** Read `docs/GOAL.md` (principles + milestones), `docs/PROGRESS.md` (current state + latest log entry) and
   `docs/DECISIONS.md`. Read `docs/DESIGN.md` before any UI work and `docs/STRATEGY.md` when choosing technology.
2. **Pick the work.** Continue the current milestone in PROGRESS.md: take the first unticked item, unless the owner
   asked for something specific. Don't start a later milestone while an earlier one has unticked items, unless the owner says so.
3. **Plan small.** Aim for one or a few items per session, each one finished and verified rather than many half-done.
4. **Build and verify.** Write tests with the feature (Vitest for logic, Playwright for each tool with a real fixture PDF).
   Run lint, typecheck and tests before you call anything done. Check UI changes in a browser at phone and desktop widths.
5. **Record.** Before ending, update `docs/PROGRESS.md`: tick verified items, update "Current milestone / Next action /
   Blocked on owner" and add a session-log entry (newest first). Add new decisions to `docs/DECISIONS.md`.
6. **Commit.** Work on a branch, use small commits with clear messages, and open a PR when a coherent piece is done.
   Never push to `main` directly once CI exists.

## Rules that are never broken (GOAL.md §3)
- No paywalls, quotas, "Pro" features, watermarks or upgrade prompts.
- No sign-in, accounts or user database. Anything personal (signatures, settings) is stored on the device only.
- User file bytes never go over the network. Process in the browser (WASM in Web Workers). The one possible exception
  (M8 Office conversion) needs an explicit owner decision first (D-007).
- No dark patterns: no nag modals, fake waits or countdowns. Donations are a quiet link, never a gate.
- No third-party requests at runtime beyond our own origin/CDN (self-host fonts, no trackers, cookieless analytics only).

## When to stop and ask the owner
Ask before: adding any server or backend, adding a dependency with a licence incompatible with AGPL-3.0, changing
a principle or the milestone order, spending money or registering anything, or resolving a decision marked
"owner gate". For everything else, use your judgement and record notable choices in DECISIONS.md.

## Stack (D-005)
Astro (static output) · React 19 islands · TypeScript (strict) · Tailwind CSS v4 · Web Workers + Comlink ·
MuPDF.js / pdf-lib (final split per D-006) · Vitest · Playwright (Chromium, Firefox, WebKit) · Oxlint + Prettier ·
Cloudflare Pages. Package manager: pnpm.

## Commands
- `pnpm dev`: dev server on http://localhost:4321 · `pnpm build` → `dist/` · `pnpm preview`: serve the build
- `pnpm lint` (Oxlint, warnings fail) · `pnpm format` / `pnpm format:check` (Prettier) · `pnpm typecheck` (astro check)
- `pnpm test`: Vitest unit tests in `tests/unit/` · `pnpm e2e`: Playwright against the production build
  (first run: `pnpm exec playwright install chromium firefox webkit`)
- `pnpm check`: lint + format check + typecheck + unit tests (run before calling anything done)
- `pnpm build && pnpm exec wrangler dev`: serve `dist/` in Cloudflare's local runtime (checks `_headers`, 404 handling).
  Deploys happen through Workers Builds on push (D-014); don't run `wrangler deploy` by hand.
- `BASE_URL=<url> pnpm e2e`: run the E2E suite against a deployed site (production: https://plyleaf.ajiohjesse.workers.dev,
  or a PR's Preview URL) instead of a local build.

## Layout
- `src/styles/global.css`: design tokens (CSS variables) mapped to Tailwind names in `@theme`; contrast is tested
  in `tests/unit/tokens.test.ts`, so add new text/background pairs there.
- `src/layouts/ToolPage.astro`: every tool's landing page (hero + workspace slot, how it works, FAQ, related; D-021).
  `src/pages/merge-pdf.astro` + `src/components/merge/MergeWorkspace.tsx` is the first tool and the pattern to follow.
- `src/data/tools.ts`: the tool catalogue. Set `available: true` when a tool's page ships; the home grid and footer
  link it automatically.
- `src/components/`: Astro components (static) and React islands (`.tsx`). `src/components/home/`: home page sections.
- `src/engine/`: the PDF engine (D-016). Pages and islands import only `client.ts`; operations go in `ops.ts` (pure,
  unit-tested in Node) and are exposed by `worker.ts`.
- `src/intake/`: file checks and the open-documents store (`createIntake`); `src/components/intake/`: `useIntake`,
  `FileDrop` (picker, page-wide drop, paste) and the file list/notices that tool workspaces build on (D-017).
- `src/thumbnails/`: the shared page-thumbnail cache (`thumbnails`, D-018); `src/components/thumbnails/ThumbnailGrid`
  renders a document's pages and only renders those near the viewport.
- `src/organize/`: pure Organize logic (page ranges, split part names, zipping several outputs, D-022; the crop
  frame, D-024).
  `src/components/workspace/parts.tsx`: pieces every tool workspace shares (action bar, failure alert, file card,
  radio cards); `src/components/split/SplitWorkspace.tsx` is the single-file tool pattern.
- Page-level Organize tools are modes of `src/components/organize/OrganizeWorkspace.tsx` (specs in `tools.tsx`) on the pure
  page board `src/organize/board.ts` (D-023); `PageBoard` renders it. E2E steps they share: `tests/helpers/organize.ts`.
- `src/download/`: output names, `downloadFile` and `saveAs`; `src/components/download/DownloadPanel` is the "done"
  screen. Show engine failures with `openFailureMessage` / `operationFailureMessage` from `src/intake/files.ts` (D-019).
- `src/pages/test-harness/`: pages for E2E tests to drive internals, built only when `PLYLEAF_TEST_HARNESS=1`.
- `tests/helpers/pdf.ts`: builds test PDFs with MuPDF (works in Vitest and Playwright). `tests/helpers/files.ts`: drop
  and paste files in E2E. `tests/helpers/egress.ts`: `watchEgress`; every tool's E2E test asserts no request could
  carry the file (D-020).

## Conventions
- Each tool = a static landing page under `src/pages/<tool-slug>.astro` + a React workspace island + an engine
  operation in the worker. Keep engine operations pure (bytes in → bytes out) and unit-tested.
- Large WASM and OCR data are loaded lazily and never imported on landing pages.
- Test fixtures live in `tests/fixtures/` (small, licence-clean PDFs that we generate ourselves where possible).
