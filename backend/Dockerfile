FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
# Runtime imports use the curated map. The original DOCX is only checked in the
# repository/CI preflight and does not need to ship in the backend image.
RUN mkdir -p /app/docs/organizer
COPY docs/organizer/curriculum-map.json /app/docs/organizer/curriculum-map.json
WORKDIR /app/backend

RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 8000

CMD ["/app/backend/entrypoint.sh"]
