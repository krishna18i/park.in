# Park.in as a single image: the React bundle is built, then handed to the
# FastAPI process that serves it alongside the API. One container, one origin,
# one URL -- so there is no CORS to configure and no API host baked into the
# bundle at build time.

# ---- 1. build the web app --------------------------------------------------
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# VITE_API_URL is deliberately unset: the bundle then addresses its own origin,
# which is exactly where the API answers in the image below.
RUN npm run build

# ---- 2. the API, which also serves that build ------------------------------
FROM python:3.13-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend/dist \
    PORT=8000

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=web /web/dist frontend/dist

# SQLite is written next to the package, so the app user has to own it.
RUN useradd --create-home --uid 10001 parkin && chown -R parkin:parkin /app
USER parkin

WORKDIR /app/backend
EXPOSE 8000

# $PORT is assigned by the host (Render sets it); 8000 is the local default.
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
