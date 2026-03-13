# ── Stage 1 : Build MkDocs documentation ───────────────────────────────────
FROM python:3.12-slim AS docs-builder
WORKDIR /tmp
RUN pip install --no-cache-dir mkdocs-material
COPY mkdocs.yml .
COPY docs/ docs/
RUN mkdocs build --site-dir /docs-site

# ── Stage 2 : Application principale ────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libmagic1 \
    poppler-utils \
    # WeasyPrint dependencies for PDF generation
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-bin \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt

# Copy application code
COPY . .

# Create directories for media and logs
RUN mkdir -p /app/media /app/logs

# Copier le site MkDocs depuis le builder (hors /app/ pour éviter le shadow du volume mount)
COPY --from=docs-builder /docs-site /docs-site

# Expose port
EXPOSE 3000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000", "--reload"]
