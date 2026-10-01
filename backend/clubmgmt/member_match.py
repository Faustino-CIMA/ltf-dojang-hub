from __future__ import annotations

from members.models import Member

from .models import MemberContact, Person


def _clean(value: str) -> str:
    return " ".join(str(value or "").split())


def members_with_name(club_id: int, first_name: str, last_name: str, *, exclude_ids: list[int] | None = None) -> list[Member]:
    first = _clean(first_name)
    last = _clean(last_name)
    if not club_id or not first or not last:
        return []
    queryset = Member.objects.filter(club_id=club_id, first_name__iexact=first, last_name__iexact=last)
    if exclude_ids:
        queryset = queryset.exclude(pk__in=exclude_ids)
    return list(queryset.order_by("-is_active", "id"))


def member_match_payload(member: Member) -> dict:
    return {
        "id": member.id,
        "name": f"{member.first_name} {member.last_name}".strip(),
        "ltf_licenseid": member.ltf_licenseid or "",
        "is_active": member.is_active,
    }


def adopt_member(person: Person, member: Member) -> Person:
    """Point this person at an existing member, or reuse the person already linked to that member."""
    linked = Person.objects.filter(converted_member=member).exclude(pk=person.pk).first()
    if linked:
        return linked
    if person.converted_member_id != member.id:
        person.converted_member = member
        person.save(update_fields=["converted_member"])
    return person


def link_contact_to_named_member(contact: MemberContact) -> None:
    person = contact.person
    if person.converted_member_id or not person.club_id:
        return
    matches = members_with_name(person.club_id, person.first_name, person.last_name, exclude_ids=[contact.member_id])
    if len(matches) != 1:
        return
    chosen = adopt_member(person, matches[0])
    if chosen.id != person.id:
        contact.person = chosen
        contact.save(update_fields=["person"])
        if not MemberContact.objects.filter(person=person).exists():
            person.delete()
