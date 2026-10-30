from .desks import (
    audit_read_only_export,
    bind_active_club,
    bind_active_desk,
    reset_active_club,
    reset_active_desk,
)


class DeskExportAuditMiddleware:
    """Keep the active club on this request only, and audit read-only downloads."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        club_token = bind_active_club(None)
        desk_token = bind_active_desk(None)
        try:
            response = self.get_response(request)
        finally:
            reset_active_club(club_token)
            reset_active_desk(desk_token)
        if getattr(response, "status_code", None) == 200:
            audit_read_only_export(request)
        return response
