FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
# The curriculum importer validates the generated map against its canonical
# organizer DOCX at runtime (seed_demo/import_curriculum), so include both
# source artifacts in the backend image. The brandbook is not needed at runtime.
RUN mkdir -p /app/docs/organizer
COPY docs/organizer/curriculum-map.json /app/docs/organizer/curriculum-map.json
COPY docs/organizer/basic-curriculum.docx /app/docs/organizer/basic-curriculum.docx
WORKDIR /app/backend

RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 8000

CMD ["/app/backend/entrypoint.sh"]
