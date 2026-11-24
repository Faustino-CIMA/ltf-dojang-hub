"""Import families, people, and contact lists onto members already matched.

Member dates stay in the member importer. A preferred name column stays ignored.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

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
from members.club_data_export import (
    ADDRESS_KEYS,
    CONTACT_KEYS,
    EMAIL_KEYS,
    FAMILY_KEYS,
    FAMILY_MEMBER_KEYS,
    PEOPLE_KEYS,
    PERSON_ADDRESS_KEYS,
    PERSON_EMAIL_KEYS,
    PERSON_PHONE_KEYS,
    PHONE_KEYS,
    REBATE_KEYS,
)
from members.models import Member

HOUSEHOLD_SHEETS = (
    "emails",
    "phones",
    "addresses",
    "people",
    "contacts",
    "person_emails",
    "person_phones",
    "person_addresses",
    "families",
    "family_members",
    "rebate_rules",
)

HOUSEHOLD_FIELDS = {
    "emails": EMAIL_KEYS,
    "phones": PHONE_KEYS,
    "addresses": ADDRESS_KEYS,
    "people": PEOPLE_KEYS,
    "contacts": CONTACT_KEYS,
    "person_emails": PERSON_EMAIL_KEYS,
    "person_phones": PERSON_PHONE_KEYS,
    "person_addresses": PERSON_ADDRESS_KEYS,
    "families": FAMILY_KEYS,
    "family_members": FAMILY_MEMBER_KEYS,
    "rebate_rules": REBATE_KEYS,
}

HOUSEHOLD_ERRORS = {
    "unknown_member",
    "unknown_person",
    "bad_email",
    "bad_phone",
    "two_invoice",
    "unknown_relation",
    "ambiguous_person",
    "duplicate_family",
    "bad_postal",
    "missing_name",
    "bad_delivery",
    "bad_rank",
}

_RELATIONS = {
    "father": "father",
    "mother": "mother",
    "grandfather": "grandfather",
    "grandmother": "grandmother",
    "uncle": "uncle",
    "aunt": "aunt",
    "brother": "brother",
    "sister": "sister",
    "guardian": "guardian",
    "partner": "partner",
    "spouse": "spouse",
    "other": "other",
    "père": "father",
    "mère": "mother",
    "vater": "father",
    "mutter": "mother",
    "papp": "father",
    "mamm": "mother",
    "tuteur": "guardian",
    "vormund": "guardian",
    "notfall": "other",
}
_LABELS = {
    "mobile": "mobile",
    "home": "home",
    "work": "work",
    "other": "other",
    "domicile": "home",
    "travail": "work",
    "autre": "other",
    "privat": "home",
    "arbeit": "work",
    "sonstiges": "other",
    "doheem": "home",
    "aarbecht": "work",
    "aner": "other",
}
_DIAL = {"LU": "352", "DE": "49", "FR": "33", "BE": "32"}
_POSTAL = {"LU": 4, "DE": 5, "BE": 4, "FR": 5}
_DELIVERY = {"email": "email", "post": "post", "in_person": "in_person", "courrier": "post", "brief": "post"}
_YES = {"true", "1", "yes", "oui", "ja", "jo"}
_CHILD_MODELS = {
    "member_email": MemberEmail,
    "member_phone": MemberPhone,
    "member_address": MemberAddress,
    "person_email": PersonEmail,
    "person_phone": PersonPhone,
    "person_address": PersonAddress,
    "contact": MemberContact,
    "family": Family,
    "family_member": FamilyMember,
    "rebate": FamilyRebateRule,
    "person": Person,
}


def sheet_rows(key: str, rows: list[dict]) -> dict | None:
    if not rows:
        return None
    fields = HOUSEHOLD_FIELDS[key]
    return {
        "key": key,
        "headers": list(fields),
        "key_row": list(fields),
        "rows": [[_cell(row.get(field, "")) for field in fields] for row in rows],
    }


def extra_json_sheets(body: dict) -> list[dict]:
    if not isinstance(body, dict):
        return []
    emails, phones, addresses, contacts = [], [], [], []
    for person in body.get("members") or []:
        if not isinstance(person, dict):
            continue
        ref = _cell(person.get("member_ref", ""))
        for row in person.get("emails") or []:
            emails.append({**_pick(row, EMAIL_KEYS), "member_ref": ref})
        for row in person.get("phones") or []:
            phones.append({**_pick(row, PHONE_KEYS), "member_ref": ref})
        for row in person.get("addresses") or []:
            addresses.append({**_pick(row, ADDRESS_KEYS), "member_ref": ref})
        for row in person.get("contacts") or []:
            contacts.append({**_pick(row, CONTACT_KEYS), "member_ref": ref})
    people, person_emails, person_phones, person_addresses = [], [], [], []
    for person in body.get("people") or []:
        if not isinstance(person, dict):
            continue
        ref = _cell(person.get("person_ref", ""))
        people.append(_pick(person, PEOPLE_KEYS))
        for row in person.get("emails") or []:
            person_emails.append({**_pick(row, PERSON_EMAIL_KEYS), "person_ref": ref})
        for row in person.get("phones") or []:
            person_phones.append({**_pick(row, PERSON_PHONE_KEYS), "person_ref": ref})
        for row in person.get("addresses") or []:
            person_addresses.append({**_pick(row, PERSON_ADDRESS_KEYS), "person_ref": ref})
    families, links = [], []
    for family in body.get("families") or []:
        if not isinstance(family, dict):
            continue
        families.append(_pick(family, FAMILY_KEYS))
        for row in family.get("members") or []:
            links.append(
                {
                    "family_ref": _cell(family.get("family_ref", "")),
                    "member_ref": _cell(row.get("member_ref", "")),
                    "sort_order": _cell(row.get("sort_order", "")),
                }
            )
    built = []
    pairs = (
        ("emails", emails),
        ("phones", phones),
        ("addresses", addresses),
        ("people", people),
        ("contacts", contacts),
        ("person_emails", person_emails),
        ("person_phones", person_phones),
        ("person_addresses", person_addresses),
        ("families", families),
        ("family_members", links),
        ("rebate_rules", [_pick(row, REBATE_KEYS) for row in body.get("rebate_rules") or [] if isinstance(row, dict)]),
    )
    for key, rows in pairs:
        sheet = sheet_rows(key, rows)
        if sheet is not None:
            built.append(sheet)
    return built


def modes_from(actions: dict | None) -> set[str]:
    chosen = set()
    for key, value in (actions or {}).items():
        if str(key).startswith("__mode:") and value == "replace":
            chosen.add(str(key).split(":", 1)[1])
    return chosen


def decide_household(
    sheet: str,
    row: dict,
    *,
    club_id: int,
    members: dict[str, int],
    people: dict,
    families: dict,
    family_names: dict | None = None,
    people_rows: dict | None = None,
) -> dict:
    codes: list[str] = []
    action = "create"
    target_id = None
    member_id = members.get(row.get("member_ref", "").strip().upper())
    preview = {"member_ref": row.get("member_ref", "").strip(), "last_name": "", "first_name": ""}
    signature = ""
    if sheet in {"emails", "phones", "addresses"} and not member_id:
        codes.append("unknown_member")
    if sheet == "emails":
        email = row["email"].strip()
        if not _one_email(email):
            codes.append("bad_email")
        found = MemberEmail.objects.filter(member_id=member_id, email__iexact=email).first() if member_id and email else None
        if found is not None:
            action, target_id = "update", found.id
        signature = f"email:{member_id}|{email.casefold()}"
        preview["last_name"] = email
    elif sheet == "phones":
        number, phone_code = _phone(row["number"], row.get("country", ""))
        if phone_code:
            codes.append(phone_code)
        label, label_code = _label(row["label"])
        if label_code:
            codes.append(label_code)
        row["number"] = number
        row["label"] = label
        found = MemberPhone.objects.filter(member_id=member_id, number=number).first() if member_id and number else None
        if found is not None:
            action, target_id = "update", found.id
        signature = f"phone:{member_id}|{number}"
        preview["last_name"] = number
    elif sheet == "addresses":
        postal_code = _postal(row)
        if postal_code:
            codes.append(postal_code)
        if not any(row.get(field, "").strip() for field in ("street", "house_number", "postal_code", "locality", "country")):
            action = "skip"
        else:
            found = _match_address(MemberAddress, "member_id", member_id, row) if member_id else None
            if found is not None:
                action, target_id = "update", found.id
        signature = f"address:{member_id}|{_address_key(row)}"
        preview["last_name"] = row.get("street", "").strip()
    elif sheet == "people":
        last_name = row["last_name"].strip()
        first_name = row["first_name"].strip()
        if not last_name:
            codes.append("missing_name")
        sex = row["sex"].strip().upper() or "M"
        if sex not in {"M", "F"}:
            codes.append("bad_sex")
        matches = list(
            Person.objects.filter(club_id=club_id, last_name__iexact=last_name, first_name__iexact=first_name, sex=sex)
        )
        if len(matches) > 1:
            codes.append("ambiguous_person")
            action = "skip"
        elif len(matches) == 1:
            action, target_id = "update", matches[0].id
        signature = f"person:{last_name.casefold()}|{first_name.casefold()}|{sex}"
        preview = {"last_name": last_name, "first_name": first_name, "member_ref": row.get("member_ref", "").strip()}
    elif sheet == "contacts":
        relation = _RELATIONS.get(row["relation"].strip().casefold())
        if not relation:
            codes.append("unknown_relation")
        else:
            row["relation"] = relation
        person_ref = row["person_ref"].strip()
        if person_ref not in people:
            codes.append("unknown_person")
        if not member_id:
            codes.append("unknown_member")
        known = (people_rows or {}).get(person_ref) or {}
        if member_id and known:
            person = Person.objects.filter(
                club_id=club_id,
                last_name__iexact=known.get("last_name", ""),
                first_name__iexact=known.get("first_name", ""),
            ).first()
            link = MemberContact.objects.filter(member_id=member_id, person=person).first() if person else None
            if link is not None:
                action, target_id = "update", link.id
        signature = f"contact:{member_id}|{person_ref}"
        preview["last_name"] = relation or row["relation"].strip()
    elif sheet in {"person_emails", "person_phones", "person_addresses"}:
        person_ref = row["person_ref"].strip()
        if person_ref not in people:
            codes.append("unknown_person")
        if sheet == "person_emails" and not _one_email(row["email"].strip()):
            codes.append("bad_email")
        if sheet == "person_phones":
            number, phone_code = _phone(row["number"], "")
            if phone_code:
                codes.append(phone_code)
            row["number"] = number
        if sheet == "person_addresses":
            postal_code = _postal(row)
            if postal_code:
                codes.append(postal_code)
        signature = f"{sheet}:{person_ref}|{row.get('email') or row.get('number') or _address_key(row)}"
        preview["last_name"] = person_ref
    elif sheet == "families":
        name = row["name"].strip()
        if not name:
            codes.append("missing_name")
        delivery = row["delivery"].strip().casefold()
        if delivery and delivery not in _DELIVERY:
            codes.append("bad_delivery")
        elif delivery:
            row["delivery"] = _DELIVERY[delivery]
        existing = list(Family.objects.filter(club_id=club_id, name__iexact=name))
        if len(existing) > 1:
            codes.append("duplicate_family")
            action = "skip"
        elif len(existing) == 1:
            action, target_id = "update", existing[0].id
        person_ref = row["bill_to_person_ref"].strip()
        if person_ref and person_ref not in people:
            codes.append("unknown_person")
        invoice_ref = row["invoice_member_ref"].strip().upper()
        if invoice_ref and invoice_ref not in members:
            codes.append("unknown_member")
        signature = f"family:{name.casefold()}"
        preview["last_name"] = name
    elif sheet == "family_members":
        family_ref = row["family_ref"].strip()
        if family_ref not in families:
            codes.append("missing_name")
        if not member_id:
            codes.append("unknown_member")
        family_name = (family_names or {}).get(family_ref, "")
        family = Family.objects.filter(club_id=club_id, name__iexact=family_name).first() if family_name else None
        link = FamilyMember.objects.filter(family=family, member_id=member_id).first() if family and member_id else None
        if link is not None:
            action, target_id = "update", link.id
        signature = f"family-member:{family_ref}|{row['member_ref'].strip().upper()}"
        preview["member_ref"] = row["member_ref"].strip()
    else:
        rank = row["member_rank"].strip()
        if not rank.isdigit() or int(rank) < 1:
            codes.append("bad_rank")
        signature = f"rebate:{rank}"
        found = FamilyRebateRule.objects.filter(club_id=club_id, member_rank=int(rank or 0)).first() if rank.isdigit() else None
        if found is not None:
            action, target_id = "update", found.id
        preview["last_name"] = rank
    if any(code in HOUSEHOLD_ERRORS or code == "bad_sex" for code in codes):
        action = "skip"
    return {
        "sheet": sheet,
        "line": row["_line"],
        "codes": codes,
        "action": action,
        "signature": signature,
        "stored_date": "",
        "preview": preview,
        "member_id": member_id,
        "target_id": target_id,
    }


def flag_invoice_clashes(decisions: list[dict]) -> None:
    seen: dict[str, int] = {}
    for index, item in enumerate(decisions):
        if item["sheet"] not in {"emails", "person_emails", "addresses", "person_addresses", "contacts"}:
            continue
        if item["action"] == "skip":
            continue
        flag = "is_primary" if item["sheet"] == "contacts" else "use_for_invoice"
        if not _yes(item["row"].get(flag, "")):
            continue
        owner = item["row"].get("member_ref") or item["row"].get("person_ref")
        key = f"{item['sheet']}:{owner}"
        if key in seen:
            for hit in (seen[key], index):
                decisions[hit]["codes"].append("two_invoice")
                decisions[hit]["action"] = "skip"
        else:
            seen[key] = index


def removal_rows(club_id: int, decisions: list[dict], replacing: set[str]) -> list[dict]:
    """Children the file left out, when that sheet is set to replace."""
    rows = []
    present = {item["sheet"] for item in decisions}
    if "emails" in replacing and "emails" in present:
        kept = {item["target_id"] for item in decisions if item["sheet"] == "emails" and item["target_id"]}
        for row in MemberEmail.objects.filter(member__club_id=club_id).exclude(pk__in=kept):
            rows.append(_removal("emails", row.id, row.email, {"member_id": row.member_id, "email": row.email, "use_for_invoice": row.use_for_invoice}))
    if "phones" in replacing and "phones" in present:
        kept = {item["target_id"] for item in decisions if item["sheet"] == "phones" and item["target_id"]}
        for row in MemberPhone.objects.filter(member__club_id=club_id).exclude(pk__in=kept):
            rows.append(_removal("phones", row.id, row.number, {"member_id": row.member_id, "number": row.number, "label": row.label}))
    if "contacts" in replacing and "contacts" in present:
        kept = {item["target_id"] for item in decisions if item["sheet"] == "contacts" and item["target_id"]}
        for row in MemberContact.objects.filter(member__club_id=club_id).exclude(pk__in=kept):
            rows.append(
                _removal(
                    "contacts",
                    row.id,
                    row.relation,
                    {
                        "member_id": row.member_id,
                        "person_id": row.person_id,
                        "relation": row.relation,
                        "is_emergency": row.is_emergency,
                        "is_primary": row.is_primary,
                    },
                )
            )
    if "family_members" in replacing and "family_members" in present:
        kept = {item["target_id"] for item in decisions if item["sheet"] == "family_members" and item["target_id"]}
        for row in FamilyMember.objects.filter(family__club_id=club_id).exclude(pk__in=kept):
            rows.append(
                _removal(
                    "family_members",
                    row.id,
                    str(row.sort_order),
                    {"family_id": row.family_id, "member_id": row.member_id, "sort_order": row.sort_order},
                )
            )
    if "rebate_rules" in replacing and "rebate_rules" in present:
        kept = {item["target_id"] for item in decisions if item["sheet"] == "rebate_rules" and item["target_id"]}
        for row in FamilyRebateRule.objects.filter(club_id=club_id).exclude(pk__in=kept):
            rows.append(
                _removal(
                    "rebate_rules",
                    row.id,
                    str(row.member_rank),
                    {
                        "club_id": club_id,
                        "member_rank": row.member_rank,
                        "percent_off": str(row.percent_off),
                        "amount_off": str(row.amount_off) if row.amount_off is not None else "",
                        "applies_to_later": row.applies_to_later,
                    },
                )
            )
    return rows


def apply_household(club_id: int, item: dict, refs: dict, people: dict, families: dict) -> dict | None:
    if item["action"] == "remove":
        model = _CHILD_MODELS[item["model"]]
        row = model.objects.filter(pk=item["target_id"]).first()
        if row is None:
            return None
        row.delete()
        return {"op": "remove_child", "model": item["model"], "fields": item["fields"]}
    sheet = item["sheet"]
    row = item["row"]
    if sheet == "people":
        return _save_person(club_id, item, people)
    if sheet == "emails":
        return _save_email(MemberEmail, "member", _member(club_id, row, refs, item), item, "member_email")
    if sheet == "person_emails":
        return _save_email(PersonEmail, "person", people.get(row["person_ref"].strip()), item, "person_email")
    if sheet == "phones":
        return _save_phone(MemberPhone, "member", _member(club_id, row, refs, item), item, "member_phone")
    if sheet == "person_phones":
        return _save_phone(PersonPhone, "person", people.get(row["person_ref"].strip()), item, "person_phone")
    if sheet == "addresses":
        return _save_address(MemberAddress, "member", _member(club_id, row, refs, item), item, "member_address")
    if sheet == "person_addresses":
        return _save_address(PersonAddress, "person", people.get(row["person_ref"].strip()), item, "person_address")
    if sheet == "contacts":
        return _save_contact(club_id, item, refs, people)
    if sheet == "families":
        return _save_family(club_id, item, refs, people, families)
    if sheet == "family_members":
        return _save_family_member(item, refs, families, club_id)
    if sheet == "rebate_rules":
        return _save_rebate(club_id, item)
    return None


def undo_child(entry: dict) -> None:
    model = _CHILD_MODELS.get(entry.get("model"))
    if model is None:
        return
    if entry["op"] == "create_child":
        model.objects.filter(pk=entry.get("id")).delete()
        _restore_record(entry)
        return
    if entry["op"] == "remove_child":
        model.objects.create(**_restore_fields(entry["model"], entry.get("fields") or {}))
        return
    row = model.objects.filter(pk=entry.get("id")).first()
    if row is None:
        _restore_record(entry)
        return
    for key, value in (entry.get("previous") or {}).items():
        setattr(row, key, value)
    row.save()
    _restore_record(entry)


def index_people(rows: list[dict]) -> dict[str, str]:
    return {row["person_ref"].strip(): row["person_ref"].strip() for row in rows if row.get("person_ref", "").strip()}


def index_families(rows: list[dict]) -> dict[str, str]:
    return {row["family_ref"].strip(): row["family_ref"].strip() for row in rows if row.get("family_ref", "").strip()}


def _save_person(club_id, item, people):
    row = item["row"]
    sex = row["sex"].strip().upper() or Person.Sex.MALE
    if item["target_id"]:
        person = Person.objects.filter(pk=item["target_id"], club_id=club_id).first()
        if person is None:
            raise ValidationError("unknown_person")
        previous = {"first_name": person.first_name, "last_name": person.last_name, "sex": person.sex}
        person.first_name = row["first_name"].strip()
        person.last_name = row["last_name"].strip()
        person.sex = sex
        person.save()
        people[row["person_ref"].strip()] = person
        return {"op": "update_child", "model": "person", "id": person.id, "previous": previous}
    person = Person.objects.create(
        club_id=club_id,
        first_name=row["first_name"].strip(),
        last_name=row["last_name"].strip(),
        sex=sex,
    )
    people[row["person_ref"].strip()] = person
    return {"op": "create_child", "model": "person", "id": person.id}


def _save_email(model, owner_field, owner, item, name):
    if owner is None:
        raise ValidationError("unknown_member")
    email = item["row"]["email"].strip()
    flag = _yes(item["row"].get("use_for_invoice", ""))
    if item["target_id"]:
        row = model.objects.filter(pk=item["target_id"]).first()
        previous = {"email": row.email, "use_for_invoice": row.use_for_invoice}
        row.email = email
        row.use_for_invoice = flag
        row.save()
        _clear_invoice(model, owner_field, owner, row.id, flag)
        return {"op": "update_child", "model": name, "id": row.id, "previous": previous}
    row = model.objects.create(**{owner_field: owner, "email": email, "use_for_invoice": flag})
    _clear_invoice(model, owner_field, owner, row.id, flag)
    return {"op": "create_child", "model": name, "id": row.id}


def _save_phone(model, owner_field, owner, item, name):
    if owner is None:
        raise ValidationError("unknown_member")
    number = item["row"]["number"].strip()
    label = item["row"]["label"].strip() or "other"
    if item["target_id"]:
        row = model.objects.filter(pk=item["target_id"]).first()
        previous = {"number": row.number, "label": row.label}
        row.number = number
        row.label = label
        row.save()
        return {"op": "update_child", "model": name, "id": row.id, "previous": previous}
    row = model.objects.create(**{owner_field: owner, "number": number, "label": label})
    return {"op": "create_child", "model": name, "id": row.id}


def _save_address(model, owner_field, owner, item, name):
    if owner is None:
        raise ValidationError("unknown_member")
    fields = {key: item["row"].get(key, "").strip() for key in ("street", "house_number", "line2", "postal_code", "locality", "country")}
    fields["use_for_invoice"] = _yes(item["row"].get("use_for_invoice", ""))
    if item["target_id"]:
        row = model.objects.filter(pk=item["target_id"]).first()
        previous = {key: getattr(row, key) for key in fields}
        for key, value in fields.items():
            setattr(row, key, value)
        row.save()
        _clear_invoice(model, owner_field, owner, row.id, fields["use_for_invoice"])
        result = {"op": "update_child", "model": name, "id": row.id, "previous": previous}
        record_previous = _align_invoice_delivery(owner, owner_field, fields["use_for_invoice"])
        if record_previous:
            result["record_previous"] = record_previous
        return result
    row = model.objects.create(**{owner_field: owner, **fields})
    _clear_invoice(model, owner_field, owner, row.id, fields["use_for_invoice"])
    record_previous = _align_invoice_delivery(owner, owner_field, fields["use_for_invoice"])
    result = {"op": "create_child", "model": name, "id": row.id}
    if record_previous:
        result["record_previous"] = record_previous
    return result


def _save_contact(club_id, item, refs, people):
    member = _member(club_id, item["row"], refs, item)
    person = people.get(item["row"]["person_ref"].strip())
    if member is None or person is None:
        raise ValidationError("unknown_person")
    flag = _yes(item["row"].get("is_primary", ""))
    emergency = _yes(item["row"].get("is_emergency", ""))
    relation = item["row"]["relation"].strip()
    existing = MemberContact.objects.filter(member=member, person=person).first()
    if existing is not None:
        previous = {"relation": existing.relation, "is_emergency": existing.is_emergency, "is_primary": existing.is_primary}
        existing.relation = relation
        existing.is_emergency = emergency
        existing.is_primary = flag
        existing.save()
        if flag:
            MemberContact.objects.filter(member=member, is_primary=True).exclude(pk=existing.pk).update(is_primary=False)
        return {"op": "update_child", "model": "contact", "id": existing.id, "previous": previous}
    row = MemberContact.objects.create(member=member, person=person, relation=relation, is_emergency=emergency, is_primary=flag)
    if flag:
        MemberContact.objects.filter(member=member, is_primary=True).exclude(pk=row.pk).update(is_primary=False)
    return {"op": "create_child", "model": "contact", "id": row.id}


def _save_family(club_id, item, refs, people, families):
    row = item["row"]
    invoice = _member(club_id, {"member_ref": row.get("invoice_member_ref", "")}, refs, {"member_id": None})
    person = people.get(row.get("bill_to_person_ref", "").strip())
    delivery = row.get("delivery", "").strip()
    if item["target_id"]:
        family = Family.objects.filter(pk=item["target_id"], club_id=club_id).first()
        previous = {
            "name": family.name,
            "invoice_member_id": family.invoice_member_id,
            "bill_to_person_id": family.bill_to_person_id,
            "bill_to_delivery": family.bill_to_delivery,
        }
        family.name = row["name"].strip()
        family.invoice_member = invoice
        family.bill_to_person = person
        family.bill_to_delivery = delivery
        family.save()
        families[row["family_ref"].strip()] = family
        result = {"op": "update_child", "model": "family", "id": family.id, "previous": previous}
    else:
        family = Family.objects.create(
            club_id=club_id,
            name=row["name"].strip(),
            invoice_member=invoice,
            bill_to_person=person,
            bill_to_delivery=delivery,
        )
        families[row["family_ref"].strip()] = family
        result = {"op": "create_child", "model": "family", "id": family.id}
    record_previous = _copy_family_delivery(invoice, delivery)
    if record_previous:
        result["record_previous"] = record_previous
    return result


def _save_family_member(item, refs, families, club_id):
    family = families.get(item["row"]["family_ref"].strip())
    member = _member(club_id, item["row"], refs, item)
    if family is None or member is None:
        raise ValidationError("unknown_member")
    order = int(item["row"]["sort_order"].strip() or "1")
    existing = FamilyMember.objects.filter(family=family, member=member).first()
    if existing is not None:
        previous = {"sort_order": existing.sort_order}
        existing.sort_order = order
        existing.save()
        return {"op": "update_child", "model": "family_member", "id": existing.id, "previous": previous}
    row = FamilyMember.objects.create(family=family, member=member, sort_order=order)
    return {"op": "create_child", "model": "family_member", "id": row.id}


def _save_rebate(club_id, item):
    row = item["row"]
    rank = int(row["member_rank"].strip())
    percent = _decimal(row.get("percent_off", "")) or Decimal("0")
    amount = _decimal(row.get("amount_off", ""))
    later = _yes(row.get("applies_to_later", ""))
    if item["target_id"]:
        rule = FamilyRebateRule.objects.filter(pk=item["target_id"], club_id=club_id).first()
        previous = {
            "percent_off": rule.percent_off,
            "amount_off": rule.amount_off,
            "applies_to_later": rule.applies_to_later,
        }
        rule.percent_off = percent
        rule.amount_off = amount
        rule.applies_to_later = later
        rule.save()
        return {"op": "update_child", "model": "rebate", "id": rule.id, "previous": previous}
    rule = FamilyRebateRule.objects.create(
        club_id=club_id,
        member_rank=rank,
        percent_off=percent,
        amount_off=amount,
        applies_to_later=later,
    )
    return {"op": "create_child", "model": "rebate", "id": rule.id}


def _member(club_id, row, refs, item):
    ref = (row.get("member_ref") or "").strip()
    found = refs.get(ref) or refs.get(ref.upper())
    if found is not None:
        return found
    if item.get("member_id"):
        return Member.objects.filter(pk=item["member_id"], club_id=club_id).first()
    if ref:
        return Member.objects.filter(club_id=club_id, ltf_licenseid__iexact=ref).first()
    return None


def _clear_invoice(model, owner_field, owner, keep_id, flag):
    if not flag:
        return
    model.objects.filter(**{owner_field: owner}, use_for_invoice=True).exclude(pk=keep_id).update(use_for_invoice=False)


def _restore_record(entry: dict) -> None:
    previous = entry.get("record_previous") or {}
    record_id = previous.get("id")
    delivery = previous.get("invoice_delivery")
    if not record_id or delivery is None:
        return
    from clubmgmt.models import MemberRecord

    record = MemberRecord.objects.filter(pk=record_id).first()
    if record is None or record.invoice_delivery == delivery:
        return
    record.invoice_delivery = delivery
    record.save(update_fields=["invoice_delivery", "updated_at"])


def _set_member_delivery(member, delivery: str) -> dict | None:
    from clubmgmt.models import MemberRecord

    if member is None or delivery not in {choice.value for choice in MemberRecord.InvoiceDelivery}:
        return None
    record, _created = MemberRecord.objects.get_or_create(member=member)
    previous = record.invoice_delivery
    if previous == delivery:
        return None
    record.invoice_delivery = delivery
    record.save(update_fields=["invoice_delivery", "updated_at"])
    return {"id": record.id, "invoice_delivery": previous}


def _mark_only_post_address(member) -> None:
    from clubmgmt.models import MemberRecord

    record = MemberRecord.objects.filter(member=member).first()
    if record is None or record.invoice_delivery != MemberRecord.InvoiceDelivery.POST:
        return
    addresses = list(member.club_addresses.order_by("id"))
    if any(row.use_for_invoice for row in addresses) or len(addresses) != 1:
        return
    addresses[0].use_for_invoice = True
    addresses[0].save(update_fields=["use_for_invoice"])


def _align_invoice_delivery(owner, owner_field: str, marked: bool) -> dict | None:
    """Store post when that is the delivery invoices will actually use.

    Address import used to leave the member on the default email. The screen
    button then showed email while the helper described post. When post is the
    only delivery that can be used, or a family row says post, that choice is
    stored. The member's only address is then the invoice address.
    """
    if owner is None or owner_field != "member":
        return None
    from clubmgmt.billing import resolve_delivery
    from clubmgmt.models import MemberRecord

    previous = None
    if resolve_delivery(owner) == MemberRecord.InvoiceDelivery.POST:
        previous = _set_member_delivery(owner, MemberRecord.InvoiceDelivery.POST)
    elif not marked:
        return None
    _mark_only_post_address(owner)
    return previous


def _copy_family_delivery(member, delivery: str) -> dict | None:
    mapped = {"email": "email", "post": "post", "hand": "hand", "in_person": "hand"}.get((delivery or "").strip())
    if member is None or mapped is None:
        return None
    previous = _set_member_delivery(member, mapped)
    _mark_only_post_address(member)
    return previous


def _match_address(model, owner_field, owner_id, row):
    if not owner_id:
        return None
    return model.objects.filter(
        **{owner_field: owner_id},
        street__iexact=row.get("street", "").strip(),
        house_number__iexact=row.get("house_number", "").strip(),
        postal_code__iexact=row.get("postal_code", "").strip(),
        locality__iexact=row.get("locality", "").strip(),
        country__iexact=(row.get("country", "").strip() or "LU"),
    ).first()


def _removal(sheet, row_id, label, fields):
    model = {
        "emails": "member_email",
        "phones": "member_phone",
        "contacts": "contact",
        "family_members": "family_member",
        "rebate_rules": "rebate",
    }[sheet]
    return {
        "sheet": sheet,
        "line": 0,
        "codes": ["would_remove"],
        "action": "remove",
        "signature": f"remove:{model}:{row_id}",
        "stored_date": "",
        "preview": {"last_name": label, "first_name": "", "member_ref": ""},
        "member_id": None,
        "target_id": row_id,
        "model": model,
        "fields": fields,
        "row": {},
    }


def _restore_fields(model, fields):
    cleaned = dict(fields)
    if model == "rebate":
        cleaned["percent_off"] = Decimal(cleaned.get("percent_off") or "0")
        amount = cleaned.get("amount_off") or ""
        cleaned["amount_off"] = Decimal(amount) if amount else None
    return cleaned


def _one_email(value: str) -> bool:
    if not value or any(mark in value for mark in (" ", ",", ";")):
        return False
    try:
        validate_email(value)
    except ValidationError:
        return False
    return True


def _phone(value: str, country: str) -> tuple[str, str | None]:
    text = re.sub(r"[\s()-]", "", value or "")
    code = (country or "").strip().upper()
    if text.startswith("+") and text[1:].isdigit() and 8 <= len(text) <= 16:
        if code and _DIAL.get(code) and not text.startswith("+" + _DIAL[code]):
            return text, "bad_phone"
        return text, None
    if text.isdigit() and code in _DIAL:
        national = text[1:] if text.startswith("0") else text
        return f"+{_DIAL[code]}{national}", None
    return text, "bad_phone"


def _label(value: str) -> tuple[str, str | None]:
    text = (value or "").strip().casefold()
    if not text:
        return "other", None
    if text in _LABELS:
        return _LABELS[text], None
    return "other", "unknown_label"


def _postal(row: dict) -> str | None:
    country = (row.get("country") or "LU").strip().upper()
    postal = row.get("postal_code", "").strip()
    if not postal:
        return None
    if country in _POSTAL:
        return None if re.fullmatch(rf"\d{{{_POSTAL[country]}}}", postal) else "bad_postal"
    return None if 1 <= len(postal) <= 12 else "bad_postal"


def _address_key(row: dict) -> str:
    return "|".join(row.get(field, "").strip().casefold() for field in ("country", "postal_code", "locality", "street", "house_number"))


def _yes(value: str) -> bool:
    return str(value or "").strip().casefold() in _YES


def _decimal(value: str) -> Decimal | None:
    text = str(value or "").strip().replace(",", ".")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _cell(value) -> str:
    return "" if value is None else str(value).strip()


def _pick(row: dict, fields) -> dict:
    return {field: _cell(row.get(field, "")) for field in fields}
