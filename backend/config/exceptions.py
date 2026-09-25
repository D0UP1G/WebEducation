import logging

from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from config.responses import request_meta


request_logger = logging.getLogger("webeducation.request")


class StateConflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Состояние ресурса изменилось; обновите страницу"
    default_code = "state_conflict"


class FileTooLarge(exceptions.APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "Файл слишком большой. Проверьте ограничение размера для этого задания."
    default_code = "file_too_large"


def _field_errors(detail):
    if not isinstance(detail, dict):
        return None
    return {key: [str(value) for value in values] if isinstance(values, list) else [str(values)] for key, values in detail.items()}


def contract_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request")

    # DRF normally lets unexpected exceptions fall through to Django's HTML 500
    # page. The frontend expects the API error envelope, so preserve that
    # contract and log the traceback with the request id for diagnosis.
    if response is None:
        request_logger.error(
            "api_unhandled_exception path=%s",
            getattr(request, "path", ""),
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return Response(
            {
                "error": {"code": "internal_error", "message": "Внутренняя ошибка сервера"},
                "meta": request_meta(request),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    code = "request_error"
    message = "Не удалось выполнить запрос"
    fields = None

    if isinstance(exc, FileTooLarge):
        code, message = "file_too_large", str(exc.detail)
    elif isinstance(exc, exceptions.ValidationError):
        code, message, fields = "validation_error", "Проверьте данные формы", _field_errors(exc.detail)
    elif isinstance(exc, exceptions.NotAuthenticated):
        code, message = "not_authenticated", "Требуется вход"
    elif isinstance(exc, exceptions.PermissionDenied):
        code, message = "permission_denied", "Недостаточно прав"
    elif isinstance(exc, (exceptions.NotFound, Http404)):
        code, message = "not_found", "Ресурс не найден"
    elif isinstance(exc, exceptions.MethodNotAllowed):
        code, message = "method_not_allowed", "Метод не поддерживается"
    elif isinstance(exc, exceptions.Throttled):
        code, message = "rate_limited", "Слишком много запросов"
    elif response.status_code == status.HTTP_409_CONFLICT:
        code, message = "state_conflict", str(exc.detail)
    elif isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])

    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    response.data = {"error": error, "meta": request_meta(request)}
    return response
