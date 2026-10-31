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
