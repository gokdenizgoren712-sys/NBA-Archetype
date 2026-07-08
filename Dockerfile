# NBA Archetype — Railway/Docker deploy
# Python backend (FastAPI) + derlenmiş Vite frontend'i tek imajda serve eder.

# ── Stage 1: frontend build (Node) ──
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ──
FROM python:3.11-slim
WORKDIR /app

# Python bağımlılıkları (önce requirements → katman cache)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodu + committed veri (read-only parquet'ler)
COPY api/ ./api/
COPY src/ ./src/
COPY config/ ./config/
COPY data/ ./data/

# Stage 1'den derlenmiş frontend (main.py ROOT/frontend/dist'ten serve eder)
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PORT=8000
EXPOSE 8000
# Railway $PORT sağlar; yoksa 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
