from .desks import audit_read_only_export, bind_active_club, reset_active_club


class DeskExportAuditMiddleware:
    """Keep the active club on this request only, and audit read-only downloads."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = bind_active_club(None)
        try:
            response = self.get_response(request)
        finally:
            reset_active_club(token)
        if getattr(response, "status_code", None) == 200:
            audit_read_only_export(request)
        return response
