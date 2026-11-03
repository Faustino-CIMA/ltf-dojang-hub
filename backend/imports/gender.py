"""Gender values accepted from a member CSV. Blank and unknown stay unresolved."""

_SEX = {
    "m": "M",
    "male": "M",
    "man": "M",
    "boy": "M",
    "h": "M",
    "herr": "M",
    "homme": "M",
    "mann": "M",
    "monsieur": "M",
    "masculin": "M",
    "garcon": "M",
    "mannlich": "M",
    "f": "F",
    "female": "F",
    "woman": "F",
    "girl": "F",
    "w": "F",
    "frau": "F",
    "femme": "F",
    "dame": "F",
    "madame": "F",
    "feminin": "F",
    "fille": "F",
    "madchen": "F",
    "weiblich": "F",
}


def parse_import_gender(value: str) -> str:
    key = str(value or "").strip().casefold()
    key = key.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("é", "e").replace("è", "e")
    key = key.replace(".", "")
    if not key:
        return ""
    return _SEX.get(key, "")
