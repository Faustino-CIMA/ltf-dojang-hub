from urllib.parse import urlparse

from django.conf import settings
from django.http import HttpResponseRedirect, JsonResponse
from django.shortcuts import render


def frontend_base_url() -> str:
    """Absolute http(s) frontend origin from settings, or an empty string."""
    raw = str(getattr(settings, "FRONTEND_BASE_URL", "") or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return raw


def root_entry(request):
    target = frontend_base_url()
    if not target:
        return JsonResponse({"status": "ok"})
    return HttpResponseRedirect(target)


def _is_api_path(path: str) -> bool:
    normalized = path or "/"
    return normalized == "/api" or normalized.startswith("/api/")


def not_found(request, exception):
    if _is_api_path(request.path):
        return JsonResponse({"detail": "Not found."}, status=404)
    return render(
        request,
        "not_found.html",
        {"frontend_url": frontend_base_url()},
        status=404,
    )
