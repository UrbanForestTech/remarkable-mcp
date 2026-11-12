# Working notes for Claude Code — UrbanForestTech/remarkable-mcp

This is Urban Forest's public fork of SamMorrowDrums/remarkable-mcp (MIT). The plan and the decisions already made are in `docs/urban-forest/`; read `docs/urban-forest/spec-cloudflare.md` before any deployment work. The owner is David Runkles; he is not a full-time developer, so explain in plain words and ask one question at a time.

## Rules that always hold

- Never type, store or echo a credential: no reMarkable token, registration code, Cloudflare API token, OAuth client secret or tunnel key — not in files, commits, logs, or the chat. David enters secrets himself (Cloudflare dashboard, `wrangler secret put`, masked prompts). Local secrets live in an ignored `.dev.vars` or `%USERPROFILE%\.rmapi`.
- This repository is public. Nothing from anyone's reMarkable tablet goes in: no document or folder names, no listings, no page contents, no verification output. Counts, formats and timings are fine. No personal file paths; use `<REPO>` placeholders or paths relative to the repository root.
- Never deploy, and never merge into `main` or `release`, without David's explicit yes in the conversation. Work on `lab/<topic>` branches; open pull requests against **this fork's** `main` (GitHub's default base for a fork is the upstream project — change it every time). Each merge into `release` is a production deploy through Cloudflare Workers Builds.
- Never create a tag starting with `v`: upstream's `publish.yml` would try to publish to PyPI.
- The tablet is a Paper Pro. No developer mode, SSH or USB work; the cloud transport only. Library changes (upload, mkdir, move, rename, delete-to-Trash) are approved; editing a notebook's pages is not in scope.
- Before committing Python, run `uv run ruff format .` and `uv run ruff check .` (upstream's CI lint job enforces both, line length 100). Tests: `uv run pytest -v`.
- Upstream fixes that are general (not Urban Forest-specific) should go upstream as pull requests to SamMorrowDrums/remarkable-mcp, so the fork stays small.

## State on 2026-11-11

- Branch `lab/repo-setup` (pull request #1 to `main`): `docs/urban-forest/` (specs, research note), `.gitignore` additions, `scripts/local/` (Windows launchers, register and verify helpers, Claude desktop example). All CI jobs pass except that the formatting fix in the last commit must be pushed and rechecked; then David merges.
- The server runs locally on David's Surface today (cloud transport, library changes on) and is reachable from Claude's desktop app; ChatGPT reaches it through OpenAI's secure MCP tunnel. The hosted version replaces both.
- Decided: sign-in through Microsoft 365 (Entra app registration, David's click); `workers.dev` address first, a custom domain chosen when the Claude and ChatGPT connectors are added (`urbanforest.ai` is not owned); builds and deploys through Cloudflare Workers Builds from a `release` branch (no Docker on any computer); Workers Paid $5/month approved; the second user (John) has a tablet and Connect.
- Known bugs to look at later, in the Python server: text extraction returned nothing for a real-text PDF (rendering was fine); SVG stroke render failed on one page; `rmscene` logs newer-format warnings on Paper Pro notebooks.

## Next work (spec section 2.9, steps 2–3), on a branch `lab/cloudflare`

1. Read `remarkable_mcp/` to settle what the `REMARKABLE_TOKEN` environment variable expects (a token string, or the contents of `~/.rmapi`). If the variable alone is not enough, the container's start script writes the secret into `/root/.rmapi` before launching the server. Document the answer in `deploy/cloudflare/README.md`.
2. `deploy/cloudflare/Dockerfile`: `python:3.12-slim`, `linux/amd64`, `tesseract-ocr` from apt, this repo installed with uv, entrypoint `python -m remarkable_mcp.cli --http --host 0.0.0.0 --port 8000` with the same environment as `scripts/local/Start-RemarkableCloud.ps1` (USB, SSH and local-dir off, cloud fallback off, delete confirmations kept, tesseract, a cache dir).
3. `deploy/cloudflare/wrangler.jsonc` and `deploy/cloudflare/worker/` (TypeScript): a gateway Worker that checks a bearer token (a temporary single secret for step 3; OAuth comes in step 4) and forwards the MCP request to a per-user container instance (`getByName(userId)`) on port 8000, using the `@cloudflare/containers` package. Instance type `basic`, `sleepAfter` ten minutes. Read the current `@cloudflare/containers` docs and the Workers OAuth Provider README first (does it need a KV namespace; does it support dynamic client registration) and record what you find in the README.
4. Write `deploy/cloudflare/README.md`: how Workers Builds is connected (David's clicks: account, Workers Paid, connect the repo, production branch `release`, secrets), the timing test (first call after sleep and a page render, timed and logged), and every point that needs David's yes.
5. Commit on the branch, run ruff and the tests, open a pull request against this fork's `main`, and stop for David's review. Do not deploy.

If something in the spec turns out wrong, say so and propose the change; do not silently work around it.
