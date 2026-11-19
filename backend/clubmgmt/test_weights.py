from decimal import Decimal

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from .weights import normalize_kg


class NormalizeKgTests(SimpleTestCase):
    def _weight(self, value):
        return normalize_kg(
            value,
            field="weight_kg",
            code="weight_out_of_range",
            minimum=Decimal("10"),
            maximum=Decimal("250"),
        )

    def test_one_decimal_forms_all_store_the_same_value(self):
        self.assertEqual(self._weight("44"), Decimal("44.0"))
        self.assertEqual(self._weight("44.0"), Decimal("44.0"))
        self.assertEqual(self._weight("44.00"), Decimal("44.0"))
        self.assertEqual(self._weight("44,00"), Decimal("44.0"))
        self.assertEqual(self._weight("44,5"), Decimal("44.5"))
        self.assertEqual(self._weight("44.05"), Decimal("44.1"))

    def test_a_word_is_refused(self):
        with self.assertRaises(ValidationError) as caught:
            self._weight("heavy")
        self.assertEqual(caught.exception.detail["weight_kg"], "weight_out_of_range")
