from .desks import audit_read_only_export


class DeskExportAuditMiddleware:
    """Audit a file download made while a read-only desk is active."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if getattr(response, "status_code", None) == 200:
            audit_read_only_export(request)
        return response
