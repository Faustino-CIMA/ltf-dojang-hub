"""Federation offices open desks. Club offices do not. The link from a contact to a login is explicit."""

from __future__ import annotations

from django.utils import timezone

from .models import DeskGrant, OfficeDeskMap

FEDERATION = "federation"
ELEVATED = frozenset({DeskGrant.Desk.LTF_ADMIN, DeskGrant.Desk.LTF_FINANCE, DeskGrant.Desk.CLUB_ADMIN})


def _today():
    return timezone.localdate()


def _audit(action: str, grant, message: str, extra: dict | None = None, actor=None) -> None:
    from ops.models import OpsAuditLog

    metadata = {
        "user_id": grant.user_id,
        "desk": grant.desk,
        "level": grant.level,
        "source": grant.source,
        "club_id": grant.club_id,
        "mandate_id": grant.mandate_id,
        "valid_from": grant.valid_from.isoformat() if grant.valid_from else None,
        "valid_until": grant.valid_until.isoformat() if grant.valid_until else None,
    }
    if extra:
        metadata.update(extra)
    OpsAuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type="desk_grant",
        target_id=str(grant.pk),
        message=message,
        metadata=metadata,
    )


def holder_user_id(mandate) -> int | None:
    """Login that holds this term, or none.

    Parked imports stay off the member list, so they do not receive a desk.
    An inactive member is still a member and keeps whatever the office map allows.
    The lookup uses every member row, including parked ones, so a parked import
    is refused on purpose rather than missed by the filtered manager.
    """
    if mandate.member_id:
        from members.models import Member

        row = (
            Member.all_objects.filter(pk=mandate.member_id)
            .values_list("user_id", "import_status")
            .first()
        )
        if row is None:
            return None
        user_id, import_status = row
        if import_status == Member.ImportStatus.PARKED:
            return None
        return user_id
    if mandate.person_id:
        from clubmgmt.models import Person

        return Person.objects.filter(pk=mandate.person_id).values_list("user_id", flat=True).first()
    return None


def _end(grant, until, actor=None) -> None:
    if grant.valid_until is not None and grant.valid_until <= until:
        return
    grant.valid_until = until
    grant.save(update_fields=["valid_until"])
    _audit("desk.grant_ended", grant, "Office desk grant ended.", actor=actor)


def sync_mandate(mandate, actor=None) -> None:
    """Make this term's grants match the office map and the term dates.

    One office grant exists per term, desk, and level. An ended row is reopened
    and pointed at the current holder instead of inserting a second row.
    """
    committee = mandate.committee
    desired: list[tuple[str, str]] = []
    user_id = None
    if committee.scope == FEDERATION:
        user_id = holder_user_id(mandate)
        if user_id:
            desired = list(
                OfficeDeskMap.objects.filter(office=mandate.role).values_list("desk", "level")
            )
    existing = list(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate_id=mandate.id))
    wanted = {(desk, level) for desk, level in desired}
    by_key: dict[tuple[str, str], DeskGrant] = {}
    for grant in existing:
        by_key.setdefault((grant.desk, grant.level), grant)
    today = _today()
    if user_id:
        for desk, level in desired:
            grant = by_key.get((desk, level))
            if grant is None:
                grant = DeskGrant.objects.create(
                    user_id=user_id,
                    desk=desk,
                    level=level,
                    source=DeskGrant.Source.OFFICE,
                    valid_from=mandate.started_on,
                    valid_until=mandate.ended_on,
                    mandate_id=mandate.id,
                    reason="Office",
                )
                by_key[(desk, level)] = grant
                _audit("desk.grant_created", grant, "Office desk grant.", actor=actor)
                continue
            if (
                grant.user_id != user_id
                or grant.valid_from != mandate.started_on
                or grant.valid_until != mandate.ended_on
            ):
                before_user_id = grant.user_id
                grant.user_id = user_id
                grant.valid_from = mandate.started_on
                grant.valid_until = mandate.ended_on
                grant.save(update_fields=["user", "valid_from", "valid_until"])
                _audit(
                    "desk.grant_updated",
                    grant,
                    "Office desk grant updated.",
                    extra={"before_user_id": before_user_id},
                    actor=actor,
                )
    for grant in existing:
        if user_id is None or (grant.desk, grant.level) not in wanted:
            _end(grant, mandate.ended_on or today, actor=actor)


def sync_office(office: str, actor=None) -> None:
    from clubmgmt.models import CommitteeMandate

    mandates = CommitteeMandate.objects.select_related("committee").filter(
        committee__scope=FEDERATION,
        role=office,
    )
    for mandate in mandates:
        sync_mandate(mandate, actor=actor)


def sync_person(person_id: int, actor=None) -> None:
    from clubmgmt.models import CommitteeMandate

    mandates = CommitteeMandate.objects.select_related("committee").filter(person_id=person_id)
    for mandate in mandates:
        sync_mandate(mandate, actor=actor)


def sync_member(member_id: int, actor=None) -> None:
    """Resync this member's terms, and the contact they were converted from."""
    from clubmgmt.models import CommitteeMandate, Person

    mandates = CommitteeMandate.objects.select_related("committee").filter(member_id=member_id)
    for mandate in mandates:
        sync_mandate(mandate, actor=actor)
    person_id = Person.objects.filter(converted_member_id=member_id).values_list("id", flat=True).first()
    if person_id:
        sync_person(person_id, actor=actor)


def remember_loaded_user(instance, field_names) -> None:
    """Keep the login this row was loaded with, so a later save can compare it."""
    if "user_id" in field_names:
        instance._loaded_user_id = instance.user_id


def note_user_link(instance, *, update_fields, raw: bool) -> None:
    """Mark a save that changes the login. A save that leaves it alone does not query."""
    instance._office_user_changed = False
    if raw:
        return
    if update_fields is not None and "user" not in update_fields and "user_id" not in update_fields:
        return
    if not instance.pk:
        instance._office_user_changed = bool(instance.user_id)
        return
    if hasattr(instance, "_loaded_user_id"):
        instance._office_user_changed = instance._loaded_user_id != instance.user_id
        return
    model = type(instance)
    manager = getattr(model, "all_objects", model._default_manager)
    previous = manager.filter(pk=instance.pk).values_list("user_id", flat=True).first()
    instance._office_user_changed = previous != instance.user_id

