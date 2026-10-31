# Progress

Single source of truth for where Plyleaf is. **Every session updates this file before it ends.**

- **Current milestone:** M0: Foundation
- **Next action:** Owner connects the repo in Cloudflare (Workers Builds, steps in the 2026-10-31 deploy log entry). Then
  verify the production `workers.dev` URL and a PR Preview URL, tick the last M0 item, and start M1 with the engine
  spike (D-006).
- **Blocked on owner:**
  - Connect `ajiohjesse/plyleaf` to a Worker named `plyleaf` in the Cloudflare dashboard. The connector available to
    agents can read the account but can't create a Worker or a Git connection.
  - Later, at the owner's pace: register `plyleaf.com` (and optionally the `plyleaf` GitHub org). Not blocking (D-013).
- **Repo:** https://github.com/ajiohjesse/plyleaf (public). `gh`'s active account on this machine is `angosam`, so run
  `gh`/`git push` as ajiohjesse (e.g. `GH_TOKEN=$(gh auth token --user ajiohjesse)`) or switch with `gh auth switch`.

## Milestones

Tick an item only when it's verified (tests pass / checked in a browser). Tick the milestone when all its items are ticked.
Done-when criteria are in [GOAL.md §7](GOAL.md#7-milestones).

### [ ] M0: Foundation
- [x] GitHub repo created, AGPL-3.0 LICENSE, README
- [x] Astro + React + TypeScript + Tailwind v4 scaffold builds
- [x] Oxlint + Prettier + typecheck + Vitest + Playwright configured
- [x] GitHub Actions CI runs all checks on PRs
- [x] Design tokens and fonts from DESIGN.md implemented
- [x] Landing page: hero, promise strip, tool grid, comparison table, CTA, footer (responsive)
- [ ] Cloudflare preview deploy live (Workers static assets, D-014; config ready, waiting on the dashboard connection)

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
