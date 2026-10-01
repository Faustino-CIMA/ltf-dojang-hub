"""Parents and legal guardians used as family invoice contacts."""

from __future__ import annotations

from datetime import date

from django.db import transaction
from rest_framework.exceptions import ValidationError

from members.models import Member

from .member_match import adopt_member, member_match_payload, members_with_name
from .models import (
    Family,
    MemberAddress,
    MemberContact,
    MemberEmail,
    MemberPhone,
    Person,
    PersonAddress,
    PersonEmail,
    PersonPhone,
)

PARENT_RELATIONS = {
    MemberContact.Relation.FATHER,
    MemberContact.Relation.MOTHER,
    MemberContact.Relation.GRANDFATHER,
    MemberContact.Relation.GRANDMOTHER,
    MemberContact.Relation.GUARDIAN,
}

FEMALE_RELATIONS = {
    MemberContact.Relation.MOTHER,
    MemberContact.Relation.GRANDMOTHER,
    MemberContact.Relation.AUNT,
    MemberContact.Relation.SISTER,
}


class GuardianMatches(Exception):
    def __init__(self, matches: list[dict]):
        self.matches = matches


def is_underage_member(member, today: date | None = None) -> bool:
    dob = getattr(member, "date_of_birth", None)
    if not dob:
        return False
    today = today or date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return years < 18


def ordered_memberships(family: Family):
    links = list(family.memberships.all())
    links.sort(key=lambda link: (link.sort_order, link.id))
    return links


def family_members_are_all_minors(members) -> bool:
    return bool(members) and all(is_underage_member(link.member) for link in members)


def needs_explicit_recipient(family: Family, members) -> bool:
    if family.invoice_member_id or family.bill_to_person_id:
        return False
    return family_members_are_all_minors(members)


def resolve_ledger_member(family: Family, members):
    if family.bill_to_person_id:
        return members[0].member
    if family.invoice_member_id and family.invoice_member is not None:
        return family.invoice_member
    for link in members:
        if not is_underage_member(link.member):
            return link.member
    return members[0].member


def sex_for_relation(relation: str) -> str:
    if relation in FEMALE_RELATIONS:
        return Person.Sex.FEMALE
    return Person.Sex.MALE


def remember_person_invoice_details(person: Person, *, email: str, phone: str, address: dict) -> None:
    email = str(email or "").strip()
    phone = str(phone or "").strip()
    if email:
        person.emails.exclude(email__iexact=email).update(use_for_invoice=False)
        row = person.emails.filter(email__iexact=email).first()
        if row is None:
            PersonEmail.objects.create(person=person, email=email, use_for_invoice=True)
        elif not row.use_for_invoice:
            row.use_for_invoice = True
            row.save(update_fields=["use_for_invoice"])
    if phone and not person.phones.filter(number=phone).exists():
        PersonPhone.objects.create(person=person, number=phone, label="mobile")
    if not any(str(address.get(key) or "").strip() for key in ("street", "house_number", "postal_code", "locality")):
        return
    fields = {
        "street": str(address.get("street") or "").strip(),
        "house_number": str(address.get("house_number") or "").strip(),
        "line2": str(address.get("line2") or "").strip(),
        "postal_code": str(address.get("postal_code") or "").strip(),
        "locality": str(address.get("locality") or "").strip(),
        "country": str(address.get("country") or "").strip() or "Luxembourg",
    }
    current = person.addresses.filter(use_for_invoice=True).first() or person.addresses.first()
    if current is None:
        PersonAddress.objects.create(person=person, use_for_invoice=True, **fields)
        return
    for key, value in fields.items():
        setattr(current, key, value)
    current.use_for_invoice = True
    current.save()


def remember_member_invoice_details(member: Member, *, email: str, phone: str, address: dict, replace: bool) -> None:
    email = str(email or "").strip()
    phone = str(phone or "").strip()
    if email:
        flagged = member.club_emails.filter(use_for_invoice=True).first()
        if flagged is not None and replace:
            flagged.email = email
            flagged.save(update_fields=["email"])
        elif flagged is None:
            existing = member.club_emails.filter(email__iexact=email).first()
            if existing is None:
                MemberEmail.objects.create(member=member, email=email, use_for_invoice=True)
            elif not existing.use_for_invoice:
                existing.use_for_invoice = True
                existing.save(update_fields=["use_for_invoice"])
    if phone and (replace or not member.club_phones.exists()) and not member.club_phones.filter(number=phone).exists():
        MemberPhone.objects.create(member=member, number=phone, label="mobile")
    if not any(str(address.get(key) or "").strip() for key in ("street", "house_number", "postal_code", "locality")):
        return
    fields = {
        "street": str(address.get("street") or "").strip(),
        "house_number": str(address.get("house_number") or "").strip(),
        "line2": str(address.get("line2") or "").strip(),
        "postal_code": str(address.get("postal_code") or "").strip(),
        "locality": str(address.get("locality") or "").strip(),
        "country": str(address.get("country") or "").strip() or "Luxembourg",
    }
    flagged_address = member.club_addresses.filter(use_for_invoice=True).first()
    if flagged_address is not None and replace:
        for key, value in fields.items():
            setattr(flagged_address, key, value)
        flagged_address.save()
    elif flagged_address is None:
        MemberAddress.objects.create(member=member, use_for_invoice=True, **fields)


