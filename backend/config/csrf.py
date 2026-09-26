from django.http import JsonResponse


def csrf_failure(request, reason=""):
    return JsonResponse(
        {
            "error": {"code": "csrf_failed", "message": "CSRF-токен отсутствует или недействителен"},
            "meta": {"request_id": getattr(request, "request_id", None)},
        },
        status=403,
    )
