"""Wizard step 3: club admins from the club and admin export."""

from __future__ import annotations

from django.conf import settings

from clubs.admin_assignment import _grant_club_admin_role, build_username
from clubs.models import Club
from imports.csv_utils import to_row_dict
from imports.mapping import normalize_header
from members.models import Member
from members.services import apply_ltf_license_id_import_prefix
from ops.request_utils import write_ops_audit

from .names import is_ltf_name, normalize_club_name


def _header(headers, aliases: set[str]) -> str:
    for header in headers:
        if normalize_header(header) in aliases:
            return header
    return ""


def detect_admin_mapping(headers) -> dict:
    return {
        "organization": _header(headers, {"organization name", "organisation name", "club name"}),
        "admin_id": _header(headers, {"admin id", "adminid"}),
        "first_name": _header(headers, {"admin first name", "first name"}),
        "last_name": _header(headers, {"admin last name", "last name"}),
    }


def _blank(row) -> bool:
    return all(not str(cell or "").strip() for cell in row)


def _folded(value: str) -> str:
    return " ".join(str(value or "").casefold().split())


def plan_admins(headers, rows, *, rewrite_enabled: bool) -> dict:
    mapping = detect_admin_mapping(headers)
    skip_ids = {str(item).strip().upper() for item in getattr(settings, "SETUP_SKIP_ADMIN_IDS", ["LUX-10"])}
    clubs = {}
    admin_counts: dict[int, int] = {}
    existing_pairs: set[tuple[int, int]] = set()
    for club in Club.objects.filter(is_demo=False).prefetch_related("admins"):
        clubs[normalize_club_name(club.name)] = club
        admins = list(club.admins.all())
        admin_counts[club.id] = len(admins)
        for admin in admins:
            existing_pairs.add((admin.id, club.id))
    members = {
        str(member.ltf_licenseid or "").upper(): member
        for member in Member.objects.select_related("club", "user").exclude(ltf_licenseid="")
    }
    planned = []
    blank = 0
    skipped_ltf = 0
    skipped_ids = 0
    for index, row in enumerate(rows, start=1):
        if _blank(row):
            blank += 1
            continue
        data = to_row_dict(headers, row)
        organisation = data.get(mapping["organization"], "").strip()
        raw_id = data.get(mapping["admin_id"], "").strip().upper()
        rewritten, _changed = apply_ltf_license_id_import_prefix(raw_id, enabled=rewrite_enabled)
        first_name = data.get(mapping["first_name"], "").strip()
        last_name = data.get(mapping["last_name"], "").strip()
        if is_ltf_name(organisation):
            skipped_ltf += 1
            continue
        if raw_id in skip_ids or rewritten in skip_ids:
            skipped_ids += 1
            continue
        if not organisation and not raw_id and not first_name and not last_name:
            blank += 1
            continue
        member = members.get(rewritten)
        club = clubs.get(normalize_club_name(organisation))
        flags = []
        status = "ok"
        if member is None:
            status = "member_not_found"
        elif club is None:
            status = "club_not_found"
        else:
            if member.club_id is None:
                flags.append("staff_only_member")
            csv_first, csv_last = _folded(first_name), _folded(last_name)
            member_first, member_last = _folded(member.first_name), _folded(member.last_name)
            if csv_first and csv_last and csv_first == member_last and csv_last == member_first and csv_first != member_first:
                flags.append("likely_swapped")
                status = "likely_swapped"
            elif (csv_first or csv_last) and (csv_first != member_first or csv_last != member_last):
                flags.append("name_mismatch")
                status = "name_mismatch"
            provisional = member.user_id or -member.id
            if (provisional, club.id) in existing_pairs:
                status = "already_admin"
            elif admin_counts.get(club.id, 0) >= club.max_admins:
                status = "club_admin_limit"
                flags.append("club_admin_limit")
            else:
                admin_counts[club.id] = admin_counts.get(club.id, 0) + 1
                existing_pairs.add((provisional, club.id))
        planned.append(
            {
                "row_index": index,
                "organization": organisation,
                "admin_id": rewritten or raw_id,
                "csv_first_name": first_name,
                "csv_last_name": last_name,
                "status": status,
                "flags": flags,
                "member_id": member.id if member else None,
                "club_id": club.id if club else None,
                "display_name": f"{member.first_name} {member.last_name}".strip() if member else f"{first_name} {last_name}".strip(),
                "first_name": member.first_name if member else first_name,
                "last_name": member.last_name if member else last_name,
                "club_name": club.name if club else organisation,
            }
        )
    not_imported = [
        f"Not imported: no member with ID {row['admin_id']} ({row['display_name']}, {row['club_name']})"
        for row in planned
        if row["status"] == "member_not_found"
    ]
    return {
        "rows": planned,
        "not_imported": not_imported,
        "blank_rows_ignored": blank,
        "ltf_rows_ignored": skipped_ltf,
        "skipped_admin_ids": skipped_ids,
        "can_confirm": True,
    }