def set_primary_contact(contact: MemberContact, *, force: bool) -> None:
    others = MemberContact.objects.filter(member_id=contact.member_id, is_primary=True).exclude(pk=contact.pk)
    if not force and others.exists():
        return
    others.update(is_primary=False)
    if not contact.is_primary:
        contact.is_primary = True
        contact.save(update_fields=["is_primary"])


def _link_contact(member: Member, person: Person, relation: str, is_emergency: bool) -> MemberContact:
    contact = MemberContact.objects.filter(member=member, person=person).first()
    if contact is None:
        return MemberContact.objects.create(
            member=member,
            person=person,
            relation=relation,
            is_emergency=is_emergency,
        )
    contact.relation = relation
    contact.is_emergency = is_emergency
    contact.save(update_fields=["relation", "is_emergency"])
    return contact


def _address_from_data(data: dict) -> dict:
    return {
        "street": data.get("street") or "",
        "house_number": data.get("house_number") or "",
        "line2": data.get("line2") or "",
        "postal_code": data.get("postal_code") or "",
        "locality": data.get("locality") or "",
        "country": data.get("country") or "Luxembourg",
    }


def families_for_member(member: Member) -> list[Family]:
    return list(Family.objects.filter(club_id=member.club_id, memberships__member=member).distinct())


def assign_family_recipient(family: Family, *, member: Member | None = None, person: Person | None = None) -> None:
    if member is not None:
        family.invoice_member = member
        family.bill_to_person = None
        family.bill_to_delivery = ""
    else:
        family.invoice_member = None
        family.bill_to_person = person
    family.save(update_fields=["invoice_member", "bill_to_person", "bill_to_delivery"])


def _family_can_take_first_guardian(family: Family) -> bool:
    if family.invoice_member_id or family.bill_to_person_id:
        return False
    return family_members_are_all_minors(ordered_memberships(family))


@transaction.atomic
def save_guardian(
    *,
    club,
    targets: list[Member],
    first_name: str,
    last_name: str,
    relation: str,
    email: str = "",
    phone: str = "",
    address: dict | None = None,
    is_emergency: bool = True,
    different_person: bool = False,
    chosen_member_id=None,
    force_primary: bool = False,
    bill_families: list[Family] | None = None,
    bill_when_family_has_no_recipient: bool = False,
) -> dict:
    if relation not in MemberContact.Relation.values:
        raise ValidationError({"relation": "Choose a relation."})
    if not str(first_name or "").strip() or not str(last_name or "").strip():
        raise ValidationError({"name": "Enter a first and last name."})
    if not targets:
        raise ValidationError({"member": "Choose a member."})
    address = address or {}
    exclude_ids = [member.id for member in targets]
    matches = [] if different_person else members_with_name(club.id, first_name, last_name, exclude_ids=exclude_ids)
    if chosen_member_id and not different_person:
        matches = [item for item in matches if item.id == int(chosen_member_id)]
        if not matches:
            raise ValidationError({"member_id": "Choose one of the matching members."})
    if not different_person and len(matches) > 1 and not chosen_member_id:
        raise GuardianMatches([member_match_payload(item) for item in matches])

    linked_member = matches[0] if len(matches) == 1 else None
    if linked_member is not None:
        person = Person.objects.filter(converted_member=linked_member).first()
        if person is None:
            created = Person.objects.create(
                club=club,
                first_name=first_name,
                last_name=last_name,
                sex=linked_member.sex or sex_for_relation(relation),
            )
            person = adopt_member(created, linked_member)
            if person.id != created.id:
                created.delete()
        else:
            person = adopt_member(person, linked_member)
        remember_member_invoice_details(
            linked_member,
            email=email,
            phone=phone,
            address=address,
            replace=True,
        )
    else:
        person = Person.objects.create(
            club=club,
            first_name=first_name,
            last_name=last_name,
            sex=sex_for_relation(relation),
        )
    remember_person_invoice_details(person, email=email, phone=phone, address=address)

    primary_contact = None
    for member in targets:
        contact = _link_contact(member, person, relation, is_emergency)
        set_primary_contact(contact, force=force_primary)
        if primary_contact is None:
            primary_contact = contact

    families = list(bill_families or [])
    if bill_when_family_has_no_recipient:
        for member in targets:
            for family in families_for_member(member):
                if family.id not in {row.id for row in families} and _family_can_take_first_guardian(family):
                    families.append(family)
    for family in families:
        if linked_member is not None:
            assign_family_recipient(family, member=linked_member)
        elif bill_families is not None or _family_can_take_first_guardian(family):
            assign_family_recipient(family, person=person)
        for link in ordered_memberships(family):
            if not is_underage_member(link.member) and link.member_id not in {member.id for member in targets}:
                continue
            contact = MemberContact.objects.filter(member=link.member, person=person).first()
            if contact is not None:
                set_primary_contact(contact, force=True)

    return {
        "contact": primary_contact,
        "person": person,
        "linked_member": linked_member,
    }
