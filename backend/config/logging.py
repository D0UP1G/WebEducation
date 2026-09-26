"""Logging helpers shared by request middleware and Django's log handlers."""

from contextvars import ContextVar
import logging


_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def set_request_id(value: str):
    """Bind an id to logs emitted while one HTTP request is being handled."""
    return _request_id.set(value)


def reset_request_id(token) -> None:
    _request_id.reset(token)


class RequestIdFilter(logging.Filter):
    """Add the current request id without requiring every log call to know it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True