def _linked_row(row, user, member, club) -> dict:
    return {
        "user_id": user.id,
        "username": user.username,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "club_id": club.id,
        "club_name": club.name,
        "member_id": member.id,
        "flags": row["flags"],
        "status": row["status"],
    }


def apply_admins(headers, rows, *, rewrite_enabled: bool, actor, request) -> dict:
    from accounts.models import User

    planned = plan_admins(headers, rows, rewrite_enabled=rewrite_enabled)
    linked = []
    users_by_member = {}
    seen_club_admin = set()
    for row in planned["rows"]:
        if row["status"] in {"member_not_found", "club_not_found", "club_admin_limit"}:
            continue
        member = Member.objects.select_related("user", "club").get(pk=row["member_id"])
        club = Club.objects.get(pk=row["club_id"])
        user = users_by_member.get(member.id) or member.user
        if row["status"] == "already_admin" or (
            user is not None and ((user.id, club.id) in seen_club_admin or club.admins.filter(id=user.id).exists())
        ):
            row["status"] = "already_admin"
            if user is not None:
                users_by_member[member.id] = user
                linked.append(_linked_row(row, user, member, club))
            continue
        if club.admins.count() >= club.max_admins:
            row["status"] = "club_admin_limit"
            row["flags"] = [*row["flags"], "club_admin_limit"]
            continue
        created_user = False
        if user is None:
            user = User(username=build_username(member.first_name, member.last_name), email="", role=User.Roles.MEMBER)
            user.set_unusable_password()
            user.first_name = member.first_name
            user.last_name = member.last_name
            user.save()
            member.user = user
            member.save(update_fields=["user", "updated_at"])
            created_user = True
        users_by_member[member.id] = user
        pair = (user.id, club.id)
        seen_club_admin.add(pair)
        club.admins.add(user)
        _grant_club_admin_role(user)
        write_ops_audit(
            request,
            action="setup_club_admin",
            target_type="user",
            target_id=user.id,
            message=f"Linked {user.username} as admin of {club.name}.",
            metadata={"club_id": club.id, "member_id": member.id, "created_user": created_user},
        )
        linked.append(_linked_row(row, user, member, club))
    grouped = {}
    for item in linked:
        bucket = grouped.setdefault(
            item["user_id"],
            {
                "user_id": item["user_id"],
                "username": item["username"],
                "first_name": item["first_name"],
                "last_name": item["last_name"],
                "clubs": [],
                "flags": [],
            },
        )
        if not any(club["id"] == item["club_id"] for club in bucket["clubs"]):
            bucket["clubs"].append({"id": item["club_id"], "name": item["club_name"]})
        for flag in item["flags"]:
            if flag not in bucket["flags"]:
                bucket["flags"].append(flag)
    return {
        "confirmed": True,
        "admins": list(grouped.values()),
        "not_imported": planned["not_imported"],
        "rows": planned["rows"],
        "blank_rows_ignored": planned["blank_rows_ignored"],
        "ltf_rows_ignored": planned["ltf_rows_ignored"],
        "skipped_admin_ids": planned["skipped_admin_ids"],
    }
