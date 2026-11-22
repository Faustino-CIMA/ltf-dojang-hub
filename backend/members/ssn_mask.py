"""A hidden social security number is one fixed mask.

A Luxembourg number is the birth date plus five digits. Showing the last
digits, or a mask whose length follows the stored value, gives most of it
away. The mask is the same for every country and every length.
"""

MASKED_SOCIAL_SECURITY_NUMBER = "•" * 13


def mask_social_security_number(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return MASKED_SOCIAL_SECURITY_NUMBER


def is_masked_social_security_number(value: str) -> bool:
    text = str(value or "").strip()
    return bool(text) and set(text) <= {"•"}
