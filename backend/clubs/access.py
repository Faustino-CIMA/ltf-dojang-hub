def user_can_edit_club(user, club) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    from accounts.desks import current_active_club, holds_desk

    active = current_active_club()
    if active is not None and getattr(club, "id", None) != active:
        return False
    if getattr(user, "is_superuser", False):
        return True
    if holds_desk(user, "ltf_admin") or holds_desk(user, "ltf_finance"):
        return True
    role = getattr(user, "role", None)
    if role == "club_admin" and club.admins.filter(id=user.id).exists():
        return True
    return False
