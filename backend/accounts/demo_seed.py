"""Idempotent fictional world for the separate demo app.

Every club and member created here is marked is_demo. Emails use example.lu.
Nothing in this module updates a row that is not already demo data, and it
will not rewrite a login whose email is outside example.lu.
"""

from __future__ import annotations

import os
import secrets
from datetime import date, timedelta
from decimal import Decimal

from allauth.account.models import EmailAddress
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from clubmgmt.clothing import ClubClothingItem, MemberClothingValue, seed_default_clothing
from clubmgmt.gear import MemberGear
from clubmgmt.teams import ClubTeam, ClubTeamMembership
from clubs.models import Club
from events.models import Event
from licenses.models import Invoice, License, LicenseType, Order, OrderItem
from members.models import Member
from modules.models import ClubModuleAssignment, InstallEntitlement
from modules.registry import (
    CLUB_MANAGEMENT_MODULE_ID,
    COMPETITION_MODULE_ID,
    EVENT_CALENDAR_MODULE_ID,
)

DEMO_EMAIL_DOMAIN = "example.lu"
HOME_CLUB_NAME = "Demo Nordlicht Dojang"
LICENSE_TYPE_CODE = "demo-annual"
DEMO_MODULES = (
    CLUB_MANAGEMENT_MODULE_ID,
    COMPETITION_MODULE_ID,
    EVENT_CALENDAR_MODULE_ID,
)

ACCOUNT_SPECS = (
    {
        "key": "ltf_admin",
        "username": "demo_ltf_admin",
        "role": User.Roles.LTF_ADMIN,
        "first_name": "Nora",
        "last_name": "Quill",
        "env_name": "DEMO_LTF_ADMIN_PASSWORD",
        "label": "LTF admin",
    },
    {
        "key": "ltf_finance",
        "username": "demo_ltf_finance",
        "role": User.Roles.LTF_FINANCE,
        "first_name": "Hugo",
        "last_name": "Cedar",
        "env_name": "DEMO_LTF_FINANCE_PASSWORD",
        "label": "LTF finance",
    },
    {
        "key": "club_admin",
        "username": "demo_club_admin",
        "role": User.Roles.CLUB_ADMIN,
        "first_name": "Elise",
        "last_name": "Lantern",
        "env_name": "DEMO_CLUB_ADMIN_PASSWORD",
        "label": "Club admin",
    },
    {
        "key": "club_finance",
        "username": "demo_club_finance",
        "role": User.Roles.CLUB_ADMIN,
        "first_name": "Greta",
        "last_name": "Marble",
        "env_name": "DEMO_CLUB_FINANCE_PASSWORD",
        "label": "Club finance",
        "license_id": "DEMO-0003",
        "license_role": Member.LicenseRole.STAFF,
    },
    {
        "key": "coach",
        "username": "demo_coach",
        "role": User.Roles.COACH,
        "first_name": "Bruno",
        "last_name": "Quill",
        "env_name": "DEMO_COACH_PASSWORD",
        "label": "Coach",
        "license_id": "DEMO-0002",
        "license_role": Member.LicenseRole.COACH,
    },
    {
        "key": "member",
        "username": "demo_member",
        "role": User.Roles.MEMBER,
        "first_name": "Ada",
        "last_name": "Bramble",
        "env_name": "DEMO_MEMBER_PASSWORD",
        "label": "Member",
        "license_id": "DEMO-0001",
        "license_role": Member.LicenseRole.ATHLETE,
    },
)

