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
    if mandate.member_id:
        from members.models import Member

        return Member.objects.filter(pk=mandate.member_id).values_list("user_id", flat=True).first()
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
    """Make this term's grants match the office map and the term dates."""
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
    kept = set()
    today = _today()
    for grant in existing:
        key = (grant.desk, grant.level)
        if user_id is None or key not in wanted or grant.user_id != user_id:
            _end(grant, mandate.ended_on or today, actor=actor)
            continue
        kept.add(key)
        if grant.valid_from != mandate.started_on or grant.valid_until != mandate.ended_on:
            grant.valid_from = mandate.started_on
            grant.valid_until = mandate.ended_on
            grant.save(update_fields=["valid_from", "valid_until"])
    for desk, level in desired:
        if (desk, level) in kept:
            continue
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
        _audit("desk.grant_created", grant, "Office desk grant.", actor=actor)


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
