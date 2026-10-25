import re

# "Taekwon-Do" with a space or a dash. "Taekwondo" (one word) stays WT.
_ITF_NAME = re.compile(r"taekwon[\s\-–—]+do", re.IGNORECASE)


def infer_club_federation(name: str) -> str:
    if _ITF_NAME.search(str(name or "")):
        return "ITF"
    return "WT"
