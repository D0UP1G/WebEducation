from rest_framework.response import Response


def request_meta(request, **extra):
    return {"request_id": getattr(request, "request_id", None), **extra}


def data_response(request, data, *, status=200, meta=None):
    return Response({"data": data, "meta": request_meta(request, **(meta or {}))}, status=status)

