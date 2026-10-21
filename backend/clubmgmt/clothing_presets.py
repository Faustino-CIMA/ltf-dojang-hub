"""Size charts a club can apply, then edit.

Measurements are copied only when a source publishes a single centimetre.
A range, a missing cell, or a chart this catalog cannot store stays blank.
"""

# Youth and adult club tee. The source chart is in inches (chest width and
# garment length). Centimetres are round(inches * 2.54), half away from the
# .5 boundary these particular numbers never land on.
_THAI_YOUTH = (
    ("YXS", "1-2", 11, 15),
    ("YS", "3-4", 12, 16),
    ("YM", "5-6", 13, 17),
    ("YL", "7-8", 14, 18),
    ("YXL", "9-10", 15, 19),
    ("Y2XL", "11-12", 16, 20),
    ("Y3XL", "13-14", 17, 21),
)
_THAI_ADULT = (
    ("XXS", 17, 23.5),
    ("XS", 18, 24.5),
    ("S", 19, 25.5),
    ("M", 20, 26.5),
    ("L", 21, 27.5),
    ("XL", 22, 28.5),
    ("2XL", 23, 29.5),
    ("3XL", 24, 32.5),
    ("4XL", 25, 33.5),
    ("5XL", 26, 33.5),
    ("6XL", 27, 33.5),
    ("7XL", 28, 33.5),
    ("8XL", 29, 34.5),
    ("9XL", 30, 35.5),
    ("10XL", 31, 37.5),
)

# Jako kids body height, one range per size. No chest and no garment length.
# https://www.jako.com/de-de/service/faq/
# https://www.jako.com/de-de/faq-teamcreator/
# The dedicated page https://www.jako.com/de-de/service/groessentabelle/ points
# at the same chart. Adult unisex chest, waist, and hip are published as ranges
# (S 85–91 cm through 4XL 122–127 cm), not one centimetre, so those fields stay
# empty. Adult height is a single table header and the two Jako pages disagree
# (175–185 cm versus 166–191 cm), with no height per size, so it stays empty.
# Women's sizes 34–48 are a separate cut and are not this preset.
_JAKO_KIDS = (
    ("104", 99, 104),
    ("116", 111, 116),
    ("128", 123, 128),
    ("140", 135, 140),
    ("152", 147, 152),
    ("164", 159, 164),
)
_JAKO_ADULT = ("S", "M", "L", "XL", "XXL", "3XL", "4XL")
# Jacket availability (kids from 128, adults S–4XL), same measurements:
# https://www.jako.com/de-de/freizeitjacke-classico-p523/

# Hummel body measurements, not garment length. Länge of the shirt is not on
# the size guide, so length_cm stays empty. Waist, hip, and inside leg are
# published and unused: this catalog has no fields for them.
# https://hummelsport.de/pages/size-guide
# https://www.hummelsport.de/en/size-guide
# Kids jerseys use Kinderkleidung:
# https://hummelsport.de/products/udlp-25-26-home-jersey-s-s-kids
# Kids jackets use the same Kinderkleidung table, not a separate length chart:
# https://hummelsport.de/products/hmlauthentic-pl-zip-jacket-kids-black
# Unisex follows the men's standard table. Women's, plus-size, and Newline
# charts are separate and are not these presets. Baby sizes 86/92/98 are omitted.
_HUMMEL_KIDS = (
    ("104", "4", 104, 57),
    ("110", "5", 110, 59),
    ("116", "6", 116, 61),
    ("122", "7", 122, 64),
    ("128", "8", 128, 67),
    ("134", "9", 134, 70),
    ("140", "10", 140, 73),
    ("146", "11", 146, 76),
    ("152", "12", 152, 79),
    ("164", "14", 164, 83),
    ("176", "16", 176, 88),
)
_HUMMEL_MEN = (
    ("XXS", 172, 86),
    ("XS", 175, 90),
    ("S", 178, 94),
    ("M", 182, 99),
    ("L", 186, 104),
    ("XL", 190, 110),
    ("XXL", 194, 116),
    ("3XL", 194, 122),
    ("4XL", 194, 130),
    ("5XL", 194, 138),
)

_GENERIC = ("98", "104", "110", "116", "128", "140", "152", "164", "XS", "S", "M", "L", "XL", "2XL", "3XL")


def _size(label, *, age="", chest=None, length=None, height_min=None, height_max=None):
    return {
        "label": label,
        "age": age,
        "chest_cm": chest,
        "length_cm": length,
        "height_min_cm": height_min,
        "height_max_cm": height_max,
    }


def _cm(inches):
    return round(inches * 2.54)


def _thai():
    sizes = [
        _size(label, age=age, chest=_cm(chest), length=_cm(length))
        for label, age, chest, length in _THAI_YOUTH
    ]
    sizes.extend(
        _size(label, chest=_cm(chest), length=_cm(length))
        for label, chest, length in _THAI_ADULT
    )
    return sizes


def _jako(kids):
    sizes = [_size(label, height_min=low, height_max=high) for label, low, high in kids]
    sizes.extend(_size(label) for label in _JAKO_ADULT)
    return sizes


def _hummel():
    sizes = [
        _size(label, age=age, chest=chest, height_min=height, height_max=height)
        for label, age, height, chest in _HUMMEL_KIDS
    ]
    sizes.extend(
        _size(label, chest=chest, height_min=height, height_max=height)
        for label, height, chest in _HUMMEL_MEN
    )
    return sizes


def _labels(labels):
    return [_size(label) for label in labels]


PRESETS = (
    {"id": "thai_club_tee", "sizes": _thai()},
    {"id": "generic_tee", "sizes": _labels(_GENERIC)},
    {
        "id": "dobok_height",
        "sizes": [_size(str(cm), height_min=cm, height_max=cm) for cm in range(100, 211, 10)],
    },
    {"id": "jako_shirt", "sizes": _jako(_JAKO_KIDS)},
    {"id": "jako_jacket", "sizes": _jako(_JAKO_KIDS[2:])},
    {"id": "hummel_shirt", "sizes": _hummel()},
    {"id": "hummel_jacket", "sizes": _hummel()},
)

PRESET_BY_ID = {preset["id"]: preset for preset in PRESETS}

DEFAULT_ITEMS = (
    ("Dobok", "dobok_height"),
    ("T-shirt", "generic_tee"),
)
