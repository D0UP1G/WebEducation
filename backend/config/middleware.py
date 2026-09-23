import logging
import re
import time
import uuid

from config.logging import reset_request_id, set_request_id


request_logger = logging.getLogger("webeducation.request")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$")


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied_id = request.headers.get("X-Request-ID", "")
        request.request_id = supplied_id if _REQUEST_ID_RE.fullmatch(supplied_id) else str(uuid.uuid4())
        token = set_request_id(request.request_id)
        started_at = time.monotonic()
        response = None
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request.request_id
            return response
        finally:
            duration_ms = round((time.monotonic() - started_at) * 1000)
            request_logger.info(
                "request_completed method=%s path=%s status=%s duration_ms=%s",
                request.method,
                request.path,
                getattr(response, "status_code", 500),
                duration_ms,
            )
            reset_request_id(token)
