from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase


class PasswordResetGenerationMigrationTests(TestCase):
    def test_fake_row_survives_migrating_the_column_twice(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0010_seed_office_map")])
        executor.loader.build_graph()
        historical = executor.loader.project_state([("accounts", "0010_seed_office_map")]).apps
        User = historical.get_model("accounts", "User")
        User.objects.create(
            username="fake-reset-gen",
            password="not-a-password",
            email="fake-reset-gen@example.test",
            first_name="Fake",
            last_name="Row",
        )

        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0011_user_password_reset_generation")])
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0011_user_password_reset_generation")])

        executor.loader.build_graph()
        current = executor.loader.project_state([("accounts", "0011_user_password_reset_generation")]).apps
        User = current.get_model("accounts", "User")
        row = User.objects.get(username="fake-reset-gen")
        self.assertEqual(row.password_reset_generation, 0)
        self.assertEqual(row.first_name, "Fake")
        self.assertEqual(row.last_name, "Row")
        row.delete()
