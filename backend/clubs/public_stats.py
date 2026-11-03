"""Public counts for the marketing home. Three integers, nothing else."""

from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_control
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from licenses.models import License
from members.models import Member

from .models import Club

PUBLIC_STATS_CACHE_KEY = "public:stats:v1"
PUBLIC_STATS_TTL_SECONDS = 60


def public_stats_payload() -> dict[str, int]:
    return {
        "clubs": Club.objects.filter(is_active=True).count(),
        "members": Member.objects.filter(is_active=True, club__isnull=False).count(),
        "licences": License.objects.filter(status=License.Status.ACTIVE).count(),
    }


@method_decorator(cache_control(public=True, max_age=PUBLIC_STATS_TTL_SECONDS), name="get")
class PublicStatsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        payload = cache.get(PUBLIC_STATS_CACHE_KEY)
        if payload is None:
            payload = public_stats_payload()
            cache.set(PUBLIC_STATS_CACHE_KEY, payload, timeout=PUBLIC_STATS_TTL_SECONDS)
        return Response(payload)
