from django.test import Client, SimpleTestCase, override_settings

ROOT_SETTINGS = {
    "DEBUG": False,
    "SECURE_SSL_REDIRECT": False,
    "ALLOWED_HOSTS": ["testserver", "localhost"],
}


@override_settings(**ROOT_SETTINGS)
class RootAndNotFoundTests(SimpleTestCase):
    def setUp(self):
        self.client = Client(raise_request_exception=False)

    @override_settings(FRONTEND_BASE_URL="https://app.example.test/en")
    def test_root_redirects_to_the_frontend(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://app.example.test/en")

    @override_settings(FRONTEND_BASE_URL="")
    def test_root_returns_json_status_when_frontend_url_is_unset(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), {"status": "ok"})

    @override_settings(FRONTEND_BASE_URL="   ")
    def test_blank_frontend_url_is_treated_as_unset(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    @override_settings(FRONTEND_BASE_URL="javascript:alert(1)")
    def test_root_does_not_redirect_to_a_non_http_url(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    @override_settings(FRONTEND_BASE_URL="https://app.example.test")
    def test_unknown_page_shows_a_branded_link_to_the_frontend(self):
        response = self.client.get("/this-page-is-not-a-route")

        self.assertEqual(response.status_code, 404)
        self.assertIn("text/html", response["Content-Type"])
        body = response.content.decode()
        self.assertIn("Luxembourg Taekwondo Federation", body)
        self.assertIn('href="https://app.example.test"', body)
        self.assertIn("Open the LTF site", body)

    @override_settings(FRONTEND_BASE_URL="")
    def test_unknown_page_stays_branded_without_a_frontend_link(self):
        response = self.client.get("/this-page-is-not-a-route")

        self.assertEqual(response.status_code, 404)
        body = response.content.decode()
        self.assertIn("This page is not on the API.", body)
        self.assertNotIn("Open the LTF site", body)
        self.assertNotIn("href=", body)

    @override_settings(FRONTEND_BASE_URL="https://app.example.test")
    def test_unknown_api_path_stays_json(self):
        response = self.client.get("/api/this-route-is-not-defined/")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), {"detail": "Not found."})

    @override_settings(FRONTEND_BASE_URL="https://app.example.test")
    def test_existing_health_route_is_unchanged(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    @override_settings(FRONTEND_BASE_URL="https://app.example.test")
    def test_existing_favicon_route_is_unchanged(self):
        response = self.client.get("/favicon.ico")

        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/static/favicon.ico")
