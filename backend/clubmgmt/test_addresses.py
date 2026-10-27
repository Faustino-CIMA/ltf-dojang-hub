import json
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from clubmgmt.addresses import _parse_label, lookup_luxembourg


class AddressLabelTests(SimpleTestCase):
    def test_splits_a_label_on_its_own_postcode(self):
        parsed = _parse_label("10, Rue des Roses, L-2445 Luxembourg", "2449")

        self.assertEqual(parsed["house_number"], "10")
        self.assertEqual(parsed["street"], "Rue des Roses")
        self.assertEqual(parsed["locality"], "Luxembourg")
        self.assertEqual(parsed["postal_code"], "2445")

    def test_lookup_streets_are_not_the_whole_label(self):
        payload = {
            "features": [
                {
                    "properties": {
                        "label": "10, Rue des Roses, L-2445 Luxembourg",
                        "layer_name": "Adresse",
                    }
                }
            ]
        }
        response = MagicMock()
        response.read.return_value = json.dumps(payload).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        with patch("clubmgmt.addresses.urllib.request.urlopen", return_value=response) as urlopen:
            result = lookup_luxembourg("2449")

        self.assertEqual(result["streets"], ["Rue des Roses"])
        self.assertEqual(result["houses"][0]["street"], "Rue des Roses")
        self.assertEqual(result["houses"][0]["house_number"], "10")
        self.assertEqual(result["houses"][0]["postal_code"], "2445")
        self.assertEqual(result["houses"][0]["locality"], "Luxembourg")
        requested = urlopen.call_args.args[0]
        self.assertIn("limit=200", requested.full_url)

    def test_keeps_a_letter_suffix_past_the_old_result_cap(self):
        features = []
        for number in range(1, 66):
            features.append(
                {
                    "properties": {
                        "label": f"{number}, Rue des Lilas, L-1000 Luxembourg",
                        "layer_name": "Adresse",
                    }
                }
            )
        features.append(
            {
                "properties": {
                    "label": "17B, Rue des Lilas, L-1000 Luxembourg",
                    "layer_name": "Adresse",
                }
            }
        )
        response = MagicMock()
        response.read.return_value = json.dumps({"features": features}).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        with patch("clubmgmt.addresses.urllib.request.urlopen", return_value=response):
            result = lookup_luxembourg("1000", "Rue des Lilas")

        numbers = [row["house_number"] for row in result["houses"]]
        self.assertIn("17B", numbers)
        self.assertEqual(len(numbers), 66)
        self.assertEqual(_parse_label("17bis, Rue des Lilas, L-1000 Luxembourg")["house_number"], "17bis")
