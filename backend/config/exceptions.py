from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from config.responses import request_meta


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
    if response is None:
        return None

    request = context.get("request")
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
