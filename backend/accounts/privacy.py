"""Private address cleanup shared by self-delete and every other user delete."""


def clear_private_addresses_for_user(user) -> None:
    """Remove this person's own addresses. Guardian and other-user addresses stay."""
    from clubmgmt.models import MemberAddress, PersonAddress
    from members.models import Member

    members = list(Member.all_objects.filter(user=user))
    if not members:
        return
    MemberAddress.objects.filter(member__in=members).delete()
    # Person has no user column. The only link is the member this person was converted into.
    PersonAddress.objects.filter(person__converted_member__in=members).delete()
