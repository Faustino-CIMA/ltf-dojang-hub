from urllib.parse import urlencode, urlsplit, urlunsplit

from allauth.account.adapter import DefaultAccountAdapter
from django.conf import settings
from django.template.loader import render_to_string


class CustomAccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return False

    def post_login(self, request, user, **kwargs):
        # The API builds its own response. The headless JSON body needs a
        # session context we do not open for every confirm step.
        return None

    def get_email_confirmation_url(self, request, emailconfirmation):
        locale = self._get_locale(request)
        base_url = settings.FRONTEND_BASE_URL.rstrip("/")
        key = emailconfirmation.key
        path = f"/{locale}/verify-email"
        query = urlencode({"key": key, "locale": locale})
        return f"{base_url}{path}?{query}"

    def _get_locale(self, request):
        if request is None:
            return settings.FRONTEND_DEFAULT_LOCALE

        locale = getattr(request, "confirmation_locale", None)
        if not locale:
            locale = request.GET.get("locale")
        if not locale:
            locale = getattr(request, "LANGUAGE_CODE", None)

        return locale or settings.FRONTEND_DEFAULT_LOCALE

    def send_confirmation_mail(self, request, emailconfirmation, signup):
        from accounts.email_utils import send_resend_email
        from clubs.document_copy import email_copy, resolve_document_language

        language = resolve_document_language(explicit=self._get_locale(request))
        copy = email_copy("confirm", language)
        context = {
            "copy": copy,
            "user": emailconfirmation.email_address.user,
            "activate_url": self.get_email_confirmation_url(request, emailconfirmation),
        }
        html = render_to_string("account/email/email_confirmation_message.html", context)
        text = render_to_string("account/email/email_confirmation_message.txt", context)
        send_resend_email(emailconfirmation.email_address.email, copy["subject"], html, text)
