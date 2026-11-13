# remarkable-mcp on Cloudflare: build step 2

This folder holds Urban Forest's hosted version of the server. The plan is in
[`docs/urban-forest/spec-cloudflare.md`](../../docs/urban-forest/spec-cloudflare.md)
(section 2.9). This is build step 2: the files are written and tested, and
**nothing is deployed**. Every point that needs the owner's yes is marked **⚑ Approval**.

## What is here

| File | What it does |
|---|---|
| `Dockerfile` | The container image: `python:3.12-slim` for `linux/amd64`, Tesseract from apt, this repository installed with uv from `uv.lock`. It uses the same settings as `scripts/local/Start-RemarkableCloud.ps1`: cloud only, library changes on, delete confirmations kept, Tesseract OCR, a scratch cache. It runs as a non-root user. |
| `serve.py` | Starts the server inside the container (see "Why a launcher" below). |
| `test_serve.py` | Checks that the launcher accepts only the gateway's Host and no browser Origin. Runs with the rest of the Python tests. |
| `wrangler.jsonc` | The Worker and container settings: instance type `basic`, at most 2 instances (one per user), a Durable Object class per container. |
| `worker/src/gateway.ts` | The gateway logic: checks the bearer token, then forwards `/mcp` to that user's container. Logs the method, user, status and milliseconds of each call, and never logs headers or bodies. |
| `worker/src/index.ts` | Connects the gateway to Cloudflare. It defines the container class (port 8000, sleeps after 10 minutes) and passes the user's reMarkable token into the container when it starts. |
| `worker/test/` | The gateway's tests (`npm test`). They run in plain Node with no container. |
| `../../.github/workflows/cloudflare-gateway.yml` | GitHub Actions on pull requests: the gateway's typecheck and tests, plus building the image and checking that it answers. It never deploys. |

## Answers to the questions the spec left open

**What `REMARKABLE_TOKEN` expects** (step 1, checked in `remarkable_mcp/api.py` and
`remarkable_mcp/sync.py`, 2026-11-13). The variable takes **the same text as the
`~/.rmapi` file**: the JSON object `{"devicetoken": "...", "usertoken": "..."}`
that `--register` writes. A bare device token (a JWT starting `eyJ`) also works.
When the variable is set it takes priority, and the file is not read. The user
token inside is short-lived: the server swaps the device token for a new one on
first use and again whenever reMarkable answers 401. So **the variable alone is
enough**, and the container needs no start script writing `/root/.rmapi`. The
secret is the whole contents of that user's `.rmapi` file, entered as
`REMARKABLE_TOKEN_<USER>` (for example `REMARKABLE_TOKEN_DAVID`).

**Why a launcher instead of `python -m remarkable_mcp.cli --http --host 0.0.0.0`.**
The spec's command does not work. Upstream's CLI refuses wildcard addresses
("Wildcard HTTP bind addresses are not supported"). The server also answers
421 to any request whose `Host` is not its own listen address. Inside a
container the server has to listen on every interface. `serve.py` starts the
same server object on `0.0.0.0:8000` and accepts only `Host: container`, which
the gateway always sends. It also rejects any `Origin`. Upstream's code is
unchanged. This was the owner's choice on 2026-11-13. Tested locally: an MCP
`initialize` returns 200 with Host `container`, 421 with any other Host, and
403 when an Origin is present.

**`@cloudflare/containers`** (read 2026-11-13; npm 0.3.7). The package's `Container`
class has `defaultPort`, `sleepAfter` (default `"10m"`) and `envVars`, which are
read each time the container starts. `getContainer(binding, name)` returns one
instance per name. Before forwarding, it waits until the port answers, polling
every 300 ms for up to 20 seconds. Calls to `fetch` keep the request's URL
host, so the gateway rewrites it to `container`. Cloudflare's own "Get started"
page now shows a newer, lower-level API: `ctx.container` directly, with
`"scheduling_policy": "durable_object"` and `images`. That policy is beta and
cannot be changed once an application is created. This folder uses the package
and the default policy, as the spec says. Disk is **ephemeral**: an instance
that wakes from sleep starts with a fresh disk from the image (Containers
platform details page). So the render cache does not survive a sleep, as the
spec assumed.

**Workers OAuth Provider** (`@cloudflare/workers-oauth-provider`, npm 1.2.4; README and
`docs/authorization-server.md` read 2026-11-13). For build step 4:
- **KV is needed.** The authorization server needs a KV namespace bound as `OAUTH_KV`.
- **Dynamic client registration is supported, and off by default.** Setting
  `clientRegistrationEndpoint` (for example `/oauth/register`) turns it on. Claude's
  "Register automatically" needs it.
- PKCE (RFC 7636), authorization-server metadata (RFC 8414) and protected-resource
  metadata (RFC 9728) are supported.
- Upstream sign-in (Microsoft 365 / Entra) goes in our own `/authorize` handler:
  `parseAuthRequest()`, then the Microsoft sign-in, then `completeAuthorization()`
  with the user's id in `props`. The gateway then reads `ctx.props` to choose the
  container, replacing the temporary bearer token. The package's
  `docs/upstream-sign-in.md` covers this pattern.

