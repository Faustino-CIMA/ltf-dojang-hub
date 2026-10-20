from django.apps import AppConfig


class ClubmgmtConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "clubmgmt"
    verbose_name = "Club management"

    def ready(self):
        from django.db.models.signals import pre_delete

        from members.models import Member

        from .teams import log_memberships_before_member_delete

        pre_delete.connect(log_memberships_before_member_delete, sender=Member, dispatch_uid="club_team_member_delete")