CLUB_SPECS = (
    {
        "name": HOME_CLUB_NAME,
        "city": "Ettelbruck",
        "locality": "Ettelbruck",
        "postal_code": "9050",
        "address_line1": "12 Rue des Étoiles",
        "email": "club-nordlicht@example.lu",
        "website": "https://nordlicht.example.lu",
    },
    {
        "name": "Demo Moselle Pavilion",
        "city": "Grevenmacher",
        "locality": "Grevenmacher",
        "postal_code": "6776",
        "address_line1": "4 Quai des Lanternes",
        "email": "club-moselle@example.lu",
        "website": "https://moselle-pavilion.example.lu",
        "slug": "moselle",
        "admin_first_name": "David",
        "admin_last_name": "Poplar",
    },
    {
        "name": "Demo Red Lion Club",
        "city": "Differdange",
        "locality": "Differdange",
        "postal_code": "4501",
        "address_line1": "18 Rue du Lion Rouge",
        "email": "club-redlion@example.lu",
        "website": "https://red-lion.example.lu",
        "slug": "red_lion",
        "admin_first_name": "Klara",
        "admin_last_name": "Fern",
    },
    {
        "name": "Demo Three Acorns",
        "city": "Mersch",
        "locality": "Mersch",
        "postal_code": "7526",
        "address_line1": "7 Allée des Glands",
        "email": "club-acorns@example.lu",
        "website": "https://three-acorns.example.lu",
        "slug": "three_acorns",
        "admin_first_name": "Leo",
        "admin_last_name": "Harbour",
    },
    {
        "name": "Demo Valley Poomsae",
        "city": "Wiltz",
        "locality": "Wiltz",
        "postal_code": "9516",
        "address_line1": "21 Chemin de la Vallée",
        "email": "club-valley@example.lu",
        "website": "https://valley-poomsae.example.lu",
        "slug": "valley",
        "admin_first_name": "Mia",
        "admin_last_name": "Lark",
    },
)

GIVEN_NAMES = (
    "Ada", "Bruno", "Chloé", "Greta", "David", "Elise", "Felix", "Iris",
    "Jonas", "Klara", "Leo", "Mia", "Nils", "Olga", "Paul", "Rosa",
)
FAMILY_NAMES = (
    "Bramble", "Quill", "Lantern", "Marble", "Acorn", "Poplar", "Cedar", "Fern",
    "Harbour", "Kindling", "Lark", "Maple", "Nest", "Orchard", "Pebble", "Reed",
)
BELTS = (
    "10th Kup", "9th Kup", "8th Kup", "7th Kup", "6th Kup", "5th Kup",
    "4th Kup", "3rd Kup", "2nd Kup", "1st Kup", "1st Poom", "1st Dan",
    "2nd Dan", "3rd Dan", "4th Dan",
)
LINKED_BY_INDEX = {
    0: "member",
    1: "coach",
    2: "club_finance",
}
INVOICE_SPECS = (
    ("DEMO club fee 1", Decimal("180.00"), Order.Status.PAID, Invoice.Status.PAID),
    ("DEMO club fee 2", Decimal("95.00"), Order.Status.PENDING, Invoice.Status.ISSUED),
    ("DEMO club fee 3", Decimal("40.00"), Order.Status.DRAFT, Invoice.Status.DRAFT),
)


def seed_demo_world(command: BaseCommand) -> None:
    with transaction.atomic():
        users = {spec["key"]: _ensure_user(command, spec) for spec in ACCOUNT_SPECS}
        clubs = [_ensure_club(spec, users["ltf_admin"]) for spec in CLUB_SPECS]
        home = clubs[0]
        home.admins.add(users["club_admin"], users["club_finance"])
        home.trainers.add(users["coach"])
        _ensure_satellite_admins(command, clubs)
        members = _ensure_roster(clubs, users)
        _ensure_licenses(members)
        _ensure_teams(home, members)
        _ensure_equipment(clubs, members)
        _ensure_invoices(home, members[0])
        if _enable_modules(clubs, users["ltf_admin"]):
            _ensure_events(home, users["ltf_admin"])
            command.stdout.write("Calendar module is on. Demo events are ready.")
        else:
            command.stdout.write(
                "Skipped module switches and calendar events because this database "
                "still has clubs that are not demo data."
            )
        command.stdout.write(
            f"Demo data: {len(clubs)} clubs, {len(members)} members, home club {home.name}."
        )
        command.stdout.write(command.style.SUCCESS("Demo data is ready."))


