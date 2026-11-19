from decimal import Decimal

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from .weights import normalize_kg


class NormalizeKgTests(SimpleTestCase):
    def _weight(self, value, *, keep=None):
        return normalize_kg(
            value,
            field="weight_kg",
            code="weight_out_of_range",
            minimum=Decimal("10"),
            maximum=Decimal("150"),
            keep=keep,
        )

    def test_typed_values_round_to_two_decimals(self):
        self.assertEqual(self._weight("44"), Decimal("44.00"))
        self.assertEqual(self._weight("44.0"), Decimal("44.00"))
        self.assertEqual(self._weight("44.00"), Decimal("44.00"))
        self.assertEqual(self._weight("44,5"), Decimal("44.50"))
        self.assertEqual(self._weight("44.555"), Decimal("44.56"))
        self.assertEqual(self._weight("150"), Decimal("150.00"))

    def test_a_new_weight_above_150_or_a_word_is_refused(self):
        for value in ("150.01", "151", "heavy"):
            with self.assertRaises(ValidationError):
                self._weight(value)

    def test_a_stored_weight_above_150_can_be_kept(self):
        stored = Decimal("160.00")
        self.assertEqual(self._weight("160.00", keep=stored), stored)
        self.assertEqual(self._weight("149.5", keep=stored), Decimal("149.50"))
        with self.assertRaises(ValidationError):
            self._weight("151", keep=stored)
