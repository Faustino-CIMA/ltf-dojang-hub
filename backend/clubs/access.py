def user_can_edit_club(user, club) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    role = getattr(user, "role", None)
    if role in {"ltf_admin", "ltf_finance"}:
        return True
    if role == "club_admin" and club.admins.filter(id=user.id).exists():
        return True
    return False