## How Workers Builds gets connected (build step 3, the owner's clicks)

None of this has been done. Do it only after this pull request is merged into `main`.

1. **⚑ Approval: which Cloudflare account.** Still open in the spec.
2. **Workers Paid** ($5/month, approved 2026-11-11). Cloudflare dashboard → the
   account → Workers & Pages → Plans.
3. **⚑ Approval: create the `release` branch** from `main` on GitHub. Each later
   merge into `release` is a production deploy.
4. **Create the Worker from the repository.** Workers & Pages → Create → Import a
   repository → GitHub → `UrbanForestTech/remarkable-mcp`. The dashboard's wording
   may differ; these menu names have not been checked on the live dashboard.
   Settings:
   - **Branch:** `release`.
   - **Root directory:** `deploy/cloudflare`.
   - **Build command:** leave empty. The deploy command installs from `package.json`.
   - **Deploy command:** `npx wrangler deploy` (the default). It builds the
     `Dockerfile` in Cloudflare's build environment, so no Docker is needed on any
     computer.
   - **Builds for non-production branches:** turn these off. `lab/*` branches are
     checked by GitHub Actions and should not upload anything to Cloudflare.
   - **Worker name:** `remarkable-mcp`, matching `wrangler.jsonc`. As far as known,
     Workers Builds fails when the two differ. Settle this on the setup screen.
5. **Secrets.** The owner enters these. They are never typed into a chat or a file
   in this repo. Worker → Settings → Variables & Secrets → Add → type **Secret**:
   - `REMARKABLE_TOKEN_DAVID`: the whole contents of `%USERPROFILE%\.rmapi` on
     the computer where the tablet was registered. Open the file in Notepad,
     select all, copy, paste into the masked field, then clear the clipboard.
   - `GATEWAY_TOKEN`: a long random string, which is the temporary password the
     clients send until OAuth replaces it in step 4. This PowerShell line puts one
     on the clipboard without printing it:
     `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard`

     The verification client needs the same value later (see the timing test).
   - Instead of the dashboard, `npx wrangler secret put <NAME>` from
     `deploy/cloudflare` asks for the value at a masked prompt.
   - A changed secret applies the next time the container starts (after a sleep
     or a deploy), not to one already running.
6. **⚑ Approval: the first deploy.** This is the merge of `main` into `release`.
   Workers Builds builds the image and deploys the Worker at
   `https://remarkable-mcp.<account-subdomain>.workers.dev/mcp`.

## The timing test (build step 3, after the first deploy)

This test measures whether the container's sleep-and-wake is acceptable. It is
the number that decides whether phase 3 of the spec ever happens.

1. **Before the test**, `scripts/local/verify_cloud_mcp.py` needs two small
   changes on a `lab/*` branch. It must accept the gateway's URL (`--url`), and it
   must send `Authorization: Bearer` with the token read from an environment
   variable, never from the command line. Today it only talks to
   `http://127.0.0.1:8000/mcp`.
2. **Cold call:** leave the server idle for more than 10 minutes so the container
   sleeps. Then time one `remarkable_status` call through the gateway, from
   sending the request to receiving the answer.
3. **Warm call:** right after, time the same call again.
4. **Page render:** time `remarkable_image` on one notebook page and one PDF page.
5. **Logs:** the Worker logs one line per call (`mcp POST user=… status=… ms=…`) in
   the dashboard under Worker → Logs. Record the cold, warm and render times in a
   dated note in `docs/urban-forest/`, giving counts and timings only, with no
   document names.
6. If a long PDF runs out of memory on `basic`, change `instance_type` to
   `standard-1` in `wrangler.jsonc`. **⚑ Approval:** this costs more per running
   minute.

## Points that need the owner's yes, in order

1. ⚑ Merge this pull request into `main`.
2. ⚑ Which Cloudflare account.
3. ⚑ Create `release`, connect Workers Builds, enter the two secrets.
4. ⚑ First merge into `release`: the first deploy, followed by the timing test.
5. ⚑ Any change of instance type.
6. ⚑ OAuth (build step 4): the Entra app registration is the owner's click, plus
   a KV namespace, and a merge into `release`.
7. ⚑ Custom domain and the Claude and ChatGPT connectors (build step 5).

## Known limits to settle before relying on it

- **Uploading a file from a computer will not work through the hosted server.**
  `remarkable_upload(file_path, …)` reads a file on the server's own disk, which
  in the cloud is the container's, not the user's computer.
  `remarkable_markdown_to_pdf` works because the content travels inside the
  request. The spec's phase 1 success list includes "push". This needs a
  decision: accept Markdown-only pushes for now, or add an upload that takes the
  file's bytes. The second option is a server change that could go upstream.
- Cold-start length is unknown until the timing test.
- The image has not been built in Cloudflare's environment yet. GitHub Actions
  builds the same `Dockerfile` on every pull request, which catches most problems
  but not Cloudflare-specific ones.

## Working on these files

From `deploy/cloudflare`: `npm ci`, `npm run typecheck`, `npm test`. From the
repository root: `uv run ruff format .`, `uv run ruff check .`, `uv run pytest -v`.
Never run `wrangler deploy` by hand. Deploys happen only through Workers Builds
from `release`.
