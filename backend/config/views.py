from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from config.responses import data_response


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return data_response(request, {"status": "ok"})

