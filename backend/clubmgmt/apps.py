from django.apps import AppConfig


class ClubmgmtConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "clubmgmt"
    verbose_name = "Club management"

    def ready(self):
        from django.db.models.signals import post_save, pre_delete

        from clubs.models import Club
        from members.models import Member

        from .teams import log_memberships_before_member_delete

        pre_delete.connect(log_memberships_before_member_delete, sender=Member, dispatch_uid="club_team_member_delete")
        post_save.connect(_seed_club_clothing, sender=Club, dispatch_uid="club_clothing_defaults")


def _seed_club_clothing(sender, instance, created, **kwargs):
    if not created:
        return
    from django.db import connection

    if "clubmgmt_clubclothingitem" not in connection.introspection.table_names():
        return
    from .clothing import seed_default_clothing

    seed_default_clothing(instance)
