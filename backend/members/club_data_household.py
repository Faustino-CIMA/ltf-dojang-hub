"""Families, rebate rules, and contact lists for a club-management export.

People are written once. Rows point at them with person_ref, and at members
with member_ref. Database ids are not written. Medical notes are not read.
"""

from __future__ import annotations

from django.db.models import Q

from clubmgmt.models import (
    Family,
    FamilyMember,
    FamilyRebateRule,
    MemberAddress,
    MemberContact,
    MemberEmail,
    MemberPhone,
    Person,
    PersonAddress,
    PersonEmail,
    PersonPhone,
)


def _flag(value: bool) -> str:
    return "true" if value else "false"


def _money(value) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def household_counts(club_id: int) -> dict[str, int]:
    people = Person.objects.filter(
        Q(member_links__member__club_id=club_id) | Q(families_billed__club_id=club_id)
    ).distinct()
    return {
        "email_count": MemberEmail.objects.filter(member__club_id=club_id).count(),
        "phone_count": MemberPhone.objects.filter(member__club_id=club_id).count(),
        "address_count": MemberAddress.objects.filter(member__club_id=club_id).count(),
        "contact_count": MemberContact.objects.filter(member__club_id=club_id).count(),
        "person_count": people.count(),
        "family_count": Family.objects.filter(club_id=club_id).count(),
        "family_member_count": FamilyMember.objects.filter(family__club_id=club_id).count(),
        "rebate_count": FamilyRebateRule.objects.filter(club_id=club_id).count(),
    }


def _address(row) -> dict:
    return {
        "street": row.street,
        "house_number": row.house_number,
        "line2": row.line2,
        "postal_code": row.postal_code,
        "locality": row.locality,
        "country": row.country,
        "use_for_invoice": _flag(row.use_for_invoice),
    }


def add_household_tables(
    club_id: int,
    refs: dict[int, str],
    *,
    include_emails: bool,
    include_contacts: bool,
    include_families: bool,
) -> dict[str, list[dict]]:
    tables: dict[str, list[dict]] = {}
    if include_emails:
        tables["emails"] = [
            {
                "member_ref": refs.get(row.member_id, ""),
                "email": row.email,
                "use_for_invoice": _flag(row.use_for_invoice),
            }
            for row in MemberEmail.objects.filter(member__club_id=club_id).order_by(
                "member__last_name", "member__first_name", "id"
            )
            if row.member_id in refs
        ]
        tables["phones"] = [
            {
                "member_ref": refs.get(row.member_id, ""),
                "number": row.number,
                "label": row.label,
            }
            for row in MemberPhone.objects.filter(member__club_id=club_id).order_by(
                "member__last_name", "member__first_name", "id"
            )
            if row.member_id in refs
        ]
        tables["addresses"] = [
            {"member_ref": refs.get(row.member_id, ""), **_address(row)}
            for row in MemberAddress.objects.filter(member__club_id=club_id).order_by(
                "member__last_name", "member__first_name", "id"
            )
            if row.member_id in refs
        ]

    person_ids: set[int] = set()
    contacts: list[MemberContact] = []
    if include_contacts:
        contacts = list(
            MemberContact.objects.filter(member__club_id=club_id)
            .select_related("person")
            .order_by("member__last_name", "member__first_name", "person__last_name", "person__first_name", "id")
        )
        person_ids.update(row.person_id for row in contacts if row.member_id in refs)
    families: list[Family] = []
    if include_families:
        families = list(Family.objects.filter(club_id=club_id).order_by("name", "id"))
        person_ids.update(row.bill_to_person_id for row in families if row.bill_to_person_id)

    people = list(
        Person.objects.filter(id__in=person_ids)
        .prefetch_related("emails", "phones", "addresses")
        .order_by("last_name", "first_name", "id")
    )
    person_refs = {person.id: f"p-{index:04d}" for index, person in enumerate(people, start=1)}
    if include_contacts or people:
        tables["people"] = [
            {
                "person_ref": person_refs[person.id],
                "last_name": person.last_name,
                "first_name": person.first_name,
                "sex": person.sex,
                "member_ref": refs.get(person.converted_member_id, "") if person.converted_member_id else "",
            }
            for person in people
        ]
        tables["person_emails"] = [
            {
                "person_ref": person_refs[person.id],
                "email": email.email,
                "use_for_invoice": _flag(email.use_for_invoice),
            }
            for person in people
            for email in person.emails.all()
        ]
        tables["person_phones"] = [
            {"person_ref": person_refs[person.id], "number": phone.number, "label": phone.label}
            for person in people
            for phone in person.phones.all()
        ]
        tables["person_addresses"] = [
            {"person_ref": person_refs[person.id], **_address(address)}
            for person in people
            for address in person.addresses.all()
        ]
    if include_contacts:
        tables["contacts"] = [
            {
                "member_ref": refs[row.member_id],
                "person_ref": person_refs[row.person_id],
                "relation": row.relation,
                "is_emergency": _flag(row.is_emergency),
                "is_primary": _flag(row.is_primary),
            }
            for row in contacts
            if row.member_id in refs and row.person_id in person_refs
        ]

    if include_families:
        family_refs = {family.id: f"f-{index:04d}" for index, family in enumerate(families, start=1)}
        tables["families"] = [
            {
                "family_ref": family_refs[family.id],
                "name": family.name,
                "invoice_member_ref": refs.get(family.invoice_member_id, "") if family.invoice_member_id else "",
                "bill_to_person_ref": person_refs.get(family.bill_to_person_id, "") if family.bill_to_person_id else "",
                "delivery": family.bill_to_delivery,
            }
            for family in families
        ]
        tables["family_members"] = [
            {
                "family_ref": family_refs[row.family_id],
                "member_ref": refs[row.member_id],
                "sort_order": str(row.sort_order),
            }
            for row in FamilyMember.objects.filter(family__club_id=club_id).order_by(
                "family__name", "sort_order", "id"
            )
            if row.family_id in family_refs and row.member_id in refs
        ]
        tables["rebate_rules"] = [
            {
                "member_rank": str(row.member_rank),
                "percent_off": _money(row.percent_off),
                "amount_off": _money(row.amount_off),
                "applies_to_later": _flag(row.applies_to_later),
            }
            for row in FamilyRebateRule.objects.filter(club_id=club_id).order_by("member_rank", "id")
        ]
    return tables
