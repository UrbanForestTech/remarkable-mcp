# remarkable-mcp for a Cloudflare Container (cloud transport only).
# Built by Cloudflare Workers Builds from the repository root (see wrangler.jsonc,
# image_build_context "../.."), so paths below are relative to the repo root.
# Cloudflare Containers run linux/amd64 images only.
FROM --platform=linux/amd64 python:3.12-slim

# Tesseract for the OCR backend the local cloud launcher uses.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

# Dependencies first, from the lock file, so code changes reuse this layer.
COPY pyproject.toml uv.lock README.md LICENSE ./
RUN uv sync --frozen --no-dev --no-install-project

COPY remarkable_mcp ./remarkable_mcp
RUN uv sync --frozen --no-dev
COPY deploy/cloudflare/serve.py ./serve.py

RUN useradd --create-home --uid 10001 app
USER app

# Same settings as scripts/local/Start-RemarkableCloud.ps1: cloud transport only
# (USB, SSH and local-dir off, no fallback), library changes on, delete
# confirmations kept, Tesseract OCR, a scratch cache. REMARKABLE_TOKEN is not
# set here: the gateway Worker passes it in when it starts the container.
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    REMARKABLE_USE_USB_WEB=0 \
    REMARKABLE_USE_SSH=0 \
    REMARKABLE_USE_LOCAL_DIR=0 \
    REMARKABLE_DISABLE_CLOUD_FALLBACK=1 \
    REMARKABLE_READ_ONLY=0 \
    REMARKABLE_SKIP_CONFIRM=0 \
    REMARKABLE_OCR_BACKEND=tesseract \
    REMARKABLE_CACHE_DIR=/tmp/remarkable-cache \
    REMARKABLE_MCP_PORT=8000 \
    REMARKABLE_GATEWAY_HOST=container

EXPOSE 8000
CMD ["python", "serve.py"]
