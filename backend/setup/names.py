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


def loose_club_key(value: str) -> str:
    """Treat Taekwon-Do and Taekwondo as the same spelling.

    An exact normalized name still wins. This key is only a fallback when one
    club is left, so a WT club and an ITF club are not merged silently.
    """
    return normalize_club_name(value).replace("taekwon do", "taekwondo")
