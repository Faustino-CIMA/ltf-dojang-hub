import io
import json
import zipfile
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.test import SimpleTestCase, TestCase

from clubmgmt.addresses import lookup_luxembourg
from clubmgmt.caclr import house_number, parse_caclr_zip, refresh_luxembourg_register
from clubmgmt.models import LuxembourgRegisteredHouse, LuxembourgRegisteredStreet


def _line(width, parts):
    chars = [" "] * width
    for start, value in parts:
        for offset, char in enumerate(value):
            chars[start - 1 + offset] = char
    return "".join(chars)


def _sample_archive() -> bytes:
    locality = _line(120, [(1, "00001"), (6, "Musterstadt")])
    current = _line(
        170,
        [(1, "00001"), (6, "Rue des Lilas"), (132, "00001")],
    )
    extra = _line(
        170,
        [(1, "00002"), (6, "Rue des Pins"), (132, "00001")],
    )
    retired = _line(
        170,
        [(1, "00003"), (6, "Rue Ancienne"), (103, "01.01.2020"), (132, "00001")],
    )
    catalogue = "\n".join(
        [
            _line(205, [(121, "Musterstadt"), (161, "Rue des Lilas"), (201, "1000")]),
            _line(205, [(121, "Musterstadt"), (161, "Rue du Parc"), (201, "1000")]),
            _line(205, [(121, "Musterstadt"), (161, "Rue sans code"), (201, "    ")]),
        ]
    )
    buildings = "\n".join(
        [
            _line(57, [(9, "017"), (12, "B"), (39, "1000"), (50, "00001")]),
            _line(57, [(9, "002"), (39, "1000"), (50, "00001")]),
            _line(57, [(9, "000"), (39, "1000"), (50, "00001")]),
            _line(57, [(9, "099"), (18, "01.01.2020"), (39, "1000"), (50, "00001")]),
            _line(57, [(9, "004"), (39, "1000"), (50, "00002")]),
            _line(57, [(9, "008"), (39, "1000"), (50, "00003")]),
            _line(57, [(9, "003"), (39, "    "), (50, "00001")]),
        ]
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("LOCALITE", locality + "\n")
        archive.writestr("RUE", "\n".join([current, extra, retired]) + "\n")
        archive.writestr("TR.DICACOLO.RUCP", catalogue + "\n")
        archive.writestr("IMMEUBLE", buildings + "\n")
    return buffer.getvalue()


class CaclrParseTests(SimpleTestCase):
    def test_house_number_keeps_the_suffix_and_drops_an_unnumbered_building(self):
        self.assertEqual(house_number("017", "B"), "17B")
        self.assertEqual(house_number("002", "BIS"), "2BIS")
        self.assertEqual(house_number("000", ""), "")

    def test_parse_keeps_current_streets_and_suffixed_numbers(self):
        parsed = parse_caclr_zip(_sample_archive())

        self.assertEqual(
            parsed["streets"],
            [
                ("1000", "Musterstadt", "Rue des Lilas"),
                ("1000", "Musterstadt", "Rue des Pins"),
                ("1000", "Musterstadt", "Rue du Parc"),
            ],
        )
        self.assertEqual(
            parsed["houses"],
            [
                ("1000", "Musterstadt", "Rue des Lilas", "17B"),
                ("1000", "Musterstadt", "Rue des Lilas", "2"),
                ("1000", "Musterstadt", "Rue des Pins", "4"),
            ],
        )


class CaclrRefreshTests(TestCase):
    def test_refresh_replaces_the_cache_and_keeps_it_when_the_download_fails(self):
        response = MagicMock()
        response.read.side_effect = [_sample_archive(), b""]
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        with patch("clubmgmt.caclr.urllib.request.urlopen", return_value=response):
            stats = refresh_luxembourg_register()

        self.assertEqual(stats["streets"], 3)
        self.assertEqual(stats["houses"], 3)
        self.assertTrue(
            LuxembourgRegisteredHouse.objects.filter(postal_code="1000", house_number="17B").exists()
        )

        with patch("clubmgmt.caclr.urllib.request.urlopen", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                refresh_luxembourg_register()
        self.assertEqual(LuxembourgRegisteredStreet.objects.count(), 3)
        self.assertTrue(
            LuxembourgRegisteredHouse.objects.filter(house_number="17B").exists()
        )


class RegisterLookupTests(TestCase):
    def test_schedule_refreshes_the_register_monthly(self):
        entry = settings.CELERY_BEAT_SCHEDULE["refresh-luxembourg-address-register-monthly"]
        self.assertEqual(entry["task"], "clubmgmt.tasks.refresh_luxembourg_addresses")

    def test_empty_cache_falls_back_to_geoportail(self):
        response = MagicMock()
        response.read.return_value = json.dumps({"features": []}).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        with patch("clubmgmt.addresses.urllib.request.urlopen", return_value=response) as urlopen:
            result = lookup_luxembourg("1000")
        self.assertEqual(result["streets"], [])
        urlopen.assert_called_once()

    def test_loaded_register_returns_every_street_and_suffixed_number(self):
        rows = [
            ("1000", "Musterstadt", "Rue des Lilas", "17B"),
            ("1000", "Musterstadt", "Rue des Lilas", "10"),
            ("1000", "Musterstadt", "Rue des Lilas", "2"),
            ("1000", "Otherdorf", "Rue des Lilas", "4"),
            ("1000", "Musterstadt", "Rue du Parc", "1"),
        ]
        seen_streets = set()
        street_models = []
        for postal, locality, street, _number in rows:
            key = (postal, locality, street)
            if key in seen_streets:
                continue
            seen_streets.add(key)
            street_models.append(
                LuxembourgRegisteredStreet(postal_code=postal, locality=locality, street=street)
            )
        LuxembourgRegisteredStreet.objects.bulk_create(street_models)
        LuxembourgRegisteredHouse.objects.bulk_create(
            [
                LuxembourgRegisteredHouse(
                    postal_code=postal, locality=locality, street=street, house_number=number
                )
                for postal, locality, street, number in rows
            ]
        )

        with patch("clubmgmt.addresses.urllib.request.urlopen") as urlopen:
            result = lookup_luxembourg("1000")
            missing = lookup_luxembourg("2000")
            filtered = lookup_luxembourg("1000", "rue des lilas")
        urlopen.assert_not_called()

        self.assertEqual(result["localities"], ["Musterstadt", "Otherdorf"])
        self.assertEqual(result["streets"], ["Rue des Lilas", "Rue du Parc"])
        self.assertEqual(
            [(row["house_number"], row["street"]) for row in result["houses"]],
            [
                ("1", "Rue du Parc"),
                ("2", "Rue des Lilas"),
                ("4", "Rue des Lilas"),
                ("10", "Rue des Lilas"),
                ("17B", "Rue des Lilas"),
            ],
        )
        self.assertEqual(missing, {
            "postal_code": "2000",
            "localities": [],
            "streets": [],
            "street_rows": [],
            "houses": [],
        })
        self.assertEqual(filtered["streets"], ["Rue des Lilas", "Rue du Parc"])
        self.assertEqual(
            [row["house_number"] for row in filtered["houses"]],
            ["2", "4", "10", "17B"],
        )
