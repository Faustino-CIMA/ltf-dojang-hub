from django.apps import AppConfig


class ClubmgmtConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "clubmgmt"
    verbose_name = "Club management"

    def ready(self):
        from django.db.models.signals import post_save, pre_delete, pre_save

        from clubs.models import Club, TrainingVenue
        from members.models import Member

        from .models import CommitteeMandate, Person
        from .teams import log_memberships_before_member_delete
        from .training import remember_series_place_for_venue

        post_save.connect(_sync_office_grant, sender=CommitteeMandate, dispatch_uid="office_grant_mandate")
        pre_save.connect(_note_office_user_link, sender=Member, dispatch_uid="office_grant_member_user_note")
        post_save.connect(_sync_member_office_grants, sender=Member, dispatch_uid="office_grant_member_user")
        pre_save.connect(_note_office_user_link, sender=Person, dispatch_uid="office_grant_person_user_note")
        post_save.connect(_sync_person_office_grants, sender=Person, dispatch_uid="office_grant_person_user")

        pre_delete.connect(log_memberships_before_member_delete, sender=Member, dispatch_uid="club_team_member_delete")
        post_save.connect(_seed_club_clothing, sender=Club, dispatch_uid="club_clothing_defaults")
        post_save.connect(
            remember_series_place_for_venue,
            sender=TrainingVenue,
            dispatch_uid="training_series_venue_rename",
        )
        pre_delete.connect(
            remember_series_place_for_venue,
            sender=TrainingVenue,
            dispatch_uid="training_series_venue_delete",
        )


def _sync_office_grant(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return
    from accounts.offices import sync_mandate

    sync_mandate(instance)


def _note_office_user_link(sender, instance, **kwargs):
    from accounts.offices import note_user_link

    note_user_link(instance, update_fields=kwargs.get("update_fields"), raw=bool(kwargs.get("raw")))


def _sync_member_office_grants(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return
    from accounts.offices import sync_member

    _apply_user_link(instance, sync_member)


def _sync_person_office_grants(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return
    from accounts.offices import sync_person

    _apply_user_link(instance, sync_person)


def _apply_user_link(instance, sync) -> None:
    changed = bool(getattr(instance, "_office_user_changed", False))
    if changed:
        sync(instance.pk, actor=getattr(instance, "_office_actor", None))
    if changed or not hasattr(instance, "_loaded_user_id"):
        instance._loaded_user_id = instance.user_id
    instance._office_user_changed = False


def _seed_club_clothing(sender, instance, created, **kwargs):
    if not created:
        return
    from django.db import connection

    if "clubmgmt_clubclothingitem" not in connection.introspection.table_names():
        return
    from .clothing import seed_default_clothing

    seed_default_clothing(instance)
