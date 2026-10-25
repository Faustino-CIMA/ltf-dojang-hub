import re
import unicodedata


def normalize_club_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+a s b l$", "", text)
    text = re.sub(r"\s+asbl$", "", text)
    return text.strip()


def is_ltf_name(value: str) -> bool:
    return normalize_club_name(value) == "ltf"


def is_near_ltf_name(value: str) -> bool:
    key = normalize_club_name(value)
    if not key or key == "ltf":
        return False
    return "luxembourg" in key and ("taekwondo" in key or "taekwon" in key)
