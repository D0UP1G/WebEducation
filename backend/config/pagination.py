from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from config.responses import request_meta


class ContractPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "data": data,
                "meta": request_meta(
                    self.request,
                    page=self.page.number,
                    page_size=self.get_page_size(self.request),
                    total=self.page.paginator.count,
                ),
            }
        )

