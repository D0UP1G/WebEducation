"""Fail-closed checks for the public HTTPS Compose profile."""

import os
import sys
from urllib.parse import unquote, urlparse


def validate_public_environment(env):
    errors = []
    key = env.get("DJANGO_SECRET_KEY", "")
    if len(key) < 50 or len(set(key)) < 10 or key in {"unsafe-development-key", "change-me-for-local-development"}:
        errors.append("DJANGO_SECRET_KEY must be a unique random value of at least 50 characters")
    if env.get("DJANGO_DEBUG") != "0" or env.get("DJANGO_SECURE_COOKIES") != "1":
        errors.append("public mode requires DJANGO_DEBUG=0 and DJANGO_SECURE_COOKIES=1")

    hosts = [item.strip().lower() for item in env.get("DJANGO_ALLOWED_HOSTS", "").split(",") if item.strip()]
    if not hosts or any(host in {"localhost", "127.0.0.1", "0.0.0.0", "*", "example.com", "example.org", "example.net"}
                        or "*" in host or host.endswith((".example.com", ".example.org", ".example.net", ".local"))
                        for host in hosts):
        errors.append("DJANGO_ALLOWED_HOSTS must list public hostnames without wildcards or localhost")
    origins = [item.strip() for item in env.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if item.strip()]
    try:
        origins_valid = bool(origins) and all(
            urlparse(origin).scheme == "https" and urlparse(origin).hostname in hosts for origin in origins
        )
    except ValueError:
        origins_valid = False
    if not origins_valid:
        errors.append("DJANGO_CSRF_TRUSTED_ORIGINS must use HTTPS and a configured public hostname")

    try:
        database = urlparse(env.get("DATABASE_URL", ""))
        password = unquote(database.password or "")
        database_scheme = database.scheme
    except ValueError:
        password = ""
        database_scheme = ""
    expected_password = env.get("POSTGRES_PASSWORD", "")
    if database_scheme not in {"postgres", "postgresql"} or not password or password == "webeducation" \
            or expected_password != password:
        errors.append("DATABASE_URL and POSTGRES_PASSWORD must use the same non-default password")
    return errors


if __name__ == "__main__":
    problems = validate_public_environment(os.environ)
    for problem in problems:
        print(problem, file=sys.stderr)
    sys.exit(bool(problems))
