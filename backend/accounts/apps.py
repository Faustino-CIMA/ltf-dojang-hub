from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        from rest_framework.views import APIView

        from .desks import bind_request_desk
        from . import signals  # noqa: F401

        original = APIView.perform_authentication

        def perform_authentication(view, request):
            original(view, request)
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                bind_request_desk(request, user)

        if not getattr(APIView.perform_authentication, "_desk_bound_hook", False):
            perform_authentication._desk_bound_hook = True
            APIView.perform_authentication = perform_authentication
