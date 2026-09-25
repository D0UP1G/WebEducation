FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /runner
COPY runner/ /runner/
CMD ["python", "server.py"]
