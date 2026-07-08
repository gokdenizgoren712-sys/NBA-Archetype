# NBA Archetype — Railway/Docker deploy
# Python backend (FastAPI) + derlenmiş Vite frontend'i tek imajda serve eder.

# ── Stage 1: frontend build (Node) ──
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Vite build-time değişkenleri: Railway service variable'ları ARG olarak gelir,
# ENV yapıp `npm run build`'e sunuyoruz (yoksa bundle'a gömülmez → özellik ölü).
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_CLOUDINARY_CLOUD_NAME=""
ARG VITE_CLOUDINARY_UPLOAD_PRESET=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET
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
# PORT'u Python kendisi okur (api/main.py __main__) — shell/exec form, $PORT
# genişlemesi derdi yok. Railway PORT'u runtime'da enjekte eder; yoksa 8000.
CMD ["python", "-m", "api.main"]