def ensure_demo_accounts(command: BaseCommand) -> None:
    """Attach the fixed demo logins to the existing demo home club."""

    home = Club.objects.filter(is_demo=True, name=HOME_CLUB_NAME).order_by("id").first()
    if home is None:
        home = Club.objects.filter(is_demo=True).order_by("id").first()
    if home is None:
        raise CommandError(
            "No demo club exists. Run python manage.py seed_demo_data on this "
            "empty demo database. Nothing was changed."
        )
    with transaction.atomic():
        users = {spec["key"]: _ensure_user(command, spec) for spec in ACCOUNT_SPECS}
        home.admins.add(users["club_admin"], users["club_finance"])
        home.trainers.add(users["coach"])
        for spec in ACCOUNT_SPECS:
            if spec.get("license_id"):
                _ensure_login_member(users[spec["key"]], home, spec)
        _ensure_satellite_admins(command)
        command.stdout.write(f"Demo club: {home.name} (id {home.id})")
        command.stdout.write(
            "Club finance uses the club admin role. There is no separate club-finance role."
        )
        command.stdout.write(command.style.SUCCESS("Demo accounts are ready."))


def _satellite_admin_spec(club_spec: dict) -> dict:
    slug = club_spec["slug"]
    return {
        "key": f"club_admin_{slug}",
        "username": f"demo_club_admin_{slug}",
        "role": User.Roles.CLUB_ADMIN,
        "first_name": club_spec["admin_first_name"],
        "last_name": club_spec["admin_last_name"],
        "env_name": f"DEMO_CLUB_ADMIN_{slug.upper()}_PASSWORD",
        "label": f"Club admin {club_spec['name']}",
    }


def _ensure_satellite_admins(command: BaseCommand, clubs: list[Club] | None = None) -> None:
    """Give every demo club besides the home club its own fictional administrator."""

    by_name = {club.name: club for club in clubs} if clubs is not None else {}
    for spec in CLUB_SPECS:
        if not spec.get("slug"):
            continue
        club = by_name.get(spec["name"]) if clubs is not None else Club.objects.filter(name=spec["name"]).first()
        if club is None:
            continue
        if not club.is_demo:
            raise CommandError(
                f"Refusing to attach a demo admin to {club.name}: it is not marked as demo data."
            )
        club.admins.add(_ensure_user(command, _satellite_admin_spec(spec)))


def _demo_email(username: str) -> str:
    return f"{username}@{DEMO_EMAIL_DOMAIN}"


def _is_demo_email(email: str) -> bool:
    return str(email or "").strip().lower().endswith(f"@{DEMO_EMAIL_DOMAIN}")


def _ensure_user(command: BaseCommand, spec: dict) -> User:
    username = spec["username"]
    user = User.objects.filter(username=username).first()
    created = user is None
    if user is not None and not _is_demo_email(user.email):
        raise CommandError(
            f"Refusing to change {username}: that account is not a demo login "
            f"(@{DEMO_EMAIL_DOMAIN}). Nothing else in this run will be kept."
        )
    if user is None:
        user = User(username=username, email=_demo_email(username))
    was_unverified = not user.is_email_verified
    if not user.email:
        user.email = _demo_email(username)
    user.role = spec["role"]
    user.is_active = True
    user.is_email_verified = True
    if created or not user.first_name:
        user.first_name = spec["first_name"]
    if created or not user.last_name:
        user.last_name = spec["last_name"]
    password, source = _password(spec["env_name"], created=created, was_unverified=was_unverified)
    if password is not None:
        user.set_password(password)
    user.save()
    _verify_email(user)
    state = "created" if created else "updated"
    command.stdout.write(f"{spec['label']}: {user.username} ({state}, role {user.role})")
    if source == "generated" and password is not None:
        command.stdout.write(f"  password: {password}")
    elif source == "env":
        command.stdout.write(f"  password: set from {spec['env_name']}")
    else:
        command.stdout.write("  password: unchanged")
    return user


def _password(env_name: str, *, created: bool, was_unverified: bool) -> tuple[str | None, str]:
    configured = os.environ.get(env_name, "").strip()
    if configured:
        return configured, "env"
    if created or was_unverified:
        return secrets.token_urlsafe(18), "generated"
    return None, "unchanged"


def _verify_email(user: User) -> None:
    address, _created = EmailAddress.objects.get_or_create(
        user=user,
        email=user.email,
        defaults={"verified": True, "primary": True},
    )
    if not address.verified or not address.primary:
        address.verified = True
        address.primary = True
        address.save(update_fields=["verified", "primary"])


