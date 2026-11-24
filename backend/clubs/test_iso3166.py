from django.test import TestCase

from clubs.iso3166 import ISO_3166_1_ALPHA_2, country_name, country_name_en, normalize_country_code


class Iso3166Tests(TestCase):
    def test_the_code_list_is_the_official_alpha_2_set(self):
        self.assertEqual(len(ISO_3166_1_ALPHA_2), 249)
        self.assertIn("LU", ISO_3166_1_ALPHA_2)
        self.assertIn("TH", ISO_3166_1_ALPHA_2)
        self.assertIn("AQ", ISO_3166_1_ALPHA_2)
        self.assertTrue(all(len(code) == 2 and code.isalpha() and code.isupper() for code in ISO_3166_1_ALPHA_2))

    def test_known_names_become_codes_and_unknown_text_stays(self):
        self.assertEqual(normalize_country_code(" Luxembourg "), "LU")
        self.assertEqual(normalize_country_code("Allemagne"), "DE")
        self.assertEqual(normalize_country_code("Thailand"), "TH")
        self.assertEqual(normalize_country_code("de"), "DE")
        self.assertEqual(normalize_country_code("Narnia"), "Narnia")
        self.assertEqual(normalize_country_code(""), "")
        self.assertEqual(country_name_en("DE"), "Germany")
        self.assertEqual(country_name_en("Narnia"), "Narnia")
        self.assertEqual(country_name("LU", "de"), "Luxemburg")
        self.assertEqual(country_name("LU", "lb"), "Lëtzebuerg")
        self.assertEqual(country_name("DE", "fr"), "Allemagne")
