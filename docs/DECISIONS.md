# Decisions Log

Append-only. Each entry: ID, date, decision, why, and who approved. Owner-level decisions need the owner's approval
before they're recorded as **Accepted**. If a session needs one, mark it **Proposed** and ask the owner.

| ID | Date | Status | Decision | Why |
|----|------|--------|----------|-----|
| D-001 | 2026-10-31 | Accepted (owner) | Product name is **Plyleaf**; target domain `plyleaf.com`, GitHub `plyleaf` | Free on GitHub and all major TLDs; no web footprint. See STRATEGY §7. |
| D-002 | 2026-10-31 | Accepted | All file processing runs client-side (WASM in Web Workers) | Zero per-task cost makes "free forever" sustainable; real privacy. STRATEGY §2. |
| D-003 | 2026-10-31 | Accepted | **No user accounts or sign-in** anywhere; personal data (signatures, prefs) stored on the device | Removes friction, cost and data liability; it's the core promise. STRATEGY §3. |
| D-004 | 2026-10-31 | Accepted | Licence: **AGPL-3.0** | Needed to use MuPDF.js / Ghostscript WASM; proves the privacy claims; keeps forks open. |
| D-005 | 2026-10-31 | Accepted | Stack: Astro (static) + React islands + TypeScript + Tailwind v4; Vitest + Playwright; Oxlint; Cloudflare Pages | STRATEGY §6. |
| D-006 | 2026-10-31 | Open (resolve in M1) | Engine split: MuPDF.js-only vs MuPDF.js + pdf-lib vs pdf.js/PDFium for rendering | Needs a benchmark: bundle size, load time, memory, speed on 3 reference PDFs (small text, 100-page scanned, 50 MB mixed). |
| D-007 | 2026-10-31 | Open (owner gate in M8) | Office conversions: client-side only vs opt-in disclosed server fallback | Client-side Office fidelity is unproven; a server conflicts with P3 unless opt-in. |
| D-008 | 2026-10-31 | Accepted | Pin **TypeScript 6.x** (not 7) | `@astrojs/check` only supports TS ≤ 6 as of today. Revisit when it supports 7. |
| D-009 | 2026-10-31 | Accepted | Self-host fonts via `@fontsource-variable/outfit` and `/figtree` (OFL-1.1), bundled by Vite | No runtime Google Fonts request (privacy rule); OFL is compatible with AGPL. |
| D-010 | 2026-10-31 | Accepted | Dark-theme tokens exist from M0 but only apply under `[data-theme="dark"]` | DESIGN.md: define in M0, ship in M9. Avoids a half-styled dark mode in the meantime. |
| D-011 | 2026-10-31 | Accepted | Unbuilt tools show as "Soon" tiles without links; the home hero has no drop zone until M1 file intake exists | Honest UI (P5): no dead links and no drop zone that does nothing. |
| D-012 | 2026-10-31 | Accepted | E2E runs against the production build (`astro preview`) in Chromium, Firefox, WebKit and a Pixel 7 profile; the home page test asserts every request is same-origin | Tests what we deploy; the same-origin check guards the no-third-party-requests rule until the M1 egress test lands. |
| D-013 | 2026-10-31 | Accepted (owner) | Public repo lives at **github.com/ajiohjesse/plyleaf**; domain and `plyleaf` org registration deferred | Owner's choice. `site.repoUrl` points there; `site` in `astro.config.mjs` stays `https://plyleaf.com` as the future canonical URL. |
| D-014 | 2026-10-31 | Accepted | Host on **Cloudflare Workers static assets** via Workers Builds (Git integration), not Cloudflare Pages | Cloudflare now recommends Workers for new static sites; same free tier. `main` deploys to production, other branches get Preview URLs posted on PRs. Config in `wrangler.jsonc`, no Worker script. D-005's "Cloudflare Pages" now means this. |