def _ensure_club(spec: dict, created_by: User) -> Club:
    club = Club.objects.filter(name=spec["name"]).first()
    if club is not None and not club.is_demo:
        raise CommandError(
            f"Refusing to change club {spec['name']}: it is not marked as demo data."
        )
    if club is None:
        club = Club(name=spec["name"], created_by=created_by)
    club.city = spec["city"]
    club.locality = spec["locality"]
    club.postal_code = spec["postal_code"]
    club.address_line1 = spec["address_line1"]
    club.email = spec["email"]
    club.website = spec["website"]
    club.is_active = True
    club.is_demo = True
    club.full_clean()
    club.save()
    return club


def _roster_rows() -> list[dict]:
    linked_names = {
        (spec["first_name"], spec["last_name"])
        for spec in ACCOUNT_SPECS
        if spec.get("license_id")
    }
    rows = []
    seen = set(linked_names)
    for index in range(48):
        link_key = LINKED_BY_INDEX.get(index)
        if link_key:
            spec = next(item for item in ACCOUNT_SPECS if item["key"] == link_key)
            first, last, sex = spec["first_name"], spec["last_name"], "F" if index != 1 else "M"
            role = spec["license_role"]
            email = _demo_email(spec["username"])
        else:
            first = GIVEN_NAMES[index % len(GIVEN_NAMES)]
            last = FAMILY_NAMES[(index * 3 + index // len(GIVEN_NAMES)) % len(FAMILY_NAMES)]
            step = 0
            while (first, last) in seen and step < len(FAMILY_NAMES):
                step += 1
                last = FAMILY_NAMES[(index * 3 + index // len(GIVEN_NAMES) + step) % len(FAMILY_NAMES)]
            if (first, last) in seen:
                last = f"{last} {index + 1}"
            sex = "F" if index % 2 == 0 else "M"
            role = Member.LicenseRole.ATHLETE
            email = f"demo.member.{index + 1:04d}@{DEMO_EMAIL_DOMAIN}"
        seen.add((first, last))
        year = 1968 + ((index * 11) % 49)
        rows.append(
            {
                "index": index,
                "first_name": first,
                "last_name": last,
                "sex": sex,
                "role": role,
                "email": email,
                "license_id": f"DEMO-{index + 1:04d}",
                "belt": BELTS[index % len(BELTS)],
                "dob": date(year, (index % 12) + 1, (index % 27) + 1),
                "club_index": 0 if index < 24 else 1 + (index - 24) // 6,
                "link_key": link_key,
                "license_kind": ("expired", "pending", "expiring", "active")[index % 4],
            }
        )
    return rows


def _ensure_roster(clubs: list[Club], users: dict[str, User]) -> list[Member]:
    members = []
    for row in _roster_rows():
        member = _ensure_member_row(
            club=clubs[row["club_index"]],
            user=users[row["link_key"]] if row["link_key"] else None,
            first_name=row["first_name"],
            last_name=row["last_name"],
            sex=row["sex"],
            email=row["email"],
            license_id=row["license_id"],
            belt=row["belt"],
            dob=row["dob"],
            role=row["role"],
        )
        members.append(member)
    return members


def _ensure_login_member(user: User, club: Club, spec: dict) -> Member:
    return _ensure_member_row(
        club=club,
        user=user,
        first_name=spec["first_name"],
        last_name=spec["last_name"],
        sex="M" if spec["key"] == "coach" else "F",
        email=_demo_email(spec["username"]),
        license_id=spec["license_id"],
        belt="2nd Dan" if spec["key"] == "coach" else "1st Kup",
        dob=date(1991, 4, 12),
        role=spec["license_role"],
    )


def _ensure_member_row(
    *,
    club: Club,
    user: User | None,
    first_name: str,
    last_name: str,
    sex: str,
    email: str,
    license_id: str,
    belt: str,
    dob: date,
    role: str,
) -> Member:
    if not club.is_demo:
        raise CommandError(f"Refusing to attach demo members to {club.name}: it is not demo data.")
    by_user = Member.objects.filter(user=user).first() if user is not None else None
    by_id = Member.objects.filter(ltf_licenseid=license_id).first()
    for existing in (by_user, by_id):
        if existing is not None and not existing.is_demo:
            raise CommandError(
                f"Refusing to change member {existing.pk}: that member is not demo data."
            )
    if by_user is not None and by_id is not None and by_user.pk != by_id.pk:
        raise CommandError(
            f"Refusing to merge two demo members for {license_id}. Nothing else in this run will be kept."
        )
    member = by_user or by_id
    if member is None:
        member = Member(ltf_licenseid=license_id)
    if user is not None and member.user_id and member.user_id != user.id:
        raise CommandError(
            f"Refusing to move {license_id} onto {user.username}: it already belongs to another login."
        )
    member.user = user
    member.club = club
    member.first_name = first_name
    member.last_name = last_name
    member.sex = sex
    member.email = email
    member.ltf_licenseid = license_id
    member.date_of_birth = dob
    member.belt_rank = belt
    member.primary_license_role = role
    member.is_active = True
    member.is_demo = True
    member.save()
    return member


def _license_dates(kind: str) -> tuple[str, int, date, date]:
    today = timezone.localdate()
    if kind == "expired":
        year = today.year - 1
        return License.Status.EXPIRED, year, date(year, 1, 1), date(year, 12, 31)
    if kind == "pending":
        year = today.year
        return License.Status.PENDING, year, date(year, 1, 1), date(year, 12, 31)
    if kind == "expiring":
        end = today + timedelta(days=20)
        start = date(today.year, 1, 1)
        if start > end:
            start = end - timedelta(days=30)
        return License.Status.ACTIVE, today.year, start, end
    return License.Status.ACTIVE, today.year, date(today.year, 1, 1), date(today.year, 12, 31)


def _ensure_licenses(members: list[Member]) -> None:
    license_type, _created = LicenseType.objects.get_or_create(
        code=LICENSE_TYPE_CODE,
        defaults={"name": "Demo annual licence"},
    )
    kinds = {row["license_id"]: row["license_kind"] for row in _roster_rows()}
    for member in members:
        status, year, start, end = _license_dates(kinds.get(member.ltf_licenseid, "active"))
        license_row = (
            License.objects.filter(member=member, license_type=license_type).order_by("id").first()
        )
        if license_row is None:
            license_row = License(member=member, license_type=license_type)
        license_row.club = member.club
        license_row.year = year
        license_row.start_date = start
        license_row.end_date = end
        license_row.status = status
        license_row.save()


def _ensure_teams(home: Club, members: list[Member]) -> None:
    home_members = [member for member in members if member.club_id == home.id]
    cadets, _created = ClubTeam.objects.get_or_create(
        club=home,
        name="Demo Cadets",
        defaults={
            "discipline": ClubTeam.Discipline.KYORUGI,
            "pss_system": ClubTeam.Pss.DAEDO,
            "note": "Fictional demo squad",
        },
    )
    poomsae, _created = ClubTeam.objects.get_or_create(
        club=home,
        name="Demo Poomsae",
        defaults={
            "discipline": ClubTeam.Discipline.POOMSAE,
            "note": "Fictional demo squad",
        },
    )
    for member in home_members:
        number = int(member.ltf_licenseid.split("-")[-1])
        if member.primary_license_role == Member.LicenseRole.COACH or 4 <= number <= 11:
            role = (
                ClubTeamMembership.Role.COACH
                if member.primary_license_role == Member.LicenseRole.COACH
                else ClubTeamMembership.Role.ATHLETE
            )
            ClubTeamMembership.objects.get_or_create(
                team=cadets, member=member, defaults={"role": role}
            )
        if 12 <= number <= 17:
            ClubTeamMembership.objects.get_or_create(
                team=poomsae,
                member=member,
                defaults={"role": ClubTeamMembership.Role.ATHLETE},
            )


def _ensure_equipment(clubs: list[Club], members: list[Member]) -> None:
    for club in clubs:
        seed_default_clothing(club)
    for member in members:
        number = int(member.ltf_licenseid.split("-")[-1])
        if number <= 6:
            MemberGear.objects.update_or_create(
                member=member,
                defaults={
                    "daedo_sock": "M",
                    "daedo_glove": "S",
                    "daedo_hogu": "S",
                    "daedo_head": "M",
                    "chest": "M",
                    "headgear": "M",
                    "shin": "M",
                    "forearm": "S",
                    "groin": "M",
                    "mouthguard": "youth" if member.date_of_birth and member.date_of_birth.year >= 2008 else "adult",
                },
            )
        if number <= 8 and member.club_id:
            item = ClubClothingItem.objects.filter(club_id=member.club_id, name="Dobok").first()
            if item is None:
                continue
            size = item.sizes.order_by("position", "id").first()
            if size is None:
                continue
            MemberClothingValue.objects.get_or_create(
                member=member,
                item=item,
                defaults={"item_name": item.name, "label": size.label},
            )


def _ensure_invoices(home: Club, member: Member) -> None:
    now = timezone.now()
    for description, amount, order_status, invoice_status in INVOICE_SPECS:
        existing = (
            OrderItem.objects.filter(description=description, order__club=home)
            .select_related("order")
            .first()
        )
        if existing is not None:
            continue
        order = Order.objects.create(
            ledger=Order.Ledger.CLUB,
            club=home,
            member=member,
            status=order_status,
            subtotal=amount,
            total=amount,
        )
        OrderItem.objects.create(
            order=order,
            description=description,
            price_snapshot=amount,
            quantity=1,
            billing_club=home,
        )
        issued_at = now if invoice_status != Invoice.Status.DRAFT else None
        paid_at = now if invoice_status == Invoice.Status.PAID else None
        Invoice.objects.create(
            order=order,
            club=home,
            member=member,
            status=invoice_status,
            subtotal=amount,
            total=amount,
            issued_at=issued_at,
            paid_at=paid_at,
            bill_to_name="Demo Nordlicht Dojang",
            bill_to_email="club-nordlicht@example.lu",
            bill_to_address="12 Rue des Étoiles, 9050 Ettelbruck",
        )


def _enable_modules(clubs: list[Club], actor: User) -> bool:
    if Club.objects.filter(is_demo=False).exists():
        return False
    for module_id in DEMO_MODULES:
        entitlement, _created = InstallEntitlement.objects.get_or_create(
            module_id=module_id,
            defaults={"active": True},
        )
        if not entitlement.active:
            entitlement.active = True
            entitlement.save(update_fields=["active", "updated_at"])
        for club in clubs:
            ClubModuleAssignment.objects.update_or_create(
                club=club,
                module_id=module_id,
                defaults={"enabled": True, "assigned_by": actor},
            )
    return True


def _ensure_events(home: Club, actor: User) -> None:
    windows = {
        "Demo Open Poomsae Day": (21, 8),
        "Demo Nordlicht evening training": (7, 2),
        "Demo Cadet kyorugi meet": (35, 6),
    }
    specs = (
        {
            "title": "Demo Open Poomsae Day",
            "kind": Event.Kind.POOMSAE,
            "owner_scope": Event.OwnerScope.FEDERATION,
            "club": None,
            "visibility": Event.Visibility.PUBLIC,
            "venue_name": "Demo Hall",
            "venue_address": "1 Place des Fables, Luxembourg",
        },
        {
            "title": "Demo Nordlicht evening training",
            "kind": Event.Kind.CALENDAR,
            "owner_scope": Event.OwnerScope.CLUB,
            "club": home,
            "visibility": Event.Visibility.INTERNAL,
            "venue_name": HOME_CLUB_NAME,
            "venue_address": "12 Rue des Étoiles, Ettelbruck",
        },
        {
            "title": "Demo Cadet kyorugi meet",
            "kind": Event.Kind.KYORUGI,
            "owner_scope": Event.OwnerScope.CLUB,
            "club": home,
            "visibility": Event.Visibility.SHARED,
            "venue_name": "Demo Sports Hall",
            "venue_address": "4 Quai des Lanternes, Grevenmacher",
        },
    )
    for spec in specs:
        start, end = _event_window(*windows[spec["title"]])
        event = Event.objects.filter(title=spec["title"]).first()
        if event is None:
            event = Event(title=spec["title"], created_by=actor)
        event.description = "Fictional event for the demo environment."
        event.kind = spec["kind"]
        event.owner_scope = spec["owner_scope"]
        event.club = spec["club"]
        event.visibility = spec["visibility"]
        event.venue_name = spec["venue_name"]
        event.venue_address = spec["venue_address"]
        event.starts_at = start
        event.ends_at = end
        event.full_clean()
        event.save()


def _event_window(offset_days: int, hours: int):
    start = timezone.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=offset_days)
    return start, start + timedelta(hours=hours)
