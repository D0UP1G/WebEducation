#!/bin/sh
set -eu

if [ "${DJANGO_DEBUG:-0}" != "1" ]; then
  case "${DJANGO_SECRET_KEY:-}" in
    ""|"unsafe-development-key"|"change-me-for-local-development")
      echo "Refusing to start production backend with a missing or example DJANGO_SECRET_KEY" >&2
      exit 1
      ;;
  esac
fi

if [ "${WEBEDUCATION_PUBLIC_MODE:-0}" = "1" ]; then
  python -m config.production
fi

python manage.py migrate --noinput
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers "${GUNICORN_WORKERS:-2}" --timeout 60
