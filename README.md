# Plyleaf

**Every PDF tool you need. Actually free.** No sign-up, no watermark, no limits, and your files never leave your device.

Plyleaf runs every PDF operation in your browser (WebAssembly), so there are no servers processing your documents
and nothing to charge you for. It's open source under AGPL-3.0.

> Status: planning complete, building M0 (foundation). See [docs/PROGRESS.md](docs/PROGRESS.md).

## Project docs
- [Goal and milestones](docs/GOAL.md): what we're building and what "done" means
- [Progress](docs/PROGRESS.md): current milestone, checklist and session log
- [Strategy and research](docs/STRATEGY.md): competitors, the sign-in decision, architecture, costs
- [Design direction](docs/DESIGN.md): UI style, tokens, page blueprints
- [Decisions](docs/DECISIONS.md): an append-only log

## Working on Plyleaf with Claude Code
Start a new session in this folder and say:

> Continue building Plyleaf. Follow the session protocol in CLAUDE.md.

Each session picks up the next unticked item in `docs/PROGRESS.md`, builds and verifies it, and records what it did.
